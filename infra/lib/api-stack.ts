import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';
import { AuthStack } from './auth-stack';

export interface ApiStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  authStack: AuthStack;
  sageMakerEndpointName?: string;
}

export class ApiStack extends cdk.Stack {
  /** The REST API — used by CdnStack to build the CloudFront origin domain. */
  public readonly restApi: apigw.RestApi;

  /** Expose apiEndpoint for compatibility with CdnStack (https://id.execute-api.region.amazonaws.com/prod) */
  public get httpApi(): { apiEndpoint: string } {
    return {
      apiEndpoint: `https://${this.restApi.restApiId}.execute-api.${this.region}.amazonaws.com/${this.restApi.deploymentStage.stageName}`,
    };
  }

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
    });

    this.manageProfileFn = new lambdaNodejs.NodejsFunction(this, 'ManageProfileFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-manage-profile',
      entry: path.join(handlersDir, 'manage-profile.ts'),
      handler: 'handler',
    });

    this.synthesizeFn = new lambdaNodejs.NodejsFunction(this, 'SynthesizeFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-synthesize',
      entry: path.join(handlersDir, 'synthesize.ts'),
      handler: 'handler',
    });

    this.quoteGeneratorFn = new lambdaNodejs.NodejsFunction(this, 'QuoteGeneratorFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-quote-generator',
      entry: path.join(handlersDir, 'quote-generator.ts'),
      handler: 'handler',
    });

    this.quizFn = new lambdaNodejs.NodejsFunction(this, 'QuizFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-quiz',
      entry: path.join(handlersDir, 'quiz.ts'),
      handler: 'handler',
    });

    this.leaderboardFn = new lambdaNodejs.NodejsFunction(this, 'LeaderboardFn', {
      ...commonLambdaProps,
      functionName: 'colleague-voice-bot-leaderboard',
      entry: path.join(handlersDir, 'leaderboard.ts'),
      handler: 'handler',
    });

    // ── IAM grants ───────────────────────────────────────────────────────────

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

    // ── REST API ─────────────────────────────────────────────────────────────

    this.restApi = new apigw.RestApi(this, 'RestApi', {
      restApiName: 'colleague-voice-bot-api',
      description: 'Colleague Voice Bot REST API',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // ── Cognito Authorizer ───────────────────────────────────────────────────

    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [authStack.userPool],
      authorizerName: 'CognitoAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // ── Lambda integrations ──────────────────────────────────────────────────

    const uploadInt = new apigw.LambdaIntegration(this.uploadSampleFn);
    const profileInt = new apigw.LambdaIntegration(this.manageProfileFn);
    const synthesizeInt = new apigw.LambdaIntegration(this.synthesizeFn);
    const quoteInt = new apigw.LambdaIntegration(this.quoteGeneratorFn);
    const quizInt = new apigw.LambdaIntegration(this.quizFn);
    const leaderboardInt = new apigw.LambdaIntegration(this.leaderboardFn);

    const authOpts: apigw.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    const noAuth: apigw.MethodOptions = {
      authorizationType: apigw.AuthorizationType.NONE,
    };

    // ── /admin ───────────────────────────────────────────────────────────────

    const admin = this.restApi.root.addResource('admin');

    // /admin/samples
    const adminSamples = admin.addResource('samples');
    adminSamples.addMethod('POST', uploadInt, authOpts);

    const adminSample = adminSamples.addResource('{sampleId}');
    adminSample.addMethod('DELETE', uploadInt, authOpts);

    // /admin/profiles
    const adminProfiles = admin.addResource('profiles');
    adminProfiles.addMethod('GET', profileInt, authOpts);

    const adminProfile = adminProfiles.addResource('{colleagueId}');
    const adminProfileBuild = adminProfile.addResource('build');
    adminProfileBuild.addMethod('POST', profileInt, authOpts);

    // /admin/leaderboard
    const adminLeaderboard = admin.addResource('leaderboard');
    const adminLeaderboardEntry = adminLeaderboard.addResource('{entry}');
    adminLeaderboardEntry.addMethod('DELETE', leaderboardInt, authOpts);

    // ── /colleagues ──────────────────────────────────────────────────────────

    const colleagues = this.restApi.root.addResource('colleagues');
    colleagues.addMethod('GET', profileInt, noAuth);

    // ── /synthesize ──────────────────────────────────────────────────────────

    const synthesize = this.restApi.root.addResource('synthesize');
    synthesize.addMethod('POST', synthesizeInt, noAuth);

    // ── /quotes/random ───────────────────────────────────────────────────────

    const quotes = this.restApi.root.addResource('quotes');
    const quotesRandom = quotes.addResource('random');
    quotesRandom.addMethod('POST', quoteInt, noAuth);

    // ── /quiz ────────────────────────────────────────────────────────────────

    const quiz = this.restApi.root.addResource('quiz');
    quiz.addResource('start').addMethod('POST', quizInt, noAuth);
    quiz.addResource('answer').addMethod('POST', quizInt, noAuth);

    // ── /leaderboard ─────────────────────────────────────────────────────────

    const leaderboard = this.restApi.root.addResource('leaderboard');
    leaderboard.addMethod('GET', leaderboardInt, noAuth);
    leaderboard.addMethod('POST', leaderboardInt, noAuth);

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'RestApiUrl', {
      value: this.restApi.url,
      exportName: 'ColleagueVoiceBot-RestApiUrl',
    });

    new cdk.CfnOutput(this, 'RestApiId', {
      value: this.restApi.restApiId,
      exportName: 'ColleagueVoiceBot-RestApiId',
    });
  }
}
