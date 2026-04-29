/**
 * Seed script: writes all quotes from quotes.ts to the QuoteLibrary DynamoDB table.
 *
 * Usage:
 *   QUOTE_LIBRARY_TABLE=QuoteLibrary AWS_REGION=us-east-1 ts-node backend/scripts/seed-quotes.ts
 *
 * Reads QUOTE_LIBRARY_TABLE and AWS_REGION from environment variables.
 * Writes items in batches of 25 (DynamoDB BatchWriteItem limit).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { QUOTES } from '../src/data/quotes';

const TABLE_NAME = process.env.QUOTE_LIBRARY_TABLE ?? 'QuoteLibrary';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BATCH_SIZE = 25;

async function seedQuotes(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log(`Seeding ${QUOTES.length} quotes into table "${TABLE_NAME}" (region: ${REGION})`);

  // Split into batches of 25
  for (let i = 0; i < QUOTES.length; i += BATCH_SIZE) {
    const batch = QUOTES.slice(i, i + BATCH_SIZE);

    const requestItems = batch.map((quote) => ({
      PutRequest: {
        Item: quote,
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: requestItems,
        },
      }),
    );

    console.log(`  Wrote batch ${Math.floor(i / BATCH_SIZE) + 1}: items ${i + 1}–${i + batch.length}`);
  }

  console.log('Seed complete.');
}

seedQuotes().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
