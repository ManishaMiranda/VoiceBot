import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

import { validateAudioFormat, validateDuration } from '../utils/validation';
import { computeChecksum } from '../utils/checksum';
import { withRetry } from '../utils/dynamoRetry';
import { ValidationError, SampleLimitError } from '../utils/errors';
import { getMethod, getPath, getPathParameters } from '../utils/eventHelpers';

// ---------------------------------------------------------------------------
// AWS clients (module-level so they can be replaced in tests via mock)
// ---------------------------------------------------------------------------
const dynamoClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamoClient);
export const s3Client = new S3Client({});

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const VOICE_SAMPLES_TABLE = process.env.VOICE_SAMPLES_TABLE ?? 'VoiceSamples';
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME ?? 'colleague-voice-bot-audio';

const MAX_SAMPLES_PER_COLLEAGUE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UploadSampleBody {
  colleagueId: string;
  format: string;
  durationSeconds: number;
  audioBase64: string;
  uploadedBy: string;
}

// ---------------------------------------------------------------------------
// POST /admin/samples
// ---------------------------------------------------------------------------
async function handleUpload(body: UploadSampleBody): Promise<{ sampleId: string; colleagueId: string }> {
  const { colleagueId, format, durationSeconds, audioBase64, uploadedBy } = body;

  // Validate colleagueId
  if (!colleagueId || typeof colleagueId !== 'string' || colleagueId.trim() === '') {
    throw new ValidationError('colleagueId must be a non-empty string', 'colleagueId', 'required');
  }

  // Validate format
  const formatResult = validateAudioFormat(format);
  if (!formatResult.valid) {
    throw new ValidationError(formatResult.message!, formatResult.field, formatResult.constraint);
  }

  // Validate duration
  const durationResult = validateDuration(durationSeconds);
  if (!durationResult.valid) {
    throw new ValidationError(durationResult.message!, durationResult.field, durationResult.constraint);
  }

  // Count existing samples for this colleague via ColleagueIndex GSI
  const countResult = await withRetry(() =>
    docClient.send(
      new QueryCommand({
        TableName: VOICE_SAMPLES_TABLE,
        IndexName: 'ColleagueIndex',
        KeyConditionExpression: 'colleagueId = :cid',
        ExpressionAttributeValues: { ':cid': colleagueId },
        Select: 'COUNT',
      }),
    ),
  );

  const existingCount = countResult.Count ?? 0;
  if (existingCount >= MAX_SAMPLES_PER_COLLEAGUE) {
    throw new SampleLimitError(
      `Colleague "${colleagueId}" already has ${MAX_SAMPLES_PER_COLLEAGUE} samples. Delete an existing sample before uploading a new one.`,
    );
  }

  // Decode audio bytes and compute checksum
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const checksum = computeChecksum(audioBuffer);

  // Generate sampleId and S3 key
  const sampleId = randomUUID();
  const s3Key = `samples/${colleagueId}/${sampleId}.${format}`;

  // Store file in S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: AUDIO_BUCKET_NAME,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: `audio/${format}`,
    }),
  );

  // Write DynamoDB record
  const uploadedAt = new Date().toISOString();
  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: VOICE_SAMPLES_TABLE,
        Item: {
          sampleId,
          colleagueId,
          s3Key,
          format,
          durationSeconds,
          checksum,
          uploadedAt,
          uploadedBy: uploadedBy ?? '',
        },
      }),
    ),
  );

  return { sampleId, colleagueId };
}

// ---------------------------------------------------------------------------
// DELETE /admin/samples/{sampleId}
// ---------------------------------------------------------------------------
async function handleDelete(sampleId: string): Promise<{ deleted: boolean; sampleId: string }> {
  // Get sample record
  const getResult = await withRetry(() =>
    docClient.send(
      new GetCommand({
        TableName: VOICE_SAMPLES_TABLE,
        Key: { sampleId },
      }),
    ),
  );

  if (!getResult.Item) {
    throw new ValidationError(`Sample "${sampleId}" not found`, 'sampleId', 'exists');
  }

  const { s3Key } = getResult.Item as { s3Key: string };

  // Delete S3 object
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: AUDIO_BUCKET_NAME,
      Key: s3Key,
    }),
  );

  // Delete DynamoDB record
  await withRetry(() =>
    docClient.send(
      new DeleteCommand({
        TableName: VOICE_SAMPLES_TABLE,
        Key: { sampleId },
      }),
    ),
  );

  return { deleted: true, sampleId };
}

// ---------------------------------------------------------------------------
// Route dispatcher
// ---------------------------------------------------------------------------
async function handleRequest(event: APIGatewayProxyEventV2): Promise<unknown> {
  const method = getMethod(event);
  const path = getPath(event);

  if (method === 'POST' && path === '/admin/samples') {
    if (!event.body) {
      throw new ValidationError('Request body is required', 'body', 'required');
    }
    const body: UploadSampleBody = JSON.parse(event.body);
    return handleUpload(body);
  }

  if (method === 'DELETE' && path.startsWith('/admin/samples/')) {
    const sampleId = getPathParameters(event)?.sampleId ?? path.split('/').pop() ?? '';
    if (!sampleId) {
      throw new ValidationError('sampleId path parameter is required', 'sampleId', 'required');
    }
    return handleDelete(sampleId);
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'NOT_FOUND' }) };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const result = await handleRequest(event);
    const statusCode =
      getMethod(event) === 'POST' &&
      getPath(event) === '/admin/samples'
        ? 201
        : 200;
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(err.toResponse()) };
    }
    if (err instanceof SampleLimitError) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(err.toResponse()) };
    }
    console.error('Unhandled error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR' }),
    };
  }
};
