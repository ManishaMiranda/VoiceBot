/**
 * Post-deployment smoke tests.
 *
 * These tests run against a deployed environment using real AWS SDK clients
 * (no mocks). They require the following environment variables to be set:
 *
 *   CLOUDFRONT_URL          — the CloudFront distribution URL
 *   AUDIO_BUCKET_NAME       — the audio S3 bucket name
 *   VOICE_PROFILES_TABLE    — DynamoDB VoiceProfiles table name
 *   QUOTE_LIBRARY_TABLE     — DynamoDB QuoteLibrary table name
 *   SAGEMAKER_ENDPOINT_NAME — SageMaker endpoint name
 *   AWS_REGION              — AWS region (default: us-east-1)
 *
 * Each test skips gracefully if the required env var is not set.
 */

import axios from 'axios';
import { S3Client, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { SageMakerClient, DescribeEndpointCommand } from '@aws-sdk/client-sagemaker';

const region = process.env.AWS_REGION ?? 'us-east-1';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Smoke tests — deployed environment', () => {
  it('CloudFront URL returns HTTP 200 with HTML content', async () => {
    const cloudfrontUrl = process.env.CLOUDFRONT_URL;
    if (!cloudfrontUrl) {
      console.log('Skipping: CLOUDFRONT_URL not set');
      return;
    }

    const response = await axios.get(`${cloudfrontUrl}/`, {
      validateStatus: () => true, // don't throw on non-2xx
    });

    expect(response.status).toBe(200);
    const html = response.data as string;
    expect(html.toLowerCase()).toMatch(/<html|<!doctype/i);
  });

  it('S3 audio bucket has public access blocked', async () => {
    const bucketName = process.env.AUDIO_BUCKET_NAME;
    if (!bucketName) {
      console.log('Skipping: AUDIO_BUCKET_NAME not set');
      return;
    }

    const s3 = new S3Client({ region });
    const result = await s3.send(
      new GetPublicAccessBlockCommand({ Bucket: bucketName }),
    );

    expect(result.PublicAccessBlockConfiguration?.BlockPublicAcls).toBe(true);
    expect(result.PublicAccessBlockConfiguration?.BlockPublicPolicy).toBe(true);
  });

  it('VoiceProfiles table contains exactly 7 entries', async () => {
    const tableName = process.env.VOICE_PROFILES_TABLE;
    if (!tableName) {
      console.log('Skipping: VOICE_PROFILES_TABLE not set');
      return;
    }

    const dynamo = new DynamoDBClient({ region });
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        Select: 'COUNT',
      }),
    );

    expect(result.Count).toBe(7);
  });

  it('QuoteLibrary table contains at least 50 entries', async () => {
    const tableName = process.env.QUOTE_LIBRARY_TABLE;
    if (!tableName) {
      console.log('Skipping: QUOTE_LIBRARY_TABLE not set');
      return;
    }

    const dynamo = new DynamoDBClient({ region });
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        Select: 'COUNT',
      }),
    );

    expect(result.Count).toBeGreaterThanOrEqual(50);
  });

  it('SageMaker endpoint is InService', async () => {
    const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME;
    if (!endpointName) {
      console.log('Skipping: SAGEMAKER_ENDPOINT_NAME not set');
      return;
    }

    const sagemaker = new SageMakerClient({ region });
    const result = await sagemaker.send(
      new DescribeEndpointCommand({ EndpointName: endpointName }),
    );

    expect(result.EndpointStatus).toBe('InService');
  });
});
