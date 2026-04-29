#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';
import { SageMakerStack } from '../lib/sagemaker-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// 1. Storage (S3 + DynamoDB) — no dependencies
const storageStack = new StorageStack(app, 'ColleagueVoiceBotStorage', { env });

// 2. Auth (Cognito) — no dependencies
const authStack = new AuthStack(app, 'ColleagueVoiceBotAuth', { env });

// 3. SageMaker (ECR + model endpoint) — depends on StorageStack
const sageMakerStack = new SageMakerStack(app, 'ColleagueVoiceBotSageMaker', {
  env,
  storageStack,
});
sageMakerStack.addDependency(storageStack);

// 4. API (API Gateway + Lambda stubs) — depends on StorageStack + AuthStack + SageMakerStack
const apiStack = new ApiStack(app, 'ColleagueVoiceBotApi', {
  env,
  storageStack,
  authStack,
  sageMakerEndpointName: sageMakerStack.endpointName,
});
apiStack.addDependency(storageStack);
apiStack.addDependency(authStack);
apiStack.addDependency(sageMakerStack);

// 5. CDN (CloudFront) — depends on StorageStack + ApiStack
const cdnStack = new CdnStack(app, 'ColleagueVoiceBotCdn', {
  env,
  storageStack,
  apiStack,
});
cdnStack.addDependency(storageStack);
cdnStack.addDependency(apiStack);

app.synth();
