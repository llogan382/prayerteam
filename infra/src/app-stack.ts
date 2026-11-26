import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { DB_NAME, type DataStack } from './data-stack.ts';
import { REGION, SSM_PREFIX, type Settings } from './settings.ts';
import { spaRewriteFunctionCode } from './spa-rewrite.ts';
import { instanceUserData } from './user-data.ts';

// The header CloudFront adds to /api/* and Caddy requires, so other
// CloudFront distributions (which share the prefix list) can't reach us.
export const ORIGIN_SECRET_HEADER = 'X-Origin-Secret';
const DEPLOY_ROLE_NAME = 'prayerteam-github-deploy';
const PATCH_GROUP = 'prayerteam-prod';
const READ_PARAMETERS = ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'];
const AL2023_ARM64_AMI = '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64';

export interface AppStackProps extends StackProps {
  settings: Settings;
  data: DataStack;
}

// The part that changes with the app: instance, image registry, web
// hosting, deploy access, logs and patching. Nothing here holds data that
// can't be rebuilt.
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { settings, data } = props;

    const repository = new ecr.Repository(this, 'ServerImages', {
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [{ description: 'Keep the last 10 images', maxImageCount: 10 }],
    });

    const privateBucketProps = { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true };
    const webBucket = new s3.Bucket(this, 'WebBucket', privateBucketProps);
    // compose file, Caddyfile and deploy.sh, uploaded on every deploy.
    const deployBucket = new s3.Bucket(this, 'DeployBucket', {
      ...privateBucketProps,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      versioned: true,
    });

    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `${SSM_PREFIX}/${name.toLowerCase()}`,
        retention: logs.RetentionDays.TWO_WEEKS,
      });
    const containerLogs = logGroup('Containers');
    const systemLogs = logGroup('System');

    // --- API instance -----------------------------------------------------
    const role = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'API instance: pull its image, read its config, send email, write logs',
    });
    repository.grantPull(role);
    const ownParameters = this.parameterPathArns(SSM_PREFIX);
    role.addToPolicy(new iam.PolicyStatement({ actions: READ_PARAMETERS, resources: ownParameters }));
    // AmazonSSMManagedInstanceCore (Session Manager, Run Command, Patch
    // Manager) also allows reading every parameter in the account. The
    // server may read only its own.
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: READ_PARAMETERS,
        notResources: ownParameters,
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [data.databaseSecretArn],
      }),
    );
    data.emailIdentity.grantSendEmail(role);
    for (const group of [containerLogs, systemLogs]) {
      group.grantWrite(role);
      group.grant(role, 'logs:DescribeLogStreams');
    }
    deployBucket.grantRead(role, 'deploy/*');

    const instance = new ec2.Instance(this, 'Api', {
      vpc: data.vpc,
      vpcSubnets: { subnets: [data.vpc.publicSubnets[0]!] },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      // Resolved by EC2 at launch, so a new AMI release never shows up as an
      // instance replacement in `cdk diff`. Patch Manager keeps it current.
      machineImage: ec2.MachineImage.resolveSsmParameterAtLaunch(AL2023_ARM64_AMI, {
        os: ec2.OperatingSystemType.LINUX,
      }),
      securityGroup: data.apiSecurityGroup,
      role,
      // IMDSv2 only. Hop limit 2 so containers on Docker's bridge network can
      // still get the instance role's credentials.
      httpTokens: ec2.HttpTokens.REQUIRED,
      httpPutResponseHopLimit: 2,
      ssmSessionPermissions: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(16, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      userData: ec2.UserData.custom(
        ['#!/bin/bash', ...instanceUserData({ systemLogGroup: systemLogs.logGroupName })].join('\n'),
      ),
    });
    instance.instance.addPropertyOverride('Tags', [
      { Key: 'Name', Value: 'prayerteam-api' },
      { Key: 'PatchGroup', Value: PATCH_GROUP },
    ]);

    const address = new ec2.CfnEIP(this, 'ApiAddress', { domain: 'vpc' });
    new ec2.CfnEIPAssociation(this, 'ApiAddressAssociation', {
      allocationId: address.attrAllocationId,
      instanceId: instance.instanceId,
    });

    // Auto-recovery: a failed system status check moves the instance to new
    // hardware, keeping its ID, Elastic IP and volume.
    new cloudwatch.Alarm(this, 'ApiRecovery', {
      alarmDescription: 'Recover the API instance when its system status check fails',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed_System',
        dimensionsMap: { InstanceId: instance.instanceId },
        statistic: 'Maximum',
        period: Duration.minutes(1),
      }),
      evaluationPeriods: 2,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(new cwActions.Ec2Action(cwActions.Ec2InstanceAction.RECOVER));

    new route53.ARecord(this, 'OriginRecord', {
      zone: data.zone,
      recordName: settings.originDomain,
      target: route53.RecordTarget.fromIpAddresses(address.ref),
      ttl: Duration.minutes(5),
    });

    // --- Patching -----------------------------------------------------------
    new ssm.CfnPatchBaseline(this, 'PatchBaseline', {
      name: 'prayerteam-al2023',
      operatingSystem: 'AMAZON_LINUX_2023',
      patchGroups: [PATCH_GROUP],
      approvalRules: {
        patchRules: [
          {
            approveAfterDays: 3,
            patchFilterGroup: {
              patchFilters: [
                { key: 'CLASSIFICATION', values: ['Security', 'Bugfix'] },
                { key: 'SEVERITY', values: ['Critical', 'Important', 'Medium', 'Low', 'None'] },
              ],
            },
          },
        ],
      },
    });
    const patchWindow = new ssm.CfnMaintenanceWindow(this, 'PatchWindow', {
      name: 'prayerteam-weekly-patch',
      // Sunday 09:00 UTC: night-time in the Americas, after the RDS window.
      schedule: 'cron(0 9 ? * SUN *)',
      scheduleTimezone: 'UTC',
      duration: 2,
      cutoff: 1,
      allowUnassociatedTargets: false,
    });
    const windowTarget = new ssm.CfnMaintenanceWindowTarget(this, 'PatchWindowTarget', {
      windowId: patchWindow.ref,
      resourceType: 'INSTANCE',
      targets: [{ key: 'InstanceIds', values: [instance.instanceId] }],
    });
    new ssm.CfnMaintenanceWindowTask(this, 'PatchTask', {
      windowId: patchWindow.ref,
      taskArn: 'AWS-RunPatchBaseline',
      taskType: 'RUN_COMMAND',
      priority: 1,
      maxConcurrency: '1',
      maxErrors: '1',
      targets: [{ key: 'WindowTargetIds', values: [windowTarget.ref] }],
      taskInvocationParameters: {
        maintenanceWindowRunCommandParameters: {
          parameters: { Operation: ['Install'], RebootOption: ['RebootIfNeeded'] },
        },
      },
    });

    // --- Web ----------------------------------------------------------------
    // A plain String, not SecureString: CloudFormation can only resolve
    // ssm-secure references in a few resource types, and CloudFront isn't one.
    // The value is readable in the distribution config either way.
    const originSecret = ssm.StringParameter.valueForStringParameter(
      this,
      `${SSM_PREFIX}/cloudfront-origin-secret`,
    );

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      comment: 'Rewrite extension-less app paths to /index.html (ADR 0001)',
      code: cloudfront.FunctionCode.fromInline(spaRewriteFunctionCode),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const distribution = new cloudfront.Distribution(this, 'Web', {
      comment: 'Prayer Team web app and /api',
      domainNames: [settings.domain],
      certificate: data.certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(settings.originDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
            customHeaders: { [ORIGIN_SECRET_HEADER]: originSecret },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    const alias = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'WebRecord', { zone: data.zone, recordName: settings.domain, target: alias });
    new route53.AaaaRecord(this, 'WebRecordIpv6', { zone: data.zone, recordName: settings.domain, target: alias });

    // --- Deploys --------------------------------------------------------------
    // The only command the deploy role may run on the instance: fetch the
    // deploy files and run deploy.sh for one image SHA.
    const deployDocument = new ssm.CfnDocument(this, 'DeployDocument', {
      documentType: 'Command',
      updateMethod: 'NewVersion',
      content: {
        schemaVersion: '2.2',
        description: 'Deploy one Prayer Team server image by commit SHA',
        parameters: {
          sha: { type: 'String', allowedPattern: '^[0-9a-f]{7,40}$' },
        },
        mainSteps: [
          {
            action: 'aws:runShellScript',
            name: 'deploy',
            inputs: {
              timeoutSeconds: '900',
              runCommand: [
                'set -eu',
                `aws s3 cp --recursive --only-show-errors s3://${deployBucket.bucketName}/deploy/ /opt/prayerteam/`,
                'chmod +x /opt/prayerteam/deploy.sh',
                [
                  `AWS_REGION=${REGION}`,
                  `IMAGE_REPOSITORY=${repository.repositoryUri}`,
                  `SSM_PREFIX=${SSM_PREFIX}`,
                  `DATABASE_HOST=${data.database.attrEndpointAddress}`,
                  `DATABASE_PORT=${data.database.attrEndpointPort}`,
                  `DATABASE_NAME=${DB_NAME}`,
                  `DATABASE_SECRET_ARN=${data.databaseSecretArn}`,
                  `ORIGIN_DOMAIN=${settings.originDomain}`,
                  `CONTAINER_LOG_GROUP=${containerLogs.logGroupName}`,
                  '/opt/prayerteam/deploy.sh {{ sha }}',
                ].join(' '),
              ],
            },
          },
        ],
      },
    });

    // GitHub Actions signs in through OIDC. Only `main` of this repository
    // can assume the role, so forks and branches can't deploy.
    const github = new iam.OidcProviderNative(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      description: 'GitHub Actions deploys from main',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${settings.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    repository.grantPullPush(deployRole);
    deployBucket.grantPut(deployRole, 'deploy/*');
    webBucket.grantReadWrite(deployRole);
    distribution.grantCreateInvalidation(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:SendCommand'],
        resources: [
          this.formatArn({ service: 'ec2', resource: 'instance', resourceName: instance.instanceId }),
          this.formatArn({ service: 'ssm', resource: 'document', resourceName: deployDocument.ref }),
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        // These two have no resource-level permissions.
        actions: ['ssm:GetCommandInvocation', 'ssm:ListCommandInvocations'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: READ_PARAMETERS,
        resources: this.parameterPathArns(`${SSM_PREFIX}/deploy`),
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        // `cdk deploy` works through the bootstrap roles.
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-role-${this.account}-${REGION}`],
      }),
    );

    // Names the deploy workflow needs, readable by the deploy role.
    const deployValues: Record<string, string> = {
      'image-repository': repository.repositoryUri,
      'deploy-bucket': deployBucket.bucketName,
      'web-bucket': webBucket.bucketName,
      'distribution-id': distribution.distributionId,
      'instance-id': instance.instanceId,
      'document-name': deployDocument.ref,
    };
    for (const [name, stringValue] of Object.entries(deployValues)) {
      new ssm.StringParameter(this, `Deploy-${name}`, {
        parameterName: `${SSM_PREFIX}/deploy/${name}`,
        stringValue,
      });
    }

    // Minimum supported app versions (#15, #31). The server re-reads them
    // every few minutes; change them in Parameter Store, not here.
    for (const platform of ['ios', 'android']) {
      new ssm.StringParameter(this, `MinVersion-${platform}`, {
        parameterName: `${SSM_PREFIX}/min-version/${platform}`,
        stringValue: '0.0.0',
      });
    }

    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'WebUrl', { value: `https://${settings.domain}` });
  }

  // A parameter path and everything under it.
  private parameterPathArns(path: string): string[] {
    const resourceName = path.slice(1);
    return [
      this.formatArn({ service: 'ssm', resource: 'parameter', resourceName }),
      this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: `${resourceName}/*` }),
    ];
  }
}
