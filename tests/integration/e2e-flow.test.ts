/**
 * End-to-end integration test: upload sample → build profile → synthesize text.
 *
 * Uses aws-sdk-client-mock to mock all AWS services (no real AWS calls).
 * Calls Lambda handler functions directly (not via HTTP).
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Readable } from 'stream';

// Mock the presigner module before importing handlers
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue(
    'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=mocksignature&X-Amz-Expires=86400',
  ),
}));

import { handler as uploadHandler } from '../../backend/src/handlers/upload-sample';
import { handler as profileHandler } from '../../backend/src/handlers/manage-profile';
import { handler as synthesizeHandler } from '../../backend/src/handlers/synthesize';
import { computeChecksum } from '../../backend/src/utils/checksum';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const smMock = mockClient(SageMakerRuntimeClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUploadEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /admin/samples',
    rawPath: '/admin/samples',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/admin/samples',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /admin/samples',
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

function makeBuildEvent(colleagueId: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /admin/profiles/{colleagueId}/build',
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
      routeKey: 'POST /admin/profiles/{colleagueId}/build',
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
  jest.clearAllMocks();
  (getSignedUrl as jest.Mock).mockResolvedValue(
    'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=mocksignature&X-Amz-Expires=86400',
  );
  process.env.VOICE_SAMPLES_TABLE = 'VoiceSamples';
  process.env.VOICE_PROFILES_TABLE = 'VoiceProfiles';
  process.env.SYNTHESIS_CACHE_TABLE = 'SynthesisCache';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E integration: upload → profile build → synthesize', () => {
  it('end-to-end: upload sample → build profile → synthesize text → verify audio URL returned', async () => {
    const colleagueId = 'alice';
    const audioBytes = Buffer.from('fake-audio-bytes-for-e2e-test');
    const audioBase64 = audioBytes.toString('base64');
    const checksum = computeChecksum(audioBytes);

    // -----------------------------------------------------------------------
    // Step 1: Upload sample
    // -----------------------------------------------------------------------

    // DynamoDB QueryCommand: count = 0 (no existing samples)
    ddbMock.on(QueryCommand).resolves({ Count: 0, Items: [] });
    // S3 PutObjectCommand: store audio
    s3Mock.on(PutObjectCommand).resolves({});
    // DynamoDB PutCommand: write sample record
    ddbMock.on(PutCommand).resolves({});

    const uploadEvent = makeUploadEvent({
      colleagueId,
      format: 'wav',
      durationSeconds: 30,
      audioBase64,
      uploadedBy: 'admin-sub-123',
    });

    const uploadResponse = await uploadHandler(uploadEvent);

    expect(uploadResponse.statusCode).toBe(201);
    const uploadBody = JSON.parse(uploadResponse.body as string);
    expect(uploadBody.sampleId).toBeTruthy();
    expect(uploadBody.colleagueId).toBe(colleagueId);

    const sampleId = uploadBody.sampleId as string;
    const s3Key = `samples/${colleagueId}/${sampleId}.wav`;

    // -----------------------------------------------------------------------
    // Step 2: Build profile
    // -----------------------------------------------------------------------

    ddbMock.reset();
    s3Mock.reset();
    smMock.reset();

    // DynamoDB GetCommand: profile not found → create
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    // DynamoDB PutCommand: create profile
    ddbMock.on(PutCommand).resolves({});
    // DynamoDB QueryCommand: return the sample from step 1 with correct checksum
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          sampleId,
          colleagueId,
          s3Key,
          format: 'wav',
          durationSeconds: 30,
          checksum,
          uploadedAt: '2024-01-01T00:00:00.000Z',
          uploadedBy: 'admin-sub-123',
        },
      ],
      Count: 1,
    });
    // S3 GetObjectCommand: return the audio bytes from step 1
    s3Mock.on(GetObjectCommand).resolves({
      Body: bufferToStream(audioBytes) as unknown as ReadableStream,
    });
    // SageMaker InvokeEndpointCommand: return success
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(
        JSON.stringify({ audio_base64: audioBase64, sample_rate: 24000, duration_seconds: 2.0 }),
      ),
    });
    // DynamoDB UpdateCommand: status updates
    ddbMock.on(UpdateCommand).resolves({});

    const buildEvent = makeBuildEvent(colleagueId);
    const buildResponse = await profileHandler(buildEvent);

    expect(buildResponse.statusCode).toBe(200);
    const buildBody = JSON.parse(buildResponse.body as string);
    expect(buildBody.colleagueId).toBe(colleagueId);
    expect(buildBody.status).toBe('ready');

    // -----------------------------------------------------------------------
    // Step 3: Synthesize
    // -----------------------------------------------------------------------

    ddbMock.reset();
    s3Mock.reset();
    smMock.reset();

    const sampleKeys = [s3Key];

    // DynamoDB GetCommand for VoiceProfiles: return ready profile with sampleKeys
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId,
        status: 'ready',
        sampleKeys,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });
    // DynamoDB GetCommand for SynthesisCache: cache miss
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({ Item: undefined });
    // SageMaker InvokeEndpointCommand: return audio
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(
        JSON.stringify({ audio_base64: audioBase64, sample_rate: 24000, duration_seconds: 2.0 }),
      ),
    });
    // S3 PutObjectCommand: store audio
    s3Mock.on(PutObjectCommand).resolves({});
    // DynamoDB PutCommand: write cache
    ddbMock.on(PutCommand).resolves({});

    const synthesizeEvent = makeSynthesizeEvent({
      text: 'Hello, this is a test.',
      colleagueId,
      language: 'en',
      singing: false,
    });

    const synthesizeResponse = await synthesizeHandler(synthesizeEvent);

    expect(synthesizeResponse.statusCode).toBe(200);
    const synthesizeBody = JSON.parse(synthesizeResponse.body as string);
    expect(synthesizeBody.audioUrl).toBeTruthy();
    expect(synthesizeBody.audioUrl).toContain('X-Amz-Signature');
    expect(synthesizeBody.cached).toBe(false);
  });

  it('caching: second synthesis request returns cached result without invoking SageMaker', async () => {
    const colleagueId = 'bob';
    const audioBytes = Buffer.from('fake-audio-bytes-for-caching-test');
    const audioBase64 = audioBytes.toString('base64');
    const nowEpoch = Math.floor(Date.now() / 1000);

    // -----------------------------------------------------------------------
    // First call: cache miss → SageMaker invoked
    // -----------------------------------------------------------------------

    // DynamoDB GetCommand for VoiceProfiles: return ready profile
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId,
        status: 'ready',
        sampleKeys: [`samples/${colleagueId}/sample-1.wav`],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });
    // DynamoDB GetCommand for SynthesisCache: cache miss
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({ Item: undefined });
    // SageMaker: return audio
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(
        JSON.stringify({ audio_base64: audioBase64, sample_rate: 24000, duration_seconds: 1.5 }),
      ),
    });
    s3Mock.on(PutObjectCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const synthesizeEvent = makeSynthesizeEvent({
      text: 'Cache test text',
      colleagueId,
      language: 'en',
      singing: false,
    });

    const firstResponse = await synthesizeHandler(synthesizeEvent);
    expect(firstResponse.statusCode).toBe(200);
    const firstBody = JSON.parse(firstResponse.body as string);
    expect(firstBody.cached).toBe(false);

    // SageMaker was invoked once
    expect(smMock.calls()).toHaveLength(1);

    // -----------------------------------------------------------------------
    // Second call: cache hit → SageMaker NOT invoked again
    // -----------------------------------------------------------------------

    ddbMock.reset();
    s3Mock.reset();
    smMock.reset();

    // DynamoDB GetCommand for VoiceProfiles: return ready profile
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId,
        status: 'ready',
        sampleKeys: [`samples/${colleagueId}/sample-1.wav`],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });
    // DynamoDB GetCommand for SynthesisCache: cache hit with ttl > now
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({
      Item: {
        cacheKey: 'some-cache-key',
        s3Key: `synthesized/${colleagueId}/some-cache-key.wav`,
        createdAt: nowEpoch - 100,
        ttl: nowEpoch + 3500, // still valid
        durationSeconds: 1.5,
      },
    });

    const secondResponse = await synthesizeHandler(synthesizeEvent);
    expect(secondResponse.statusCode).toBe(200);
    const secondBody = JSON.parse(secondResponse.body as string);
    expect(secondBody.cached).toBe(true);

    // SageMaker was NOT invoked on the second call
    expect(smMock.calls()).toHaveLength(0);
  });
});
