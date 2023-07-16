import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class AppsyncSubscriptionDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---> DynamoDB
    const notificationTable = new dynamodb.Table(this, "NotificationTable", {
      tableName: "NotificationTable",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "notificationId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "companyId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ---> AppSync
    // AppSyncの認証Lambda
    const appSyncAuthLambda = new lambdaNodejs.NodejsFunction(this, 'appSyncAuthLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambda/auth.ts',
      handler: 'handler',
    });
    const appsyncPrincipal = new iam.ServicePrincipal('appsync.amazonaws.com');
    appSyncAuthLambda.grantInvoke(appsyncPrincipal);

    // AppSync APIを作成し、デフォルト認証にLambda認証を指定
    const appsyncApi = new appsync.GraphqlApi(this, 'AppSyncSubscriptionDemoAppSyncApi', {
      name: 'appsync-subscription-demo',
      schema: appsync.SchemaFile.fromAsset('appsync/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.LAMBDA,
          lambdaAuthorizerConfig: {
            handler: appSyncAuthLambda,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          },
          {
            authorizationType: appsync.AuthorizationType.API_KEY,
          }
        ]
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
    });

    // AppSyncにDynamoDBのNotificationテーブルをデータソースとして紐づけ
    const dataSource = appsyncApi.addDynamoDbDataSource('NotificationTableDataSource', notificationTable);
    dataSource.createResolver(
      'createNotificationMutation',
      {
        typeName: 'Mutation',
        fieldName: 'createNotification',
        requestMappingTemplate: appsync.MappingTemplate.fromFile('appsync/mapping-templates/create-notification-request.vtl'),
        responseMappingTemplate: appsync.MappingTemplate.fromFile('appsync/mapping-templates/create-notification-response.vtl'),
      }
    );

    // AppSyncにIAM認証でMutationを実行するLambdaをNodejsFunctionで作成
    const createNotificationLambda = new lambdaNodejs.NodejsFunction(this, 'createNotificationLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: 'lambda/createNotification.ts',
      handler: 'handler',
      environment: {
        APPSYNC_URL: appsyncApi.graphqlUrl,
      },
    });
  }
}
