/**
 * Unit tests for the quote-generator Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB, S3, and SageMaker clients.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  SageMakerRuntimeClient,
  InvokeEndpointCommand,
} from '@aws-sdk/client-sagemaker-runtime';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Mock the presigner before importing the handler
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue(
    'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=mocksignature&X-Amz-Expires=86400',
  ),
}));

import { handler } from '../../../backend/src/handlers/quote-generator';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const smMock = mockClient(SageMakerRuntimeClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /quotes/random',
    rawPath: '/quotes/random',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/quotes/random',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /quotes/random',
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

const FAKE_AUDIO_BASE64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');

const SAGEMAKER_SUCCESS_RESPONSE = {
  audio_base64: FAKE_AUDIO_BASE64,
  sample_rate: 24000,
  duration_seconds: 3.0,
};

const SAMPLE_QUOTES = [
  {
    quoteId: 'quote-001',
    text: 'This meeting could have been an email.',
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: 'quote-002',
    text: 'The cloud is just someone else\'s computer.',
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: 'quote-003',
    text: 'I\'ll just ping you on Slack.',
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  smMock.reset();
  jest.clearAllMocks();

  process.env.VOICE_PROFILES_TABLE = 'VoiceProfiles';
  process.env.SYNTHESIS_CACHE_TABLE = 'SynthesisCache';
  process.env.QUOTE_LIBRARY_TABLE = 'QuoteLibrary';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /quotes/random — happy path', () => {
  it('selects a quote, synthesizes it, and returns quoteText and audioUrl', async () => {
    // Profile is ready
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'ready',
        sampleKeys: ['samples/alice/s1.wav'],
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // Quote library scan
    ddbMock.on(ScanCommand, { TableName: 'QuoteLibrary' }).resolves({
      Items: SAMPLE_QUOTES,
    });

    // No recent quotes for this colleague
    ddbMock.on(GetCommand, { TableName: 'QuoteLibrary' }).resolves({ Item: undefined });

    // Cache miss
    ddbMock.on(GetCommand, { TableName: 'SynthesisCache' }).resolves({ Item: undefined });

    // SageMaker returns audio
    smMock.on(InvokeEndpointCommand).resolves({
      Body: Buffer.from(JSON.stringify(SAGEMAKER_SUCCESS_RESPONSE)),
    });

    // S3 put succeeds
    s3Mock.on(PutObjectCommand).resolves({});

    // DynamoDB writes succeed
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({ colleagueId: 'alice' });
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.quoteText).toBeTruthy();
    expect(typeof body.quoteText).toBe('string');
    expect(body.audioUrl).toBeTruthy();
    expect(body.audioUrl).toContain('X-Amz-Signature');
    expect(typeof body.durationSeconds).toBe('number');
  });
});

describe('POST /quotes/random — error: profile not ready', () => {
  it('returns 422 PROFILE_NOT_READY when colleague profile status is not ready', async () => {
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({
      Item: {
        colleagueId: 'alice',
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const event = makeEvent({ colleagueId: 'alice' });
    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });

  it('returns 422 PROFILE_NOT_READY when colleague profile does not exist', async () => {
    ddbMock.on(GetCommand, { TableName: 'VoiceProfiles' }).resolves({ Item: undefined });

    const event = makeEvent({ colleagueId: 'unknown' });
    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });
});

describe('POST /quotes/random — error: missing colleagueId', () => {
  it('returns 400 VALIDATION_ERROR when colleagueId is missing', async () => {
    const event = makeEvent({});
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('colleagueId');
  });

  it('returns 400 VALIDATION_ERROR when colleagueId is empty string', async () => {
    const event = makeEvent({ colleagueId: '' });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('colleagueId');
  });

  it('returns 400 VALIDATION_ERROR when request body is missing', async () => {
    const event = {
      ...makeEvent({}),
      body: null,
    } as unknown as APIGatewayProxyEventV2;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
  });
});
