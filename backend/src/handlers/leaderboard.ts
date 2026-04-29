/**
 * leaderboard Lambda handler.
 *
 * Routes:
 *   GET    /leaderboard                  — get top 10 entries
 *   POST   /leaderboard                  — submit a score with nickname
 *   DELETE /admin/leaderboard/{entry}    — admin delete an entry
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { withRetry } from '../utils/dynamoRetry';
import { ValidationError } from '../utils/errors';
import { getMethod, getPath, getPathParameters } from '../utils/eventHelpers';

// ---------------------------------------------------------------------------
// AWS clients (exported for test mocking)
// ---------------------------------------------------------------------------
const dynamoClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamoClient);

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const QUIZ_SCORES_TABLE = process.env.QUIZ_SCORES_TABLE ?? 'QuizScores';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LeaderboardPostBody {
  nickname: string;
  score: number;
  gamesPlayed?: number;
}

// ---------------------------------------------------------------------------
// GET /leaderboard
// ---------------------------------------------------------------------------
async function handleGetLeaderboard(): Promise<APIGatewayProxyResultV2> {
  // Query LeaderboardIndex GSI: PK=leaderboard="global", SK=score, descending, limit 10
  const result = await withRetry(() =>
    docClient.send(
      new QueryCommand({
        TableName: QUIZ_SCORES_TABLE,
        IndexName: 'LeaderboardIndex',
        KeyConditionExpression: 'leaderboard = :lb',
        ExpressionAttributeValues: { ':lb': 'global' },
        ScanIndexForward: false,
        Limit: 10,
      }),
    ),
  );

  const entries = (result.Items ?? []).map((item) => ({
    nickname: item.nickname,
    score: item.score,
    gamesPlayed: item.gamesPlayed ?? 0,
    updatedAt: item.updatedAt,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  };
}

// ---------------------------------------------------------------------------
// POST /leaderboard
// ---------------------------------------------------------------------------
async function handlePostLeaderboard(body: LeaderboardPostBody): Promise<APIGatewayProxyResultV2> {
  const { nickname, score, gamesPlayed } = body;

  // Validate
  if (!nickname || typeof nickname !== 'string' || nickname.trim() === '') {
    throw new ValidationError('nickname is required and must be a non-empty string', 'nickname', 'required');
  }
  if (typeof score !== 'number' || score < 0) {
    throw new ValidationError('score must be a non-negative number', 'score', 'min=0');
  }

  const entryId = randomUUID();
  const now = new Date().toISOString();

  await withRetry(() =>
    docClient.send(
      new PutCommand({
        TableName: QUIZ_SCORES_TABLE,
        Item: {
          entryId,
          nickname: nickname.trim(),
          score,
          gamesPlayed: gamesPlayed ?? 0,
          leaderboard: 'global',
          updatedAt: now,
        },
      }),
    ),
  );

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId, nickname: nickname.trim(), score }),
  };
}

// ---------------------------------------------------------------------------
// DELETE /admin/leaderboard/{entry}
// ---------------------------------------------------------------------------
async function handleDeleteLeaderboard(entryId: string): Promise<APIGatewayProxyResultV2> {
  if (!entryId || entryId.trim() === '') {
    throw new ValidationError('entryId path parameter is required', 'entryId', 'required');
  }

  await withRetry(() =>
    docClient.send(
      new DeleteCommand({
        TableName: QUIZ_SCORES_TABLE,
        Key: { entryId },
      }),
    ),
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleted: true, entryId }),
  };
}

// ---------------------------------------------------------------------------
// Lambda entry point
// ---------------------------------------------------------------------------
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const method = getMethod(event);
    const path = getPath(event);

    // GET /leaderboard
    if (method === 'GET' && path.endsWith('/leaderboard')) {
      return await handleGetLeaderboard();
    }

    // POST /leaderboard
    if (method === 'POST' && path.endsWith('/leaderboard')) {
      if (!event.body) {
        throw new ValidationError('Request body is required', 'body', 'required');
      }
      const body: LeaderboardPostBody = JSON.parse(event.body);
      return await handlePostLeaderboard(body);
    }

    // DELETE /admin/leaderboard/{entry}
    if (method === 'DELETE' && path.includes('/admin/leaderboard/')) {
      const entryId = getPathParameters(event)?.entry ?? '';
      return await handleDeleteLeaderboard(entryId);
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
    console.error('Unhandled error in leaderboard handler', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR' }),
    };
  }
};
