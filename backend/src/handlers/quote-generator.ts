/**
 * quote-generator Lambda handler.
 *
 * Route: POST /quotes/random
 *
 * Selects a non-repeating quote for the requested colleague, synthesizes it
 * using the same SageMaker + S3 + cache pattern as the synthesize handler,
 * and returns the quote text together with a pre-signed audio URL.
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';

import { computeCacheKey } from '../utils/cacheKey';
import { withRetry } from '../utils/dynamoRetry';
import { ValidationError, NotReadyError } from '../utils/errors';
import { selectQuote, updateRecentQuotes } from '../utils/quoteSelector';
import type { Quote } from '../utils/quoteSelector';

// ---------------------------------------------------------------------------
// AWS clients (exported for test mocking)
// ---------------------------------------------------------------------------
const dynamoClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamoClient);
export const s3Client = new S3Client({});
export const sagemakerClient = new SageMakerRuntimeClient({});

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const VOICE_PROFILES_TABLE = process.env.VOICE_PROFILES_TABLE ?? 'VoiceProfiles';
const SYNTHESIS_CACHE_TABLE = process.env.SYNTHESIS_CACHE_TABLE ?? 'SynthesisCache';
const QUOTE_LIBRARY_TABLE = process.env.QUOTE_LIBRARY_TABLE ?? 'QuoteLibrary';
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME ?? 'colleague-voice-bot-audio';
const SAGEMAKER_ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME ?? 'colleague-voice-bot-endpoint';

const PRESIGNED_URL_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
const CACHE_TTL_SECONDS = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QuoteGeneratorBody {
  colleagueId: string;
}

interface SageMakerResponse {
  audio_base64: string;
  sample_rate: number;
  duration_seconds: number;
}

interface SynthesisCacheItem {
  cacheKey: string;
  s3Key: string;
  createdAt: number;
  ttl: number;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Synthesizes text in a colleague's voice, using the cache when available.
 * Mirrors the logic in synthesize.ts handleSynthesize().
 */
async function synthesizeText(
  text: string,
  colleagueId: string,
  sampleKeys: string[],
  language: string,
  singing: boolean,
): Promise<{ audioUrl: string; durationSeconds: number }> {
  const cacheKey = computeCacheKey(text, colleagueId, language, singing);

  // Check cache
  const cacheResult = await withRetry(() =>
    docClient.send(
      new GetCommand({
        TableName: SYNTHESIS_CACHE_TABLE,
        Key: { cacheKey },
      }),
    ),
  );

  const nowEpoch = Math.floor(Date.now() / 1000);

  if (cacheResult.Item) {
    const cached = cacheResult.Item as SynthesisCacheItem;
    if (cached.ttl > nowEpoch) {
      const audioUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: AUDIO_BUCKET_NAME, Key: cached.s3Key }),
        { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
      );
      return { audioUrl, durationSeconds: cached.durationSeconds };
    }
  }

  // Cache miss — invoke SageMaker
  const sagemakerPayload = { text, speaker_wav_keys: sampleKeys, language, singing };

  const smResponse = await sagemakerClient.send(
    new InvokeEndpointCommand({
      EndpointName: SAGEMAKER_ENDPOINT_NAME,
      ContentType: 'application/json',
      Body: Buffer.from(JSON.stringify(sagemakerPayload)),
    }),
  );

  const responseBody = smResponse.Body
    ? JSON.parse(Buffer.from(smResponse.Body).toString('utf-8'))
    : null;

  const smData: SageMakerResponse = responseBody;
  const audioBuffer = Buffer.from(smData.audio_base64, 'base64');
  const durationSeconds = smData.duration_seconds;

  // Store audio in S3
  const s3Key = `synthesized/${colleagueId}/${cacheKey}.wav`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: AUDIO_BUCKET_NAME,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/wav',
    }),
  );

  // Write cache entry
  const ttl = nowEpoch + CACHE_TTL_SECONDS;
  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: SYNTHESIS_CACHE_TABLE,
        Item: { cacheKey, s3Key, createdAt: nowEpoch, ttl, durationSeconds },
      }),
    ),
  );

  // Generate pre-signed URL
  const audioUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: AUDIO_BUCKET_NAME, Key: s3Key }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
  );

  return { audioUrl, durationSeconds };
}

async function handleQuoteGenerator(
  body: QuoteGeneratorBody,
): Promise<{ quoteText: string; audioUrl: string; durationSeconds: number }> {
  const { colleagueId } = body;

  // 1. Validate colleagueId
  if (!colleagueId || typeof colleagueId !== 'string' || colleagueId.trim() === '') {
    throw new ValidationError('colleagueId is required and must be a non-empty string', 'colleagueId', 'required');
  }

  // 2. Get colleague profile — must be ready
  const profileResult = await withRetry(() =>
    docClient.send(
      new GetCommand({
        TableName: VOICE_PROFILES_TABLE,
        Key: { colleagueId },
      }),
    ),
  );

  if (!profileResult.Item || profileResult.Item.status !== 'ready') {
    throw new NotReadyError(
      `Voice profile for colleague "${colleagueId}" is not ready. Current status: ${profileResult.Item?.status ?? 'not found'}.`,
    );
  }

  const profile = profileResult.Item;
  const sampleKeys: string[] = Array.isArray(profile.sampleKeys) ? profile.sampleKeys : [];

  // 3. Scan QuoteLibrary for all quotes
  const quoteScanResult = await withRetry(() =>
    docClient.send(new ScanCommand({ TableName: QUOTE_LIBRARY_TABLE })),
  );

  const allQuotes: Quote[] = (quoteScanResult.Items ?? []) as Quote[];

  if (allQuotes.length === 0) {
    throw new Error('Quote library is empty');
  }

  // 4. Get recent quote IDs for this colleague
  const recentKey = `${colleagueId}:recent`;
  const recentResult = await withRetry(() =>
    docClient.send(
      new GetCommand({
        TableName: QUOTE_LIBRARY_TABLE,
        Key: { quoteId: recentKey },
      }),
    ),
  );

  const recentQuoteIds: string[] = recentResult.Item?.recentIds ?? [];

  // 5. Select non-repeating quote
  const selectedQuote = selectQuote(allQuotes, recentQuoteIds);

  // 6. Update recent quotes in DynamoDB
  const updatedRecentIds = updateRecentQuotes(recentQuoteIds, selectedQuote.quoteId);
  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: QUOTE_LIBRARY_TABLE,
        Item: { quoteId: recentKey, recentIds: updatedRecentIds },
      }),
    ),
  );

  // 7. Synthesize the quote text
  const { audioUrl, durationSeconds } = await synthesizeText(
    selectedQuote.text,
    colleagueId,
    sampleKeys,
    'en',
    false,
  );

  return { quoteText: selectedQuote.text, audioUrl, durationSeconds };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (!event.body) {
      throw new ValidationError('Request body is required', 'body', 'required');
    }
    const body: QuoteGeneratorBody = JSON.parse(event.body);
    const result = await handleQuoteGenerator(body);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err.toResponse()),
      };
    }
    if (err instanceof NotReadyError) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err.toResponse()),
      };
    }
    console.error('Unhandled error in quote-generator', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR' }),
    };
  }
};
