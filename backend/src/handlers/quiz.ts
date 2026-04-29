/**
 * quiz Lambda handler.
 *
 * Routes:
 *   POST /quiz/start  — start a new quiz round
 *   POST /quiz/answer — submit an answer
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
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
const QUIZ_SCORES_TABLE = process.env.QUIZ_SCORES_TABLE ?? 'QuizScores';
const QUOTE_LIBRARY_TABLE = process.env.QUOTE_LIBRARY_TABLE ?? 'QuoteLibrary';
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME ?? 'colleague-voice-bot-audio';
const SAGEMAKER_ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME ?? 'colleague-voice-bot-endpoint';

const PRESIGNED_URL_EXPIRY_SECONDS = 24 * 60 * 60;
const CACHE_TTL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QuizStartBody {
  nickname?: string;
}

interface QuizAnswerBody {
  roundId: string;
  guess: string;
  nickname?: string;
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
// Synthesis helper (mirrors synthesize.ts logic)
// ---------------------------------------------------------------------------
async function synthesizeText(
  text: string,
  colleagueId: string,
  sampleKeys: string[],
  language: string,
  singing: boolean,
): Promise<{ audioUrl: string; durationSeconds: number }> {
  const cacheKey = computeCacheKey(text, colleagueId, language, singing);

  const cacheResult = await withRetry(() =>
    docClient.send(
      new GetCommand({ TableName: SYNTHESIS_CACHE_TABLE, Key: { cacheKey } }),
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
  const smResponse = await sagemakerClient.send(
    new InvokeEndpointCommand({
      EndpointName: SAGEMAKER_ENDPOINT_NAME,
      ContentType: 'application/json',
      Body: Buffer.from(
        JSON.stringify({ text, speaker_wav_keys: sampleKeys, language, singing }),
      ),
    }),
  );

  const smData: SageMakerResponse = smResponse.Body
    ? JSON.parse(Buffer.from(smResponse.Body).toString('utf-8'))
    : null;

  const audioBuffer = Buffer.from(smData.audio_base64, 'base64');
  const durationSeconds = smData.duration_seconds;

  const s3Key = `synthesized/${colleagueId}/${cacheKey}.wav`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: AUDIO_BUCKET_NAME,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/wav',
    }),
  );

  const ttl = nowEpoch + CACHE_TTL_SECONDS;
  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: SYNTHESIS_CACHE_TABLE,
        Item: { cacheKey, s3Key, createdAt: nowEpoch, ttl, durationSeconds },
      }),
    ),
  );

  const audioUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: AUDIO_BUCKET_NAME, Key: s3Key }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
  );

  return { audioUrl, durationSeconds };
}

// ---------------------------------------------------------------------------
// POST /quiz/start
// ---------------------------------------------------------------------------
async function handleQuizStart(body: QuizStartBody): Promise<APIGatewayProxyResultV2> {
  const nickname = body.nickname ?? 'anonymous';

  // 1. Scan VoiceProfiles for all colleagues
  const profilesScan = await withRetry(() =>
    docClient.send(new ScanCommand({ TableName: VOICE_PROFILES_TABLE })),
  );

  const allProfiles = profilesScan.Items ?? [];
  const readyProfiles = allProfiles.filter((p) => p.status === 'ready');

  if (readyProfiles.length === 0) {
    throw new NotReadyError('No colleagues have a ready voice profile. Please build profiles first.');
  }

  // 2. Pick a random ready colleague
  const selectedProfile = readyProfiles[Math.floor(Math.random() * readyProfiles.length)];
  const colleagueId: string = selectedProfile.colleagueId;
  const sampleKeys: string[] = Array.isArray(selectedProfile.sampleKeys)
    ? selectedProfile.sampleKeys
    : [];

  // 3. Scan QuoteLibrary for a random quote
  const quotesScan = await withRetry(() =>
    docClient.send(new ScanCommand({ TableName: QUOTE_LIBRARY_TABLE })),
  );

  // Filter out the :recent tracking items
  const allQuotes = (quotesScan.Items ?? []).filter(
    (item) => item.quoteId && !String(item.quoteId).endsWith(':recent'),
  );

  if (allQuotes.length === 0) {
    throw new Error('Quote library is empty');
  }

  const selectedQuote = allQuotes[Math.floor(Math.random() * allQuotes.length)];

  // 4. Randomly decide mode: spoken (70%) or singing (30%)
  const mode: 'spoken' | 'singing' = Math.random() < 0.7 ? 'spoken' : 'singing';
  const singing = mode === 'singing';

  // 5. Synthesize the quote
  const { audioUrl, durationSeconds } = await synthesizeText(
    selectedQuote.text,
    colleagueId,
    sampleKeys,
    'en',
    singing,
  );

  // 6. Generate roundId and store round in QuizScores
  const roundId = randomUUID();
  const now = new Date().toISOString();

  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: QUIZ_SCORES_TABLE,
        Item: {
          entryId: roundId,
          colleagueId,
          quoteId: selectedQuote.quoteId,
          mode,
          audioUrl,
          answered: false,
          nickname,
          score: 0,
          gamesPlayed: 0,
          leaderboard: 'global',
          updatedAt: now,
        },
      }),
    ),
  );

  // 7. Build options list from all profiles (all 7 colleagues)
  const options = allProfiles.map((p) => ({
    colleagueId: p.colleagueId,
    displayName: p.displayName ?? p.colleagueId,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId, audioUrl, options, mode, durationSeconds }),
  };
}

// ---------------------------------------------------------------------------
// POST /quiz/answer
// ---------------------------------------------------------------------------
async function handleQuizAnswer(body: QuizAnswerBody): Promise<APIGatewayProxyResultV2> {
  const { roundId, guess, nickname } = body;

  if (!roundId || typeof roundId !== 'string' || roundId.trim() === '') {
    throw new ValidationError('roundId is required', 'roundId', 'required');
  }
  if (!guess || typeof guess !== 'string' || guess.trim() === '') {
    throw new ValidationError('guess is required', 'guess', 'required');
  }

  // 1. Get round from QuizScores
  const roundResult = await withRetry(() =>
    docClient.send(
      new GetCommand({ TableName: QUIZ_SCORES_TABLE, Key: { entryId: roundId } }),
    ),
  );

  if (!roundResult.Item) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ROUND_NOT_FOUND', message: `Round "${roundId}" not found.` }),
    };
  }

  const round = roundResult.Item;

  // 2. Check if already answered
  if (round.answered === true) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'ALREADY_ANSWERED',
        message: `Round "${roundId}" has already been answered.`,
      }),
    };
  }

  // 3. Evaluate guess
  const correct = guess === round.colleagueId;
  const now = new Date().toISOString();

  // 4. Mark round as answered
  await withRetry(() =>
    docClient.send(
      new UpdateCommand({
        TableName: QUIZ_SCORES_TABLE,
        Key: { entryId: roundId },
        UpdateExpression: 'SET answered = :answered, updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':answered': true, ':updatedAt': now },
      }),
    ),
  );

  // 5. Update leaderboard score if correct
  let score = 0;
  if (correct) {
    const effectiveNickname = nickname ?? round.nickname ?? 'anonymous';

    // Scan for existing leaderboard entry for this nickname
    const leaderboardScan = await withRetry(() =>
      docClient.send(
        new ScanCommand({
          TableName: QUIZ_SCORES_TABLE,
          FilterExpression: 'nickname = :nickname AND leaderboard = :lb AND answered = :answered',
          ExpressionAttributeValues: {
            ':nickname': effectiveNickname,
            ':lb': 'global',
            ':answered': false,
          },
        }),
      ),
    );

    const existingEntries = leaderboardScan.Items ?? [];

    if (existingEntries.length > 0) {
      // Update existing leaderboard entry
      const entry = existingEntries[0];
      score = (entry.score ?? 0) + 1;
      await withRetry(() =>
        docClient.send(
          new UpdateCommand({
            TableName: QUIZ_SCORES_TABLE,
            Key: { entryId: entry.entryId },
            UpdateExpression:
              'SET score = :score, gamesPlayed = :gamesPlayed, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':score': score,
              ':gamesPlayed': (entry.gamesPlayed ?? 0) + 1,
              ':updatedAt': now,
            },
          }),
        ),
      );
    } else {
      // Create new leaderboard entry
      score = 1;
      const entryId = randomUUID();
      await withRetry(() =>
        docClient.send(
          new PutCommand({
            TableName: QUIZ_SCORES_TABLE,
            Item: {
              entryId,
              nickname: effectiveNickname,
              score,
              gamesPlayed: 1,
              leaderboard: 'global',
              answered: false,
              updatedAt: now,
            },
          }),
        ),
      );
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correct, correctColleagueId: round.colleagueId, score }),
  };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === 'POST' && path.endsWith('/quiz/start')) {
      const body: QuizStartBody = event.body ? JSON.parse(event.body) : {};
      return await handleQuizStart(body);
    }

    if (method === 'POST' && path.endsWith('/quiz/answer')) {
      if (!event.body) {
        throw new ValidationError('Request body is required', 'body', 'required');
      }
      const body: QuizAnswerBody = JSON.parse(event.body);
      return await handleQuizAnswer(body);
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'NOT_FOUND' }),
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
    console.error('Unhandled error in quiz handler', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR' }),
    };
  }
};
