import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly audioBucket: s3.Bucket;
  public readonly uiBucket: s3.Bucket;
  public readonly voiceProfilesTable: dynamodb.Table;
  public readonly voiceSamplesTable: dynamodb.Table;
  public readonly synthesisCacheTable: dynamodb.Table;
  public readonly quizScoresTable: dynamodb.Table;
  public readonly quoteLibraryTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 Buckets ──────────────────────────────────────────────────────────

    this.audioBucket = new s3.Bucket(this, 'AudioBucket', {
      bucketName: `colleague-voice-bot-audio-${cdk.Aws.ACCOUNT_ID}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    this.uiBucket = new s3.Bucket(this, 'UiBucket', {
      bucketName: `colleague-voice-bot-ui-${cdk.Aws.ACCOUNT_ID}`,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB Tables ──────────────────────────────────────────────────────

    // 1. VoiceProfiles — PK: colleagueId
    this.voiceProfilesTable = new dynamodb.Table(this, 'VoiceProfilesTable', {
      tableName: 'VoiceProfiles',
      partitionKey: { name: 'colleagueId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 2. VoiceSamples — PK: sampleId, GSI ColleagueIndex (PK: colleagueId, SK: uploadedAt)
    this.voiceSamplesTable = new dynamodb.Table(this, 'VoiceSamplesTable', {
      tableName: 'VoiceSamples',
      partitionKey: { name: 'sampleId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.voiceSamplesTable.addGlobalSecondaryIndex({
      indexName: 'ColleagueIndex',
      partitionKey: { name: 'colleagueId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'uploadedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 3. SynthesisCache — PK: cacheKey, TTL attribute: ttl
    this.synthesisCacheTable = new dynamodb.Table(this, 'SynthesisCacheTable', {
      tableName: 'SynthesisCache',
      partitionKey: { name: 'cacheKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 4. QuizScores — PK: entryId, GSI LeaderboardIndex (PK: leaderboard, SK: score Number)
    this.quizScoresTable = new dynamodb.Table(this, 'QuizScoresTable', {
      tableName: 'QuizScores',
      partitionKey: { name: 'entryId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.quizScoresTable.addGlobalSecondaryIndex({
      indexName: 'LeaderboardIndex',
      partitionKey: { name: 'leaderboard', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'score', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 5. QuoteLibrary — PK: quoteId
    this.quoteLibraryTable = new dynamodb.Table(this, 'QuoteLibraryTable', {
      tableName: 'QuoteLibrary',
      partitionKey: { name: 'quoteId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: this.audioBucket.bucketName,
      exportName: 'ColleagueVoiceBot-AudioBucketName',
    });

    new cdk.CfnOutput(this, 'UiBucketName', {
      value: this.uiBucket.bucketName,
      exportName: 'ColleagueVoiceBot-UiBucketName',
    });

    new cdk.CfnOutput(this, 'VoiceProfilesTableName', {
      value: this.voiceProfilesTable.tableName,
      exportName: 'ColleagueVoiceBot-VoiceProfilesTableName',
    });

    new cdk.CfnOutput(this, 'VoiceSamplesTableName', {
      value: this.voiceSamplesTable.tableName,
      exportName: 'ColleagueVoiceBot-VoiceSamplesTableName',
    });

    new cdk.CfnOutput(this, 'SynthesisCacheTableName', {
      value: this.synthesisCacheTable.tableName,
      exportName: 'ColleagueVoiceBot-SynthesisCacheTableName',
    });

    new cdk.CfnOutput(this, 'QuizScoresTableName', {
      value: this.quizScoresTable.tableName,
      exportName: 'ColleagueVoiceBot-QuizScoresTableName',
    });

    new cdk.CfnOutput(this, 'QuoteLibraryTableName', {
      value: this.quoteLibraryTable.tableName,
      exportName: 'ColleagueVoiceBot-QuoteLibraryTableName',
    });
  }
}
