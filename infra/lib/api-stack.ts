import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';
import { AuthStack } from './auth-stack';

export interface ApiStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  authStack: AuthStack;
  sageMakerEndpointName?: string;
}

/**
 * ApiStack — Lambda Function URLs instead of API Gateway.
 *
 * The SCP in this AWS organization blocks both API Gateway v1 (/restapis)
 * and v2 (/apis). Lambda Function URLs provide direct HTTPS endpoints with
 * no API Gateway dependency.
 *
 * Auth strategy: admin routes validate the Cognito JWT inside the Lambda
 * handler itself (the JWT is passed in the Authorization header as before).
 * Public routes have no auth check.
 *
 * CloudFront routes by path prefix to the correct Function URL origin.
 */
export class ApiStack extends cdk.Stack {
  // Function URL domains (without https://) — used by CdnStack as origins
  public readonly uploadSampleUrlDomain: string;
  public readonly manageProfileUrlDomain: string;
  public readonly synthesizeUrlDomain: string;
  public readonly quoteGeneratorUrlDomain: string;
  public readonly quizUrlDomain: string;
  public readonly leaderboardUrlDomain: string;

  // Full Function URLs — exported as outputs
  public readonly uploadSampleUrl: string;
  public readonly manageProfileUrl: string;
  public readonly synthesizeUrl: string;
  public readonly quoteGeneratorUrl: string;
  public readonly quizUrl: string;
  public readonly leaderboardUrl: string;

  public readonly uploadSampleFn: lambdaNodejs.NodejsFunction;
  public readonly manageProfileFn: lambdaNodejs.NodejsFunction;
  public readonly synthesizeFn: lambdaNodejs.NodejsFunction;
  public readonly quoteGeneratorFn: lambdaNodejs.NodejsFunction;
  public readonly quizFn: lambdaNodejs.NodejsFunction;
  public readonly leaderboardFn: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { storageStack, sageMakerEndpointName = 'colleague-voice-bot-endpoint' } = props;

    // ── Shared Lambda environment variables ──────────────────────────────────

    const commonEnv: Record<string, string> = {
      VOICE_PROFILES_TABLE: storageStack.voiceProfilesTable.tableName,
      VOICE_SAMPLES_TABLE: storageStack.voiceSamplesTable.tableName,
      SYNTHESIS_CACHE_TABLE: storageStack.synthesisCacheTable.tableName,
      QUIZ_SCORES_TABLE: storageStack.quizScoresTable.tableName,
      QUOTE_LIBRARY_TABLE: storageStack.quoteLibraryTable.tableName,
      AUDIO_BUCKET_NAME: storageStack.audioBucket.bucketName,
      SAGEMAKER_ENDPOINT_NAME: sageMakerEndpointName,
      // Cognito details for in-Lambda JWT validation on admin routes
      COGNITO_USER_POOL_ID: props.authStack.userPool.userPoolId,
      COGNITO_CLIENT_ID: props.authStack.userPoolClient.userPoolClientId,
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

    // ── Lambda Function URLs (CORS enabled, no auth at URL level) ────────────
    // Auth for admin routes is handled inside the Lambda handlers using the
    // Cognito JWT passed in the Authorization header.

    const fnUrlOptions: lambda.FunctionUrlOptions = {
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['Content-Type', 'Authorization'],
      },
    };

    const uploadUrl = this.uploadSampleFn.addFunctionUrl(fnUrlOptions);
    const profileUrl = this.manageProfileFn.addFunctionUrl(fnUrlOptions);
    const synthesizeUrl = this.synthesizeFn.addFunctionUrl(fnUrlOptions);
    const quoteUrl = this.quoteGeneratorFn.addFunctionUrl(fnUrlOptions);
    const quizUrl = this.quizFn.addFunctionUrl(fnUrlOptions);
    const leaderboardUrl = this.leaderboardFn.addFunctionUrl(fnUrlOptions);

    // Extract domain names (strip https://) for CloudFront origins
    this.uploadSampleUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', uploadUrl.url));
    this.manageProfileUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', profileUrl.url));
    this.synthesizeUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', synthesizeUrl.url));
    this.quoteGeneratorUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', quoteUrl.url));
    this.quizUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', quizUrl.url));
    this.leaderboardUrlDomain = cdk.Fn.select(2, cdk.Fn.split('/', leaderboardUrl.url));

    this.uploadSampleUrl = uploadUrl.url;
    this.manageProfileUrl = profileUrl.url;
    this.synthesizeUrl = synthesizeUrl.url;
    this.quoteGeneratorUrl = quoteUrl.url;
    this.quizUrl = quizUrl.url;
    this.leaderboardUrl = leaderboardUrl.url;

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UploadSampleUrl', { value: uploadUrl.url });
    new cdk.CfnOutput(this, 'ManageProfileUrl', { value: profileUrl.url });
    new cdk.CfnOutput(this, 'SynthesizeUrl', { value: synthesizeUrl.url });
    new cdk.CfnOutput(this, 'QuoteGeneratorUrl', { value: quoteUrl.url });
    new cdk.CfnOutput(this, 'QuizUrl', { value: quizUrl.url });
    new cdk.CfnOutput(this, 'LeaderboardUrl', { value: leaderboardUrl.url });
  }
}
