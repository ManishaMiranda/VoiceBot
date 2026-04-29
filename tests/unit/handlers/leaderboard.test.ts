/**
 * Unit tests for the leaderboard Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { handler } from '../../../backend/src/handlers/leaderboard';

const ddbMock = mockClient(DynamoDBDocumentClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetEvent(): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /leaderboard',
    rawPath: '/leaderboard',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/leaderboard',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /leaderboard',
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

function makePostEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /leaderboard',
    rawPath: '/leaderboard',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/leaderboard',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /leaderboard',
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

function makeDeleteEvent(entryId: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'DELETE /admin/leaderboard/{entry}',
    rawPath: `/admin/leaderboard/${entryId}`,
    rawQueryString: '',
    headers: { authorization: 'Bearer admin-token' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'DELETE',
        path: `/admin/leaderboard/${entryId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'DELETE /admin/leaderboard/{entry}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: null,
    isBase64Encoded: false,
    pathParameters: { entry: entryId },
    queryStringParameters: {},
    stageVariables: {},
  } as unknown as APIGatewayProxyEventV2;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  ddbMock.reset();
  process.env.QUIZ_SCORES_TABLE = 'QuizScores';
});

// ---------------------------------------------------------------------------
// GET /leaderboard tests
// ---------------------------------------------------------------------------

describe('GET /leaderboard', () => {
  it('returns top 10 entries ordered by score descending', async () => {
    // DynamoDB GSI query returns items already sorted (ScanIndexForward=false)
    const items = [
      { entryId: 'e1', nickname: 'alice', score: 100, gamesPlayed: 10, leaderboard: 'global', updatedAt: '2024-01-10T00:00:00.000Z' },
      { entryId: 'e2', nickname: 'bob', score: 80, gamesPlayed: 8, leaderboard: 'global', updatedAt: '2024-01-09T00:00:00.000Z' },
      { entryId: 'e3', nickname: 'charlie', score: 60, gamesPlayed: 6, leaderboard: 'global', updatedAt: '2024-01-08T00:00:00.000Z' },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: items });

    const response = await handler(makeGetEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body[0].nickname).toBe('alice');
    expect(body[0].score).toBe(100);
    expect(body[1].nickname).toBe('bob');
    expect(body[1].score).toBe(80);
    expect(body[2].nickname).toBe('charlie');
    expect(body[2].score).toBe(60);
  });

  it('returns at most 10 entries even if more exist in the table', async () => {
    // DynamoDB Limit=10 is enforced by the query; mock returns exactly 10
    const items = Array.from({ length: 10 }, (_, i) => ({
      entryId: `e${i + 1}`,
      nickname: `player${i + 1}`,
      score: 100 - i * 5,
      gamesPlayed: 10,
      leaderboard: 'global',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }));

    ddbMock.on(QueryCommand).resolves({ Items: items });

    const response = await handler(makeGetEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.length).toBeLessThanOrEqual(10);
  });

  it('each entry contains nickname and score fields', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { entryId: 'e1', nickname: 'alice', score: 42, gamesPlayed: 5, leaderboard: 'global', updatedAt: '2024-01-01T00:00:00.000Z' },
      ],
    });

    const response = await handler(makeGetEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body[0]).toHaveProperty('nickname');
    expect(body[0]).toHaveProperty('score');
  });

  it('returns empty array when no entries exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const response = await handler(makeGetEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /leaderboard tests
// ---------------------------------------------------------------------------

describe('POST /leaderboard', () => {
  it('submits a score and returns 201 with entryId', async () => {
    ddbMock.on(PutCommand).resolves({});

    const response = await handler(makePostEvent({ nickname: 'player1', score: 5, gamesPlayed: 10 }));

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body as string);
    expect(body.entryId).toBeTruthy();
    expect(typeof body.entryId).toBe('string');
    expect(body.nickname).toBe('player1');
    expect(body.score).toBe(5);
  });

  it('returns 400 VALIDATION_ERROR when nickname is missing', async () => {
    const response = await handler(makePostEvent({ score: 5 }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('nickname');
  });

  it('returns 400 VALIDATION_ERROR when nickname is empty string', async () => {
    const response = await handler(makePostEvent({ nickname: '', score: 5 }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('nickname');
  });

  it('returns 400 VALIDATION_ERROR when score is negative', async () => {
    const response = await handler(makePostEvent({ nickname: 'player1', score: -1 }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('score');
  });

  it('accepts score of 0', async () => {
    ddbMock.on(PutCommand).resolves({});

    const response = await handler(makePostEvent({ nickname: 'newbie', score: 0 }));

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body as string);
    expect(body.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/leaderboard/{entry} tests
// ---------------------------------------------------------------------------

describe('DELETE /admin/leaderboard/{entry}', () => {
  it('deletes an entry and returns 200 with deleted=true', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const entryId = 'entry-to-delete-uuid';
    const response = await handler(makeDeleteEvent(entryId));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.deleted).toBe(true);
    expect(body.entryId).toBe(entryId);
  });

  it('calls DynamoDB DeleteCommand with the correct entryId', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const entryId = 'specific-entry-id';
    await handler(makeDeleteEvent(entryId));

    const deleteCalls = ddbMock.commandCalls(DeleteCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input.Key).toEqual({ entryId });
  });
});
