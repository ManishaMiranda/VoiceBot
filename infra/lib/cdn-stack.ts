import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // ── Origin Access Control (OAC) for UI S3 bucket ─────────────────────────
    // Using L1 CfnOriginAccessControl + escape hatch because
    // S3BucketOrigin.withOriginAccessControl has a known limitation with
    // cross-stack bucket references (CDK issue #31462).

    const uiOac = new cloudfront.CfnOriginAccessControl(this, 'UiBucketOAC', {
      originAccessControlConfig: {
        name: 'colleague-voice-bot-ui-oac',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'OAC for Colleague Voice Bot UI S3 bucket',
      },
    });

    // ── API Gateway origin ───────────────────────────────────────────────────

    // Strip the https:// prefix from the API endpoint to get the domain name
    const apiDomainName = cdk.Fn.select(
      2,
      cdk.Fn.split('/', apiStack.httpApi.apiEndpoint),
    );

    const apiOrigin = new cloudfrontOrigins.HttpOrigin(apiDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // ── UI S3 bucket origin (no OAC at L2 — attached via escape hatch below) ─

    const uiS3Origin = cloudfrontOrigins.S3BucketOrigin.withBucketDefaults(
      storageStack.uiBucket,
    );

    // ── Audio S3 bucket origin ───────────────────────────────────────────────

    const audioS3Origin = cloudfrontOrigins.S3BucketOrigin.withBucketDefaults(
      storageStack.audioBucket,
    );

    // ── CloudFront Distribution ──────────────────────────────────────────────

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Colleague Voice Bot CDN',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      // Default behavior: UI S3 bucket, cached
      defaultBehavior: {
        origin: uiS3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },

      additionalBehaviors: {
        // /api/* → API Gateway, no caching, all methods, forward all headers
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },

        // /audio/* → Audio S3 bucket, TTL=0 (no caching for presigned URLs)
        '/audio/*': {
          origin: audioS3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        },
      },

      // SPA fallback: serve index.html for unknown paths
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

    // ── Attach OAC to the UI S3 origin via L1 escape hatch ──────────────────
    // The default origin (index 0) is the UI S3 bucket.
    // We override the OAC ID and clear the legacy OAI identity string.

    const cfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      uiOac.attrId,
    );
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    );

    // ── Grant CloudFront OAC read access to UI S3 bucket ────────────────────

    storageStack.uiBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipalOAC',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [storageStack.uiBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': cdk.Stack.of(this).formatArn({
              service: 'cloudfront',
              resource: 'distribution',
              resourceName: this.distribution.distributionId,
              region: '',
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            }),
          },
        },
      }),
    );

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
