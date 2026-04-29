/**
 * Unit tests for the quiz Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB, S3, and SageMaker clients.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
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

import { handler } from '../../../backend/src/handlers/quiz';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const smMock = mockClient(SageMakerRuntimeClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStartEvent(body: Record<string, unknown> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /quiz/start',
    rawPath: '/quiz/start',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/quiz/start',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /quiz/start',
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

function makeAnswerEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /quiz/answer',
    rawPath: '/quiz/answer',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/quiz/answer',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /quiz/answer',
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
  duration_seconds: 2.5,
};

// 7 colleagues — all ready
const ALL_PROFILES = [
  { colleagueId: 'alice', displayName: 'Alice', status: 'ready', sampleKeys: ['samples/alice/s1.wav'] },
  { colleagueId: 'bob', displayName: 'Bob', status: 'ready', sampleKeys: ['samples/bob/s1.wav'] },
  { colleagueId: 'charlie', displayName: 'Charlie', status: 'ready', sampleKeys: [] },
  { colleagueId: 'diana', displayName: 'Diana', status: 'ready', sampleKeys: [] },
  { colleagueId: 'eve', displayName: 'Eve', status: 'ready', sampleKeys: [] },
  { colleagueId: 'frank', displayName: 'Frank', status: 'ready', sampleKeys: [] },
  { colleagueId: 'grace', displayName: 'Grace', status: 'ready', sampleKeys: [] },
];

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
  process.env.QUIZ_SCORES_TABLE = 'QuizScores';
  process.env.QUOTE_LIBRARY_TABLE = 'QuoteLibrary';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
  process.env.SAGEMAKER_ENDPOINT_NAME = 'colleague-voice-bot-endpoint';
});

// ---------------------------------------------------------------------------
// POST /quiz/start tests
// ---------------------------------------------------------------------------

describe('POST /quiz/start — happy path', () => {
  beforeEach(() => {
    // All profiles scan
    ddbMock.on(ScanCommand, { TableName: 'VoiceProfiles' }).resolves({ Items: ALL_PROFILES });

    // Quotes scan
    ddbMock.on(ScanCommand, { TableName: 'QuoteLibrary' }).resolves({ Items: SAMPLE_QUOTES });

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
  });

  it('returns roundId, audioUrl, 7 options, and mode', async () => {
    const event = makeStartEvent({ nickname: 'player1' });
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);

    expect(body.roundId).toBeTruthy();
    expect(typeof body.roundId).toBe('string');
    expect(body.audioUrl).toBeTruthy();
    expect(body.audioUrl).toContain('X-Amz-Signature');
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options).toHaveLength(7);
    expect(['spoken', 'singing']).toContain(body.mode);
    expect(typeof body.durationSeconds).toBe('number');
  });

  it('options contain all 7 colleague identifiers', async () => {
    const event = makeStartEvent({});
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);

    const colleagueIds = body.options.map((o: { colleagueId: string }) => o.colleagueId);
    expect(colleagueIds).toContain('alice');
    expect(colleagueIds).toContain('bob');
    expect(colleagueIds).toContain('charlie');
    expect(colleagueIds).toContain('diana');
    expect(colleagueIds).toContain('eve');
    expect(colleagueIds).toContain('frank');
    expect(colleagueIds).toContain('grace');
  });
});

describe('POST /quiz/start — error: no ready colleagues', () => {
  it('returns 422 when no colleagues have ready profiles', async () => {
    // All profiles are pending
    ddbMock.on(ScanCommand, { TableName: 'VoiceProfiles' }).resolves({
      Items: ALL_PROFILES.map((p) => ({ ...p, status: 'pending' })),
    });

    const event = makeStartEvent({});
    const response = await handler(event);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('PROFILE_NOT_READY');
  });

  it('returns 422 when VoiceProfiles table is empty', async () => {
    ddbMock.on(ScanCommand, { TableName: 'VoiceProfiles' }).resolves({ Items: [] });

    const event = makeStartEvent({});
    const response = await handler(event);

    expect(response.statusCode).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /quiz/answer tests
// ---------------------------------------------------------------------------

describe('POST /quiz/answer — happy path: correct answer', () => {
  it('returns correct=true and increments score', async () => {
    const roundId = 'round-uuid-001';

    // Round exists and is not answered
    ddbMock.on(GetCommand, { TableName: 'QuizScores' }).resolves({
      Item: {
        entryId: roundId,
        colleagueId: 'alice',
        quoteId: 'quote-001',
        mode: 'spoken',
        answered: false,
        nickname: 'player1',
        score: 0,
        gamesPlayed: 0,
        leaderboard: 'global',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    // No existing leaderboard entry for this nickname
    ddbMock.on(ScanCommand, { TableName: 'QuizScores' }).resolves({ Items: [] });

    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const event = makeAnswerEvent({ roundId, guess: 'alice', nickname: 'player1' });
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.correct).toBe(true);
    expect(body.correctColleagueId).toBe('alice');
    expect(body.score).toBe(1);
  });
});

describe('POST /quiz/answer — happy path: incorrect answer', () => {
  it('returns correct=false and reveals correctColleagueId', async () => {
    const roundId = 'round-uuid-002';

    ddbMock.on(GetCommand, { TableName: 'QuizScores' }).resolves({
      Item: {
        entryId: roundId,
        colleagueId: 'alice',
        quoteId: 'quote-001',
        mode: 'spoken',
        answered: false,
        nickname: 'player1',
        score: 0,
        gamesPlayed: 0,
        leaderboard: 'global',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    ddbMock.on(UpdateCommand).resolves({});

    const event = makeAnswerEvent({ roundId, guess: 'bob', nickname: 'player1' });
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.correct).toBe(false);
    expect(body.correctColleagueId).toBe('alice');
    expect(body.score).toBe(0);
  });
});

describe('POST /quiz/answer — error: round already answered', () => {
  it('returns 400 when round has already been answered', async () => {
    const roundId = 'round-uuid-003';

    ddbMock.on(GetCommand, { TableName: 'QuizScores' }).resolves({
      Item: {
        entryId: roundId,
        colleagueId: 'alice',
        answered: true,
        nickname: 'player1',
        score: 1,
        leaderboard: 'global',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const event = makeAnswerEvent({ roundId, guess: 'alice' });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('ALREADY_ANSWERED');
  });
});

describe('POST /quiz/answer — error: round not found', () => {
  it('returns 400 when round does not exist', async () => {
    ddbMock.on(GetCommand, { TableName: 'QuizScores' }).resolves({ Item: undefined });

    const event = makeAnswerEvent({ roundId: 'nonexistent-round', guess: 'alice' });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('ROUND_NOT_FOUND');
  });
});
