/**
 * Unit tests for the upload-sample Lambda handler.
 * Uses aws-sdk-client-mock to mock DynamoDB and S3 clients.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Import handler and exported clients AFTER setting up mocks
import { handler, docClient, s3Client } from '../../../backend/src/handlers/upload-sample';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
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

function makeDeleteEvent(sampleId: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `DELETE /admin/samples/{sampleId}`,
    rawPath: `/admin/samples/${sampleId}`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'DELETE',
        path: `/admin/samples/${sampleId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: `DELETE /admin/samples/{sampleId}`,
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: null,
    isBase64Encoded: false,
    pathParameters: { sampleId },
    queryStringParameters: {},
    stageVariables: {},
  } as unknown as APIGatewayProxyEventV2;
}

// A small valid WAV audio buffer (base64-encoded)
const VALID_AUDIO_BASE64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  process.env.VOICE_SAMPLES_TABLE = 'VoiceSamples';
  process.env.AUDIO_BUCKET_NAME = 'colleague-voice-bot-audio';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/samples — upload-sample handler', () => {
  it('happy path: valid WAV 30s → 201 with sampleId and colleagueId', async () => {
    // Mock: no existing samples for this colleague
    ddbMock.on(QueryCommand).resolves({ Count: 0, Items: [] });
    // Mock: S3 put succeeds
    s3Mock.on(PutObjectCommand).resolves({});
    // Mock: DynamoDB put succeeds
    ddbMock.on(PutCommand).resolves({});

    const event = makePostEvent({
      colleagueId: 'alice',
      format: 'wav',
      durationSeconds: 30,
      audioBase64: VALID_AUDIO_BASE64,
      uploadedBy: 'admin-sub-123',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body as string);
    expect(body.sampleId).toBeTruthy();
    expect(typeof body.sampleId).toBe('string');
    expect(body.colleagueId).toBe('alice');
  });

  it('error: unsupported format (mp4) → 400 VALIDATION_ERROR', async () => {
    const event = makePostEvent({
      colleagueId: 'alice',
      format: 'mp4',
      durationSeconds: 30,
      audioBase64: VALID_AUDIO_BASE64,
      uploadedBy: 'admin-sub-123',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('format');
  });

  it('error: duration too short (5s) → 400 VALIDATION_ERROR', async () => {
    const event = makePostEvent({
      colleagueId: 'alice',
      format: 'wav',
      durationSeconds: 5,
      audioBase64: VALID_AUDIO_BASE64,
      uploadedBy: 'admin-sub-123',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('duration');
  });

  it('error: duration too long (400s) → 400 VALIDATION_ERROR', async () => {
    const event = makePostEvent({
      colleagueId: 'alice',
      format: 'wav',
      durationSeconds: 400,
      audioBase64: VALID_AUDIO_BASE64,
      uploadedBy: 'admin-sub-123',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('duration');
  });

  it('error: 11th sample for same colleague → 400 SAMPLE_LIMIT_EXCEEDED', async () => {
    // Mock: 10 existing samples
    ddbMock.on(QueryCommand).resolves({ Count: 10, Items: [] });

    const event = makePostEvent({
      colleagueId: 'alice',
      format: 'wav',
      durationSeconds: 30,
      audioBase64: VALID_AUDIO_BASE64,
      uploadedBy: 'admin-sub-123',
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('SAMPLE_LIMIT_EXCEEDED');
  });
});

describe('DELETE /admin/samples/{sampleId} — upload-sample handler', () => {
  it('happy path: sample exists → 200 { deleted: true, sampleId }', async () => {
    const sampleId = 'test-sample-uuid-1234';
    const s3Key = `samples/alice/${sampleId}.wav`;

    // Mock: get sample record
    ddbMock.on(GetCommand).resolves({
      Item: {
        sampleId,
        colleagueId: 'alice',
        s3Key,
        format: 'wav',
        durationSeconds: 30,
        checksum: 'abc123',
        uploadedAt: '2024-01-01T00:00:00.000Z',
        uploadedBy: 'admin-sub-123',
      },
    });
    // Mock: S3 delete succeeds
    s3Mock.on(DeleteObjectCommand).resolves({});
    // Mock: DynamoDB delete succeeds
    ddbMock.on(DeleteCommand).resolves({});

    const event = makeDeleteEvent(sampleId);
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.deleted).toBe(true);
    expect(body.sampleId).toBe(sampleId);
  });

  it('error: sample not found → 400 VALIDATION_ERROR', async () => {
    const sampleId = 'nonexistent-sample-id';

    // Mock: get returns no item
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeDeleteEvent(sampleId);
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('VALIDATION_ERROR');
  });
});
