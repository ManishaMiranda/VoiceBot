/**
 * Unit tests for the manage-profile Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB, S3, and SageMaker clients.
 */

import { mockClient } from 'aws-sdk-client-mock';
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
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Readable } from 'stream';
import { computeChecksum } from '../../../backend/src/utils/checksum';

import { handler } from '../../../backend/src/handlers/manage-profile';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const smMock = mockClient(SageMakerRuntimeClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBuildEvent(colleagueId: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `POST /admin/profiles/{colleagueId}/build`,
    rawPath: `/admin/profiles/${colleagueId}/build`,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: `/admin/profiles/${colleagueId}/build`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: `POST /admin/profiles/{colleagueId}/build`,
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: null,
    isBase64Encoded: false,
    pathParameters: { colleagueId },
    queryStringParameters: {},
    stageVariables: {},
  } as unknown as APIGatewayProxyEventV2;
}

function makeGetProfilesEvent(path: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `GET ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: `GET ${path}`,
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: null,
    isBase64Encoded: false,
    pathParameters: {},
    queryStringParameters: {},
    stageVariables: {},
  } as unknown as APIGatewayProxyEventV2;
}

/** Creates a readable stream from a buffer (simulates S3 GetObject Body) */
function bufferToStream(buffer: Buffer): Readable {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  smMock.reset();
  process.env.VOICE_PROFILES_TABLE = 'VoiceProfiles';
  process.env.VOICE_SAMPLES_TABLE = 'VoiceSamples';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/profiles/{colleagueId}/build', () => {
  it('happy path: build triggered, SageMaker returns success → status "ready"', async () => {
    const colleagueId = 'alice';
    const audioBuffer = Buffer.from('fake-audio-bytes');
    const checksum = computeChecksum(audioBuffer);

    // Profile exists with pending status
    ddbMock.on(GetCommand).resolves({
      Item: {
        colleagueId,
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // Samples exist
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          sampleId: 'sample-1',
          colleagueId,
          s3Key: `samples/${colleagueId}/sample-1.wav`,
          format: 'wav',
          durationSeconds: 30,
          checksum,
          uploadedAt: '2024-01-01T00:00:00.000Z',
          uploadedBy: 'admin',
        },
      ],
      Count: 1,
    });

    // S3 returns the audio buffer with matching checksum
    s3Mock.on(GetObjectCommand).resolves({
      Body: bufferToStream(audioBuffer) as unknown as ReadableStream,
    });

    // SageMaker returns success
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(
        JSON.stringify({ audio_base64: 'dGVzdA==', sample_rate: 24000, duration_seconds: 1.0 }),
      ),
    });

    // UpdateCommand for status changes
    ddbMock.on(UpdateCommand).resolves({});

    const event = makeBuildEvent(colleagueId);
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.colleagueId).toBe(colleagueId);
    expect(body.status).toBe('ready');
  });

  it('error: SageMaker returns error → status "failed", errorDetails populated', async () => {
    const colleagueId = 'bob';
    const audioBuffer = Buffer.from('fake-audio-bytes-bob');
    const checksum = computeChecksum(audioBuffer);

    ddbMock.on(GetCommand).resolves({
      Item: {
        colleagueId,
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          sampleId: 'sample-bob-1',
          colleagueId,
          s3Key: `samples/${colleagueId}/sample-bob-1.wav`,
          format: 'wav',
          durationSeconds: 25,
          checksum,
          uploadedAt: '2024-01-01T00:00:00.000Z',
          uploadedBy: 'admin',
        },
      ],
      Count: 1,
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: bufferToStream(audioBuffer) as unknown as ReadableStream,
    });

    // SageMaker throws an error
    smMock.on(InvokeEndpointCommand).rejects(new Error('SageMaker endpoint unavailable'));

    ddbMock.on(UpdateCommand).resolves({});

    const event = makeBuildEvent(colleagueId);
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.colleagueId).toBe(colleagueId);
    expect(body.status).toBe('failed');
  });

  it('error: zero samples → 422 PROFILE_NOT_READY', async () => {
    const colleagueId = 'charlie';

    ddbMock.on(GetCommand).resolves({
      Item: {
        colleagueId,
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // No samples
    ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });
    ddbMock.on(UpdateCommand).resolves({});

    const event = makeBuildEvent(colleagueId);
    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });

  it('error: already processing → 409 BUILD_IN_PROGRESS', async () => {
    const colleagueId = 'diana';

    ddbMock.on(GetCommand).resolves({
      Item: {
        colleagueId,
        status: 'processing',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const event = makeBuildEvent(colleagueId);
    const response = await handler(event);

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('BUILD_IN_PROGRESS');
  });

  it('error: checksum mismatch → 409 CHECKSUM_MISMATCH', async () => {
    const colleagueId = 'eve';
    const audioBuffer = Buffer.from('original-audio-bytes');
    const tamperedBuffer = Buffer.from('tampered-audio-bytes');
    const storedChecksum = computeChecksum(audioBuffer);

    ddbMock.on(GetCommand).resolves({
      Item: {
        colleagueId,
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          sampleId: 'sample-eve-1',
          colleagueId,
          s3Key: `samples/${colleagueId}/sample-eve-1.wav`,
          format: 'wav',
          durationSeconds: 20,
          checksum: storedChecksum, // stored checksum of original
          uploadedAt: '2024-01-01T00:00:00.000Z',
          uploadedBy: 'admin',
        },
      ],
      Count: 1,
    });

    // S3 returns tampered bytes (checksum won't match)
    s3Mock.on(GetObjectCommand).resolves({
      Body: bufferToStream(tamperedBuffer) as unknown as ReadableStream,
    });

    ddbMock.on(UpdateCommand).resolves({});

    const event = makeBuildEvent(colleagueId);
    const response = await handler(event);

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('CHECKSUM_MISMATCH');
  });
});

describe('GET /colleagues', () => {
  it('returns array of profiles with required fields', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          colleagueId: 'alice',
          displayName: 'Alice Smith',
          status: 'ready',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          colleagueId: 'bob',
          displayName: 'Bob Jones',
          status: 'pending',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    const event = makeGetProfilesEvent('/colleagues');
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].colleagueId).toBe('alice');
    expect(body[0].status).toBe('ready');
    expect(body[1].colleagueId).toBe('bob');
  });
});

describe('GET /admin/profiles', () => {
  it('returns array of profiles', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          colleagueId: 'alice',
          displayName: 'Alice Smith',
          status: 'ready',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });

    const event = makeGetProfilesEvent('/admin/profiles');
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].colleagueId).toBe('alice');
  });
});
