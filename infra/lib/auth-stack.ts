import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Cognito User Pool ────────────────────────────────────────────────────

    this.userPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: 'colleague-voice-bot-admins',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: false,
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── App Client ───────────────────────────────────────────────────────────

    this.userPoolClient = this.userPool.addClient('AdminAppClient', {
      userPoolClientName: 'colleague-voice-bot-admin-client',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // ── Admin Group ──────────────────────────────────────────────────────────

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
      description: 'Administrators with access to admin API endpoints',
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: 'ColleagueVoiceBot-UserPoolId',
    });

    new cdk.CfnOutput(this, 'AppClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: 'ColleagueVoiceBot-AppClientId',
    });
  }
}
