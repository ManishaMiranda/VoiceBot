import * as fs from 'fs';
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

    // ── OAC for S3 buckets ───────────────────────────────────────────────────

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

    // ── S3 origins (HttpOrigin with regional domain — no OAI) ────────────────

    const region = cdk.Stack.of(this).region;

    const uiS3Origin = new cloudfrontOrigins.HttpOrigin(
      `${storageStack.uiBucket.bucketName}.s3.${region}.amazonaws.com`,
      { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY },
    );

    const audioS3Origin = new cloudfrontOrigins.HttpOrigin(
      `${storageStack.audioBucket.bucketName}.s3.${region}.amazonaws.com`,
      { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY },
    );

    // ── Lambda Function URL origins ──────────────────────────────────────────
    // Each Lambda has its own Function URL. CloudFront routes by path prefix.

    const makeLambdaOrigin = (domain: string) =>
      new cloudfrontOrigins.HttpOrigin(domain, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

    const uploadOrigin = makeLambdaOrigin(apiStack.uploadSampleUrlDomain);
    const profileOrigin = makeLambdaOrigin(apiStack.manageProfileUrlDomain);
    const synthesizeOrigin = makeLambdaOrigin(apiStack.synthesizeUrlDomain);
    const quoteOrigin = makeLambdaOrigin(apiStack.quoteGeneratorUrlDomain);
    const quizOrigin = makeLambdaOrigin(apiStack.quizUrlDomain);
    const leaderboardOrigin = makeLambdaOrigin(apiStack.leaderboardUrlDomain);

    // Shared behavior options for Lambda origins — no caching, forward all headers
    const lambdaBehaviorBase = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const lb = (origin: cloudfront.IOrigin): cloudfront.BehaviorOptions => ({
      ...lambdaBehaviorBase,
      origin,
    });

    // ── CloudFront Distribution ──────────────────────────────────────────────

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Colleague Voice Bot CDN',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      // Default: serve UI from S3
      defaultBehavior: {
        origin: uiS3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },

      additionalBehaviors: {
        // Audio files from S3 (pre-signed URLs — no caching)
        '/audio/*': {
          origin: audioS3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        },

        // Lambda Function URL routes
        '/api/admin/samples*':     lb(uploadOrigin),
        '/api/admin/profiles*':    lb(profileOrigin),
        '/api/admin/leaderboard*': lb(leaderboardOrigin),
        '/api/colleagues*':        lb(profileOrigin),
        '/api/synthesize*':        lb(synthesizeOrigin),
        '/api/quotes*':            lb(quoteOrigin),
        '/api/quiz*':              lb(quizOrigin),
        '/api/leaderboard*':       lb(leaderboardOrigin),
      },

      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
    });

    // ── Attach OAC to S3 origins via L1 escape hatch ─────────────────────────
    // Origin index 0 = UI S3 (default), index 1 = audio S3 (/audio/*)
    // Lambda origins start at index 2+

    const cfnDist = this.distribution.node.defaultChild as cloudfront.CfnDistribution;

    cfnDist.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', uiOac.attrId);
    cfnDist.addPropertyOverride('DistributionConfig.Origins.1.OriginAccessControlId', audioOac.attrId);

    // ── Bucket policies ──────────────────────────────────────────────────────

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
        Statement: [{
          Sid: 'AllowCloudFrontOACUi',
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${storageStack.uiBucket.bucketName}/*`,
          Condition: { StringEquals: { 'AWS:SourceArn': distributionArn } },
        }],
      },
    });

    new s3.CfnBucketPolicy(this, 'AudioBucketPolicy', {
      bucket: storageStack.audioBucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Sid: 'AllowCloudFrontOACAudio',
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${storageStack.audioBucket.bucketName}/*`,
          Condition: { StringEquals: { 'AWS:SourceArn': distributionArn } },
        }],
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

    // ── Deploy frontend to S3 ────────────────────────────────────────────────

    const frontendDistPath = path.join(__dirname, '../../frontend/dist');
    if (fs.existsSync(frontendDistPath)) {
      new s3deploy.BucketDeployment(this, 'DeployUi', {
        sources: [s3deploy.Source.asset(frontendDistPath)],
        destinationBucket: storageStack.uiBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
      });
    }
  }
}
