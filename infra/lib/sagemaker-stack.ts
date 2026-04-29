import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';

export interface SageMakerStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  /**
   * Full ECR image URI for the XTTS v2 model container.
   * e.g. 012345678901.dkr.ecr.us-east-1.amazonaws.com/colleague-voice-bot-model:latest
   *
   * Read from the MODEL_IMAGE_URI environment variable at synth time.
   * The build-and-push-model CI job pushes the image before cdk deploy runs.
   */
  modelImageUri: string;
}

export class SageMakerStack extends cdk.Stack {
  /** The name of the deployed SageMaker real-time inference endpoint. */
  public readonly endpointName: string;

  constructor(scope: Construct, id: string, props: SageMakerStackProps) {
    super(scope, id, props);

    const { storageStack, modelImageUri } = props;

    // ── ECR Repository ───────────────────────────────────────────────────────
    // The ECR repository is created by the CI pipeline (aws ecr create-repository)
    // before the Docker image is pushed. We import it here as a reference so
    // we can grant the SageMaker execution role pull access.
    // We do NOT create it via CDK to avoid conflicts with the pre-existing repo.

    const ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      'ModelRepository',
      'colleague-voice-bot-model',
    );

    // ── SageMaker Execution Role ─────────────────────────────────────────────

    const executionRole = new iam.Role(this, 'SageMakerExecutionRole', {
      roleName: 'colleague-voice-bot-sagemaker-role',
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Execution role for the Colleague Voice Bot SageMaker endpoint',
    });

    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
    );

    // S3 read — container fetches speaker WAV files at inference time
    storageStack.audioBucket.grantRead(executionRole);

    // ECR pull — allow SageMaker to pull the model image
    ecrRepo.grantPull(executionRole);

    // ── SageMaker Model ──────────────────────────────────────────────────────

    const endpointName = 'colleague-voice-bot-endpoint';
    this.endpointName = endpointName;

    const sageMakerModel = new sagemaker.CfnModel(this, 'Model', {
      modelName: 'colleague-voice-bot-model',
      executionRoleArn: executionRole.roleArn,
      primaryContainer: {
        // Image URI is passed in from the pipeline — no DockerImageAsset needed.
        image: modelImageUri,
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
    });
  }
}
