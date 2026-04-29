import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';
import { AuthStack } from './auth-stack';

export interface ApiStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  authStack: AuthStack;
  sageMakerEndpointName?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly uploadSampleFn: lambdaNodejs.NodejsFunction;
  public readonly manageProfileFn: lambdaNodejs.NodejsFunction;
  public readonly synthesizeFn: lambdaNodejs.NodejsFunction;
  public readonly quoteGeneratorFn: lambdaNodejs.NodejsFunction;
  public readonly quizFn: lambdaNodejs.NodejsFunction;
  public readonly leaderboardFn: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { storageStack, authStack, sageMakerEndpointName = 'colleague-voice-bot-endpoint' } = props;

    // ── Shared Lambda environment variables ──────────────────────────────────

    const commonEnv: Record<string, string> = {
      VOICE_PROFILES_TABLE: storageStack.voiceProfilesTable.tableName,
      VOICE_SAMPLES_TABLE: storageStack.voiceSamplesTable.tableName,
      SYNTHESIS_CACHE_TABLE: storageStack.synthesisCacheTable.tableName,
      QUIZ_SCORES_TABLE: storageStack.quizScoresTable.tableName,
      QUOTE_LIBRARY_TABLE: storageStack.quoteLibraryTable.tableName,
      AUDIO_BUCKET_NAME: storageStack.audioBucket.bucketName,
      SAGEMAKER_ENDPOINT_NAME: sageMakerEndpointName,
    };

    // ── Shared Lambda configuration ──────────────────────────────────────────

    const commonLambdaProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node20',
      },
    };

    const handlersDir = path.join(__dirname, '../../backend/src/handlers');

    // ── Lambda Functions ─────────────────────────────────────────────────────

    this.uploadSampleFn = new lambdaNodejs.NodejsFunction(this, 'UploadSampleFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-upload-sample',
      entry: path.join(handlersDir, 'upload-sample.ts'),
      handler: 'handler',
      description: 'Handles voice sample upload and deletion',
    });

    this.manageProfileFn = new lambdaNodejs.NodejsFunction(this, 'ManageProfileFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-manage-profile',
      entry: path.join(handlersDir, 'manage-profile.ts'),
      handler: 'handler',
      description: 'Manages voice profiles (build, list)',
    });

    this.synthesizeFn = new lambdaNodejs.NodejsFunction(this, 'SynthesizeFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-synthesize',
      entry: path.join(handlersDir, 'synthesize.ts'),
      handler: 'handler',
      description: 'Synthesizes speech via SageMaker XTTS v2',
    });

    this.quoteGeneratorFn = new lambdaNodejs.NodejsFunction(this, 'QuoteGeneratorFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-quote-generator',
      entry: path.join(handlersDir, 'quote-generator.ts'),
      handler: 'handler',
      description: 'Generates random humorous quotes with synthesized audio',
    });

    this.quizFn = new lambdaNodejs.NodejsFunction(this, 'QuizFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-quiz',
      entry: path.join(handlersDir, 'quiz.ts'),
      handler: 'handler',
      description: 'Manages voice-guessing quiz rounds and scoring',
    });

    this.leaderboardFn = new lambdaNodejs.NodejsFunction(this, 'LeaderboardFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-leaderboard',
      entry: path.join(handlersDir, 'leaderboard.ts'),
      handler: 'handler',
      description: 'Manages leaderboard read/write/delete',
    });

    // ── Grant Lambda permissions to AWS resources ────────────────────────────

    storageStack.audioBucket.grantReadWrite(this.uploadSampleFn);
    storageStack.audioBucket.grantReadWrite(this.manageProfileFn);
    storageStack.audioBucket.grantReadWrite(this.synthesizeFn);
    storageStack.audioBucket.grantRead(this.quoteGeneratorFn);
    storageStack.audioBucket.grantRead(this.quizFn);

    storageStack.voiceProfilesTable.grantReadWriteData(this.uploadSampleFn);
    storageStack.voiceProfilesTable.grantReadWriteData(this.manageProfileFn);
    storageStack.voiceProfilesTable.grantReadData(this.synthesizeFn);
    storageStack.voiceProfilesTable.grantReadData(this.quoteGeneratorFn);
    storageStack.voiceProfilesTable.grantReadData(this.quizFn);

    storageStack.voiceSamplesTable.grantReadWriteData(this.uploadSampleFn);
    storageStack.voiceSamplesTable.grantReadData(this.manageProfileFn);

    storageStack.synthesisCacheTable.grantReadWriteData(this.synthesizeFn);
    storageStack.synthesisCacheTable.grantReadWriteData(this.quoteGeneratorFn);
    storageStack.synthesisCacheTable.grantReadWriteData(this.quizFn);

    storageStack.quizScoresTable.grantReadWriteData(this.quizFn);
    storageStack.quizScoresTable.grantReadWriteData(this.leaderboardFn);

    storageStack.quoteLibraryTable.grantReadData(this.quoteGeneratorFn);

    // ── HTTP API ─────────────────────────────────────────────────────────────

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'colleague-voice-bot-api',
      description: 'Colleague Voice Bot HTTP API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // ── JWT Authorizer ───────────────────────────────────────────────────────

    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      authStack.userPool.userPoolProviderUrl,
      {
        jwtAudience: [authStack.userPoolClient.userPoolClientId],
        authorizerName: 'CognitoJwtAuthorizer',
      },
    );

    // ── Lambda Integrations ──────────────────────────────────────────────────

    const uploadSampleIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'UploadSampleIntegration',
      this.uploadSampleFn,
    );

    const manageProfileIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'ManageProfileIntegration',
      this.manageProfileFn,
    );

    const synthesizeIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'SynthesizeIntegration',
      this.synthesizeFn,
    );

    const quoteGeneratorIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'QuoteGeneratorIntegration',
      this.quoteGeneratorFn,
    );

    const quizIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'QuizIntegration',
      this.quizFn,
    );

    const leaderboardIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'LeaderboardIntegration',
      this.leaderboardFn,
    );

    // ── Admin Routes (JWT authorizer required) ───────────────────────────────

    this.httpApi.addRoutes({
      path: '/admin/samples',
      methods: [apigwv2.HttpMethod.POST],
      integration: uploadSampleIntegration,
      authorizer: jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/admin/samples/{sampleId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: uploadSampleIntegration,
      authorizer: jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/admin/profiles/{colleagueId}/build',
      methods: [apigwv2.HttpMethod.POST],
      integration: manageProfileIntegration,
      authorizer: jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/admin/profiles',
      methods: [apigwv2.HttpMethod.GET],
      integration: manageProfileIntegration,
      authorizer: jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/admin/leaderboard/{entry}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: leaderboardIntegration,
      authorizer: jwtAuthorizer,
    });

    // ── Public Routes (no auth) ──────────────────────────────────────────────

    this.httpApi.addRoutes({
      path: '/colleagues',
      methods: [apigwv2.HttpMethod.GET],
      integration: manageProfileIntegration,
    });

    this.httpApi.addRoutes({
      path: '/synthesize',
      methods: [apigwv2.HttpMethod.POST],
      integration: synthesizeIntegration,
    });

    this.httpApi.addRoutes({
      path: '/quotes/random',
      methods: [apigwv2.HttpMethod.POST],
      integration: quoteGeneratorIntegration,
    });

    this.httpApi.addRoutes({
      path: '/quiz/start',
      methods: [apigwv2.HttpMethod.POST],
      integration: quizIntegration,
    });

    this.httpApi.addRoutes({
      path: '/quiz/answer',
      methods: [apigwv2.HttpMethod.POST],
      integration: quizIntegration,
    });

    this.httpApi.addRoutes({
      path: '/leaderboard',
      methods: [apigwv2.HttpMethod.GET],
      integration: leaderboardIntegration,
    });

    this.httpApi.addRoutes({
      path: '/leaderboard',
      methods: [apigwv2.HttpMethod.POST],
      integration: leaderboardIntegration,
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      exportName: 'ColleagueVoiceBot-HttpApiUrl',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: this.httpApi.apiId,
      exportName: 'ColleagueVoiceBot-HttpApiId',
    });
  }
}
