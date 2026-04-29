import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';

export interface SageMakerStackProps extends cdk.StackProps {
  storageStack: StorageStack;
}

export class SageMakerStack extends cdk.Stack {
  /** The name of the deployed SageMaker real-time inference endpoint. */
  public readonly endpointName: string;

  constructor(scope: Construct, id: string, props: SageMakerStackProps) {
    super(scope, id, props);

    const { storageStack } = props;

    // ── ECR Repository ───────────────────────────────────────────────────────
    // Retained on stack deletion so that existing SageMaker models that
    // reference the image are not broken.

    const ecrRepo = new ecr.Repository(this, 'ModelRepository', {
      repositoryName: 'colleague-voice-bot-model',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });

    // ── Docker Image Asset ───────────────────────────────────────────────────
    // CDK builds the image from model/ and pushes it to ECR during `cdk deploy`.

    const modelImage = new ecr_assets.DockerImageAsset(this, 'ModelImage', {
      directory: path.join(__dirname, '../../model'),
      platform: ecr_assets.Platform.LINUX_AMD64, // ml.g4dn.xlarge is x86_64
    });

    // ── SageMaker Execution Role ─────────────────────────────────────────────

    const executionRole = new iam.Role(this, 'SageMakerExecutionRole', {
      roleName: 'colleague-voice-bot-sagemaker-role',
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Execution role for the Colleague Voice Bot SageMaker endpoint',
    });

    // SageMaker managed policy (covers CloudWatch Logs, ECR pull, etc.)
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
    );

    // S3 read access — the container fetches speaker WAV files at inference time
    storageStack.audioBucket.grantRead(executionRole);

    // ECR read access — pull the model image
    ecrRepo.grantPull(executionRole);
    modelImage.repository.grantPull(executionRole);

    // ── SageMaker Model ──────────────────────────────────────────────────────

    const endpointName = 'colleague-voice-bot-endpoint';
    this.endpointName = endpointName;

    const sageMakerModel = new sagemaker.CfnModel(this, 'Model', {
      modelName: 'colleague-voice-bot-model',
      executionRoleArn: executionRole.roleArn,
      primaryContainer: {
        image: modelImage.imageUri,
        environment: {
          AUDIO_BUCKET_NAME: storageStack.audioBucket.bucketName,
          AWS_DEFAULT_REGION: 'us-east-1',
        },
      },
    });

    // ── SageMaker Endpoint Configuration ────────────────────────────────────

    const endpointConfig = new sagemaker.CfnEndpointConfig(this, 'EndpointConfig', {
      endpointConfigName: 'colleague-voice-bot-endpoint-config',
      productionVariants: [
        {
          variantName: 'AllTraffic',
          modelName: sageMakerModel.modelName!,
          instanceType: 'ml.g4dn.xlarge',
          initialInstanceCount: 1,
          initialVariantWeight: 1.0,
        },
      ],
    });

    endpointConfig.addDependency(sageMakerModel);

    // ── SageMaker Endpoint ───────────────────────────────────────────────────

    const endpoint = new sagemaker.CfnEndpoint(this, 'Endpoint', {
      endpointName,
      endpointConfigName: endpointConfig.endpointConfigName!,
    });

    endpoint.addDependency(endpointConfig);

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'SageMakerEndpointName', {
      value: endpointName,
      exportName: 'ColleagueVoiceBot-SageMakerEndpointName',
      description: 'Name of the SageMaker real-time inference endpoint',
    });

    new cdk.CfnOutput(this, 'ModelRepositoryUri', {
      value: ecrRepo.repositoryUri,
      exportName: 'ColleagueVoiceBot-ModelRepositoryUri',
      description: 'ECR repository URI for the XTTS v2 model image',
    });
  }
}
