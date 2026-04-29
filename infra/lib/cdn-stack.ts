import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';
import { ApiStack } from './api-stack';

export interface CdnStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  apiStack: ApiStack;
}

export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { storageStack, apiStack } = props;

    // ── Origin Access Control (OAC) ──────────────────────────────────────────
    // OAC is the modern replacement for OAI. We use it for both S3 buckets.
    // The SCP in this account blocks CreateCloudFrontOriginAccessIdentity, so
    // we must NOT use S3Origin (which auto-creates an OAI). Instead we build
    // origins entirely from L1 constructs so no OAI is ever requested.

    const uiOac = new cloudfront.CfnOriginAccessControl(this, 'UiBucketOAC', {
      originAccessControlConfig: {
        name: 'colleague-voice-bot-ui-oac',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'OAC for Colleague Voice Bot UI S3 bucket',
      },
    });

    const audioOac = new cloudfront.CfnOriginAccessControl(this, 'AudioBucketOAC', {
      originAccessControlConfig: {
        name: 'colleague-voice-bot-audio-oac',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'OAC for Colleague Voice Bot audio S3 bucket',
      },
    });

    // ── API Gateway origin ───────────────────────────────────────────────────

    const apiDomainName = cdk.Fn.select(
      2,
      cdk.Fn.split('/', apiStack.httpApi.apiEndpoint),
    );

    const apiOrigin = new cloudfrontOrigins.HttpOrigin(apiDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // ── S3 origins built from L1 — NO OAI created ───────────────────────────
    // We use a dummy HttpOrigin placeholder at the L2 level, then override the
    // CloudFormation properties to point at the real S3 regional domain names
    // with OAC and no OAI. This avoids any call to CreateCloudFrontOriginAccessIdentity.

    const uiBucketRegionalDomain =
      `${storageStack.uiBucket.bucketName}.s3.${this.region}.amazonaws.com`;
    const audioBucketRegionalDomain =
      `${storageStack.audioBucket.bucketName}.s3.${this.region}.amazonaws.com`;

    // Use HttpOrigin with the S3 regional domain — CloudFront accepts this for
    // OAC-signed requests. We set customHeaders to nothing and rely on OAC signing.
    const uiS3Origin = new cloudfrontOrigins.HttpOrigin(uiBucketRegionalDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const audioS3Origin = new cloudfrontOrigins.HttpOrigin(audioBucketRegionalDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // ── CloudFront Distribution ──────────────────────────────────────────────

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Colleague Voice Bot CDN',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      defaultBehavior: {
        origin: uiS3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },

      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/audio/*': {
          origin: audioS3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        },
      },

      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ── Attach OAC to S3 origins via L1 escape hatch ─────────────────────────
    // HttpOrigin creates a CustomOriginConfig (no OAI). We attach the OAC IDs
    // so CloudFront signs requests to S3 with SigV4.
    // Origin index 0 = UI bucket (default behavior), index 2 = audio bucket.
    // Index 1 = API Gateway origin.

    const cfnDist = this.distribution.node.defaultChild as cloudfront.CfnDistribution;

    // UI bucket origin (index 0): attach OAC
    cfnDist.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      uiOac.attrId,
    );

    // Audio bucket origin (index 2): attach OAC
    // Note: additionalBehaviors origins are appended after the default origin.
    // /api/* is index 1, /audio/* is index 2.
    cfnDist.addPropertyOverride(
      'DistributionConfig.Origins.2.OriginAccessControlId',
      audioOac.attrId,
    );

    // ── Bucket policies: allow CloudFront OAC to read from S3 ────────────────
    // Use standalone CfnBucketPolicy resources (live in CdnStack) to avoid
    // the cyclic cross-stack dependency that addToResourcePolicy() would cause.

    const distributionArn = cdk.Stack.of(this).formatArn({
      service: 'cloudfront',
      resource: 'distribution',
      resourceName: this.distribution.distributionId,
      region: '',
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    });

    new s3.CfnBucketPolicy(this, 'UiBucketPolicy', {
      bucket: storageStack.uiBucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowCloudFrontOACUi',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${storageStack.uiBucket.bucketName}/*`,
            Condition: {
              StringEquals: { 'AWS:SourceArn': distributionArn },
            },
          },
        ],
      },
    });

    new s3.CfnBucketPolicy(this, 'AudioBucketPolicy', {
      bucket: storageStack.audioBucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowCloudFrontOACAudio',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${storageStack.audioBucket.bucketName}/*`,
            Condition: {
              StringEquals: { 'AWS:SourceArn': distributionArn },
            },
          },
        ],
      },
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      exportName: 'ColleagueVoiceBot-DistributionDomainName',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      exportName: 'ColleagueVoiceBot-DistributionId',
    });

    // ── Deploy frontend build to UI S3 bucket ────────────────────────────────

    new s3deploy.BucketDeployment(this, 'DeployUi', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: storageStack.uiBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
