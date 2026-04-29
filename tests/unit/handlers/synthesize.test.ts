/**
 * Unit tests for the synthesize Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB, S3, and SageMaker clients.
 * Pre-signed URL generation is mocked via jest.mock.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Mock the presigner module before importing the handler
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue(
    'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=mocksignature&X-Amz-Expires=86400',
  ),
}));

import { handler } from '../../../backend/src/handlers/synthesize';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const smMock = mockClient(SageMakerRuntimeClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSynthesizeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /synthesize',
    rawPath: '/synthesize',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/synthesize',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /synthesize',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    pathParameters: {},
    queryStringParameters: {},
    stageVariables: {},
  } as unknown as APIGatewayProxyEventV2;
}

// A minimal base64-encoded WAV (just enough bytes to decode)
const FAKE_AUDIO_BASE64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');

const SAGEMAKER_SUCCESS_RESPONSE = {
  audio_base64: FAKE_AUDIO_BASE64,
  sample_rate: 24000,
  duration_seconds: 2.5,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  smMock.reset();
  jest.clearAllMocks();
  // Reset the mock to default success
  (getSignedUrl as jest.Mock).mockResolvedValue(
    'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=mocksignature&X-Amz-Expires=86400',
  );
  process.env.VOICE_PROFILES_TABLE = 'VoiceProfiles';
  process.env.SYNTHESIS_CACHE_TABLE = 'SynthesisCache';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /synthesize — cache miss path', () => {
  it('happy path cache miss: SageMaker invoked → audio stored → pre-signed URL returned, cached=false', async () => {
    // Profile is ready
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'ready',
        sampleKeys: ['samples/alice/s1.wav'],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // Cache miss
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({ Item: undefined });

    // SageMaker returns audio
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(JSON.stringify(SAGEMAKER_SUCCESS_RESPONSE)),
    });

    // S3 put succeeds
    s3Mock.on(PutObjectCommand).resolves({});

    // DynamoDB cache write succeeds
    ddbMock.on(PutCommand).resolves({});

    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'alice',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.audioUrl).toBeTruthy();
    expect(body.durationSeconds).toBe(2.5);
    expect(body.cached).toBe(false);

    // Verify SageMaker was invoked
    expect(smMock.calls()).toHaveLength(1);
  });
});

describe('POST /synthesize — cache hit path', () => {
  it('happy path cache hit: SageMaker NOT invoked → cached URL returned, cached=true', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Profile is ready
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'ready',
        sampleKeys: ['samples/alice/s1.wav'],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // Cache hit with valid TTL
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({
      Item: {
        cacheKey: 'some-cache-key',
        s3Key: 'synthesized/alice/some-cache-key.wav',
        createdAt: nowEpoch - 100,
        ttl: nowEpoch + 3500, // still valid
        durationSeconds: 2.5,
      },
    });

    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'alice',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.audioUrl).toBeTruthy();
    expect(body.cached).toBe(true);

    // SageMaker should NOT have been invoked
    expect(smMock.calls()).toHaveLength(0);
  });
});

describe('POST /synthesize — validation errors', () => {
  it('error: text too long (501 chars) → 400 VALIDATION_ERROR', async () => {
    const event = makeSynthesizeEvent({
      text: 'a'.repeat(501),
      colleagueId: 'alice',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('text');
  });

  it('error: singing text too long (201 chars with singing=true) → 400 VALIDATION_ERROR', async () => {
    const event = makeSynthesizeEvent({
      text: 'a'.repeat(201),
      colleagueId: 'alice',
      language: 'en',
      singing: true,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('text');
  });

  it('error: unsupported language "de" → 400 VALIDATION_ERROR', async () => {
    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'alice',
      language: 'de',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('language');
  });
});

describe('POST /synthesize — profile not ready', () => {
  it('error: profile not ready → 422 PROFILE_NOT_READY', async () => {
    // Profile exists but status is "pending"
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'alice',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });

  it('error: profile does not exist → 422 PROFILE_NOT_READY', async () => {
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({ Item: undefined });

    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'unknown-colleague',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });
});

describe('POST /synthesize — pre-signed URL', () => {
  it('verify pre-signed URL contains "X-Amz-Signature"', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);

    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'ready',
        sampleKeys: ['samples/alice/s1.wav'],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // Cache hit to simplify the test
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({
      Item: {
        cacheKey: 'some-cache-key',
        s3Key: 'synthesized/alice/some-cache-key.wav',
        createdAt: nowEpoch - 100,
        ttl: nowEpoch + 3500,
        durationSeconds: 2.5,
      },
    });

    const event = makeSynthesizeEvent({
      text: 'Hello world',
      colleagueId: 'alice',
      language: 'en',
      singing: false,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.audioUrl).toContain('X-Amz-Signature');
  });
});
