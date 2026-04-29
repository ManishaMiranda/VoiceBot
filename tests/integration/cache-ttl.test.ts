/**
 * Integration test: DynamoDB TTL cache expiry behavior.
 *
 * Verifies that an expired cache entry (ttl in the past) is treated as a
 * cache miss and SageMaker is invoked again.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

import { handler as synthesizeHandler } from '../../backend/src/handlers/synthesize';
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
  process.env.VOICE_PROFILES_TABLE = 'VoiceProfiles';
  process.env.SYNTHESIS_CACHE_TABLE = 'SynthesisCache';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DynamoDB TTL cache expiry', () => {
  it('expired cache entry is not used — SageMaker is invoked again', async () => {
    const colleagueId = 'alice';
    const audioBase64 = Buffer.from('fake-audio-bytes').toString('base64');

    // DynamoDB GetCommand for VoiceProfiles: return ready profile
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId,
        status: 'ready',
        sampleKeys: [`samples/${colleagueId}/sample-1.wav`],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // DynamoDB GetCommand for SynthesisCache: return item with ttl 10 seconds in the past (expired)
    const expiredTtl = Math.floor(Date.now() / 1000) - 10;
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({
      Item: {
        cacheKey: 'some-expired-cache-key',
        s3Key: `synthesized/${colleagueId}/some-expired-cache-key.wav`,
        createdAt: expiredTtl - 3600,
        ttl: expiredTtl, // expired
        durationSeconds: 2.0,
      },
    });

    // SageMaker: return audio (should be invoked since cache is expired)
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(
        JSON.stringify({ audio_base64: audioBase64, sample_rate: 24000, duration_seconds: 2.0 }),
      ),
    });

    // S3 PutObjectCommand: store new audio
    s3Mock.on(PutObjectCommand).resolves({});

    // DynamoDB PutCommand: write new cache entry
    ddbMock.on(PutCommand).resolves({});

    const event = makeSynthesizeEvent({
      text: 'Hello, expired cache test.',
      colleagueId,
      language: 'en',
      singing: false,
    });

    const response = await synthesizeHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);

    // SageMaker IS invoked (expired cache treated as miss)
    expect(smMock.calls()).toHaveLength(1);

    // Response has cached=false
    expect(body.cached).toBe(false);

    // Audio URL is returned
    expect(body.audioUrl).toBeTruthy();
    expect(body.audioUrl).toContain('X-Amz-Signature');
  });
});
