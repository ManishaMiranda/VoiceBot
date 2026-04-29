import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';

import { computeChecksum } from '../utils/checksum';
import { withRetry } from '../utils/dynamoRetry';
import { BuildInProgressError, ChecksumMismatchError, NotReadyError } from '../utils/errors';
import { getMethod, getPath, getPathParameters } from '../utils/eventHelpers';

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
const VOICE_SAMPLES_TABLE = process.env.VOICE_SAMPLES_TABLE ?? 'VoiceSamples';
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME ?? 'colleague-voice-bot-audio';
const SAGEMAKER_ENDPOINT_NAME = process.env.SAGEMAKER_ENDPOINT_NAME ?? 'colleague-voice-bot-endpoint';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VoiceProfile {
  colleagueId: string;
  displayName?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  sampleKeys?: string[];
  profileRef?: string;
  errorDetails?: string;
  updatedAt: string;
  languages?: string[];
}

interface VoiceSample {
  sampleId: string;
  colleagueId: string;
  s3Key: string;
  format: string;
  durationSeconds: number;
  checksum: string;
  uploadedAt: string;
  uploadedBy: string;
}

// ---------------------------------------------------------------------------
// POST /admin/profiles/{colleagueId}/build
// ---------------------------------------------------------------------------
async function handleBuild(colleagueId: string): Promise<{ colleagueId: string; status: string }> {
  // Get or create profile
  const getResult = await withRetry(() =>
    docClient.send(
      new GetCommand({
        TableName: VOICE_PROFILES_TABLE,
        Key: { colleagueId },
      }),
    ),
  );

  let profile: VoiceProfile;
  if (!getResult.Item) {
    // Create with pending status
    profile = {
      colleagueId,
      status: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await withRetry(() =>
      docClient.send(
        new PutCommand({
          TableName: VOICE_PROFILES_TABLE,
          Item: profile,
          ConditionExpression: 'attribute_not_exists(colleagueId)',
        }),
      ),
    );
  } else {
    profile = getResult.Item as VoiceProfile;
  }

  // Reject if already processing
  if (profile.status === 'processing') {
    throw new BuildInProgressError(
      `Profile build for colleague "${colleagueId}" is already in progress.`,
    );
  }

  // Query samples via ColleagueIndex GSI
  const samplesResult = await withRetry(() =>
    docClient.send(
      new QueryCommand({
        TableName: VOICE_SAMPLES_TABLE,
        IndexName: 'ColleagueIndex',
        KeyConditionExpression: 'colleagueId = :cid',
        ExpressionAttributeValues: { ':cid': colleagueId },
      }),
    ),
  );

  const samples = (samplesResult.Items ?? []) as VoiceSample[];
  if (samples.length === 0) {
    throw new NotReadyError(
      `Colleague "${colleagueId}" has no voice samples. Upload at least one sample before building a profile.`,
    );
  }

  // Set status to processing
  await withRetry(() =>
    docClient.send(
      new UpdateCommand({
        TableName: VOICE_PROFILES_TABLE,
        Key: { colleagueId },
        UpdateExpression: 'SET #status = :processing, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':processing': 'processing',
          ':now': new Date().toISOString(),
        },
      }),
    ),
  );

  // Verify checksums for all samples
  for (const sample of samples) {
    const s3Result = await s3Client.send(
      new GetObjectCommand({
        Bucket: AUDIO_BUCKET_NAME,
        Key: sample.s3Key,
      }),
    );

    // Read the stream into a buffer
    const chunks: Uint8Array[] = [];
    if (s3Result.Body) {
      // Body is a ReadableStream / Readable depending on environment
      const body = s3Result.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        chunks.push(chunk);
      }
    }
    const fileBuffer = Buffer.concat(chunks);
    const actualChecksum = computeChecksum(fileBuffer);

    if (actualChecksum !== sample.checksum) {
      // Update status to failed before throwing
      await withRetry(() =>
        docClient.send(
          new UpdateCommand({
            TableName: VOICE_PROFILES_TABLE,
            Key: { colleagueId },
            UpdateExpression: 'SET #status = :failed, errorDetails = :err, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':failed': 'failed',
              ':err': `Checksum mismatch for sample ${sample.sampleId}`,
              ':now': new Date().toISOString(),
            },
          }),
        ),
      );
      throw new ChecksumMismatchError(
        `Checksum mismatch for sample "${sample.sampleId}". The stored file may be corrupted.`,
      );
    }
  }

  // Invoke SageMaker endpoint
  const s3Keys = samples.map((s) => s.s3Key);
  const sagemakerPayload = {
    text: 'test',
    speaker_wav_keys: s3Keys,
    language: 'en',
    singing: false,
  };

  let finalStatus: 'ready' | 'failed' = 'ready';
  let errorDetails: string | undefined;
  let profileRef: string | undefined;

  try {
    await sagemakerClient.send(
      new InvokeEndpointCommand({
        EndpointName: SAGEMAKER_ENDPOINT_NAME,
        ContentType: 'application/json',
        Body: Buffer.from(JSON.stringify(sagemakerPayload)),
      }),
    );
    finalStatus = 'ready';
    profileRef = `samples/${colleagueId}/`;
  } catch (err) {
    finalStatus = 'failed';
    errorDetails = err instanceof Error ? err.message : String(err);
  }

  // Update profile status
  const updateExpr = finalStatus === 'ready'
    ? 'SET #status = :status, profileRef = :profileRef, sampleKeys = :sampleKeys, updatedAt = :now'
    : 'SET #status = :status, errorDetails = :errorDetails, updatedAt = :now';

  const expressionValues: Record<string, unknown> =
    finalStatus === 'ready'
      ? {
          ':status': finalStatus,
          ':profileRef': profileRef,
          ':sampleKeys': s3Keys,
          ':now': new Date().toISOString(),
        }
      : {
          ':status': finalStatus,
          ':errorDetails': errorDetails,
          ':now': new Date().toISOString(),
        };

  await withRetry(() =>
    docClient.send(
      new UpdateCommand({
        TableName: VOICE_PROFILES_TABLE,
        Key: { colleagueId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: expressionValues,
      }),
    ),
  );

  return { colleagueId, status: finalStatus };
}

// ---------------------------------------------------------------------------
// GET /admin/profiles and GET /colleagues
// ---------------------------------------------------------------------------
async function handleListProfiles(): Promise<
  Array<{ colleagueId: string; displayName?: string; status: string; updatedAt: string }>
> {
  const result = await withRetry(() =>
    docClient.send(
      new ScanCommand({
        TableName: VOICE_PROFILES_TABLE,
        ProjectionExpression: 'colleagueId, displayName, #status, updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
      }),
    ),
  );

  return (result.Items ?? []).map((item) => ({
    colleagueId: item.colleagueId as string,
    displayName: item.displayName as string | undefined,
    status: item.status as string,
    updatedAt: item.updatedAt as string,
  }));
}

// ---------------------------------------------------------------------------
// Route dispatcher
// ---------------------------------------------------------------------------
async function handleRequest(event: APIGatewayProxyEventV2): Promise<unknown> {
  const method = getMethod(event);
  const path = getPath(event);

  // POST /admin/profiles/{colleagueId}/build
  if (method === 'POST' && path.includes('/admin/profiles/') && path.endsWith('/build')) {
    const colleagueId =
      getPathParameters(event)?.colleagueId ??
      path.replace('/admin/profiles/', '').replace('/build', '');
    return handleBuild(colleagueId);
  }

  // GET /admin/profiles
  if (method === 'GET' && path === '/admin/profiles') {
    return handleListProfiles();
  }

  // GET /colleagues
  if (method === 'GET' && path === '/colleagues') {
    return handleListProfiles();
  }

  return { error: 'NOT_FOUND' };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const result = await handleRequest(event);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof BuildInProgressError) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err.toResponse()),
      };
    }
    if (err instanceof ChecksumMismatchError) {
      return {
        statusCode: 409,
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
