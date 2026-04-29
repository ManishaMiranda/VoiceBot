import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';

import {
  validateTextLength,
  validateSingingTextLength,
  validateLanguageCode,
} from '../utils/validation';
import { computeCacheKey } from '../utils/cacheKey';
import { withRetry } from '../utils/dynamoRetry';
import { ValidationError, NotReadyError } from '../utils/errors';

// ---------------------------------------------------------------------------
// AWS clients
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
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME ?? 'colleague-voice-bot-audio';
const SAGEMAKER_ENDPOINT_NAME = process.env.SAGEMAKER_ENDPOINT_NAME ?? 'colleague-voice-bot-endpoint';

const PRESIGNED_URL_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
const CACHE_TTL_SECONDS = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SynthesizeBody {
  text: string;
  colleagueId: string;
  language: string;
  singing: boolean;
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
// Core synthesis logic
// ---------------------------------------------------------------------------
async function handleSynthesize(
  body: SynthesizeBody,
): Promise<{ audioUrl: string; durationSeconds: number; cached: boolean }> {
  const { text, colleagueId, language, singing } = body;

  // Validate text length
  const textResult = singing ? validateSingingTextLength(text) : validateTextLength(text);
  if (!textResult.valid) {
    throw new ValidationError(textResult.message!, textResult.field, textResult.constraint);
  }

  // Validate language code
  const langResult = validateLanguageCode(language);
  if (!langResult.valid) {
    throw new ValidationError(langResult.message!, langResult.field, langResult.constraint);
  }

  // Get colleague profile — must be ready
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

  // Compute cache key
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
      // Cache hit — generate pre-signed URL
      const audioUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: AUDIO_BUCKET_NAME,
          Key: cached.s3Key,
        }),
        { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
      );
      return { audioUrl, durationSeconds: cached.durationSeconds, cached: true };
    }
  }

  // Cache miss — invoke SageMaker
  const sampleKeys: string[] = Array.isArray(profile.sampleKeys) ? profile.sampleKeys : [];

  const sagemakerPayload = {
    text,
    speaker_wav_keys: sampleKeys,
    language,
    singing,
  };

  const smResponse = await sagemakerClient.send(
    new InvokeEndpointCommand({
      EndpointName: SAGEMAKER_ENDPOINT_NAME,
      ContentType: 'application/json',
      Body: Buffer.from(JSON.stringify(sagemakerPayload)),
    }),
  );

  // Parse SageMaker response
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
        Item: {
          cacheKey,
          s3Key,
          createdAt: nowEpoch,
          ttl,
          durationSeconds,
        },
      }),
    ),
  );

  // Generate pre-signed URL (24h)
  const audioUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: AUDIO_BUCKET_NAME,
      Key: s3Key,
    }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
  );

  return { audioUrl, durationSeconds, cached: false };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (!event.body) {
      throw new ValidationError('Request body is required', 'body', 'required');
    }
    const body: SynthesizeBody = JSON.parse(event.body);
    const result = await handleSynthesize(body);
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
    console.error('Unhandled error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR' }),
    };
  }
};
