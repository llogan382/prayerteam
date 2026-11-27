import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cr from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";
import { DB_NAME, type DataStack } from "./data-stack.ts";
import {
  MIN_VERSION_PARAMETERS,
  ORIGIN_SECRET_PARAMETER,
  REGION,
  SECURE_PARAMETERS,
  SSM_PREFIX,
  parameterName,
  type Settings,
} from "./settings.ts";
import { spaRewriteFunctionCode } from "./spa-rewrite.ts";
import { instanceUserData } from "./user-data.ts";

// The header CloudFront adds to /api/* and Caddy requires, so other
// CloudFront distributions (which share the prefix list) can't reach us.
// deploy/caddy/Caddyfile checks it by name; a test keeps the two in step.
export const ORIGIN_SECRET_HEADER = "X-Origin-Secret";
// Where the deploy document writes the server's environment on the instance.
const SERVER_ENV_FILE = "/opt/prayerteam/server.env";
const DEPLOY_ROLE_NAME = "prayerteam-github-deploy";
const PATCH_GROUP = "prayerteam-prod";
const READ_PARAMETERS = ["ssm:GetParameter", "ssm:GetParameters"];
const AL2023_ARM64_AMI = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64";

export interface AppStackProps extends StackProps {
  settings: Settings;
  data: DataStack;
}

// The part that changes with the app: instance, image registry, web
// hosting, deploy access, logs and patching. Nothing here holds data that
// can't be rebuilt.
export class AppStack extends Stack {
  private readonly settings: Settings;
  private readonly data: DataStack;
  private readonly repository: ecr.Repository;
  private readonly webBucket: s3.Bucket;
  // compose file, Caddyfile and deploy.sh, uploaded on every deploy.
  private readonly deployBucket: s3.Bucket;
  private readonly containerLogs: logs.LogGroup;
  private readonly systemLogs: logs.LogGroup;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    this.settings = props.settings;
    this.data = props.data;

    this.repository = new ecr.Repository(this, "ServerImages", {
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ description: "Keep the last 10 images", maxImageCount: 10 }],
    });
    const privateBucket = { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true };
    this.webBucket = new s3.Bucket(this, "WebBucket", privateBucket);
    this.deployBucket = new s3.Bucket(this, "DeployBucket", privateBucket);
    this.containerLogs = this.logGroup("Containers");
    this.systemLogs = this.logGroup("System");

    const instance = this.apiInstance();
    this.patching(instance);
    const distribution = this.web();
    const deployDocument = this.deployDocument();
    const deployRole = this.deployRole(instance, distribution, deployDocument);

    // What the deploy workflow needs. It reads them from the stack's outputs
    // through the CDK bootstrap lookup role, so the deploy role itself needs
    // no read access.
    const outputs: Record<string, string> = {
      DeployRoleArn: deployRole.roleArn,
      ImageRepositoryUri: this.repository.repositoryUri,
      DeployBucketName: this.deployBucket.bucketName,
      WebBucketName: this.webBucket.bucketName,
      DistributionId: distribution.distributionId,
      InstanceId: instance.instanceId,
      DeployDocumentName: deployDocument.ref,
      WebUrl: `https://${this.settings.domain}`,
    };
    for (const [name, value] of Object.entries(outputs)) new CfnOutput(this, name, { value });
  }

  private logGroup(name: string): logs.LogGroup {
    return new logs.LogGroup(this, `${name}Logs`, {
      logGroupName: `${SSM_PREFIX}/${name.toLowerCase()}`,
      retention: logs.RetentionDays.TWO_WEEKS,
    });
  }

  // One t4g.micro behind an Elastic IP, reachable only through CloudFront
  // and Session Manager.
  private apiInstance(): ec2.Instance {
    const { data, settings } = this;
    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "API instance: pull its image, read its config, send email, write logs",
    });
    this.repository.grantPull(role);
    const ownParameters = [...SECURE_PARAMETERS, ...MIN_VERSION_PARAMETERS].map((name) =>
      this.parameterArn(parameterName(name)),
    );
    role.addToPolicy(new iam.PolicyStatement({ actions: READ_PARAMETERS, resources: ownParameters }));
    // AmazonSSMManagedInstanceCore (Session Manager, Run Command, Patch
    // Manager) also allows reading every parameter in the account. The
    // server may read only its own.
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [...READ_PARAMETERS, "ssm:GetParametersByPath"],
        notResources: ownParameters,
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        resources: [data.databaseSecretArn],
      }),
    );
    data.emailIdentity.grantSendEmail(role);
    for (const group of [this.containerLogs, this.systemLogs]) {
      group.grantWrite(role);
      group.grant(role, "logs:DescribeLogStreams");
    }
    this.deployBucket.grantRead(role, "deploy/*");

    const instance = new ec2.Instance(this, "Api", {
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
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(16, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      userData: ec2.UserData.custom(
        [
          "#!/bin/bash",
          ...instanceUserData({
            systemLogGroup: this.systemLogs.logGroupName,
            containerLogGroup: this.containerLogs.logGroupName,
          }),
        ].join("\n"),
      ),
    });
    instance.instance.addPropertyOverride("Tags", [
      { Key: "Name", Value: "prayerteam-api" },
      { Key: "PatchGroup", Value: PATCH_GROUP },
    ]);

    const address = new ec2.CfnEIP(this, "ApiAddress", { domain: "vpc" });
    new ec2.CfnEIPAssociation(this, "ApiAddressAssociation", {
      allocationId: address.attrAllocationId,
      instanceId: instance.instanceId,
    });

    // Auto-recovery: a failed system status check moves the instance to new
    // hardware, keeping its ID, Elastic IP and volume.
    new cloudwatch.Alarm(this, "ApiRecovery", {
      alarmDescription: "Recover the API instance when its system status check fails",
      metric: new cloudwatch.Metric({
        namespace: "AWS/EC2",
        metricName: "StatusCheckFailed_System",
        dimensionsMap: { InstanceId: instance.instanceId },
        statistic: "Maximum",
        period: Duration.minutes(1),
      }),
      evaluationPeriods: 2,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(new cwActions.Ec2Action(cwActions.Ec2InstanceAction.RECOVER));

    new route53.ARecord(this, "OriginRecord", {
      zone: data.zone,
      recordName: settings.originDomain,
      target: route53.RecordTarget.fromIpAddresses(address.ref),
      ttl: Duration.minutes(5),
    });
    return instance;
  }

  // Weekly OS patching, rebooting if a patch needs it.
  private patching(instance: ec2.Instance): void {
    new ssm.CfnPatchBaseline(this, "PatchBaseline", {
      name: "prayerteam-al2023",
      operatingSystem: "AMAZON_LINUX_2023",
      patchGroups: [PATCH_GROUP],
      approvalRules: {
        patchRules: [
          {
            approveAfterDays: 3,
            patchFilterGroup: {
              patchFilters: [
                { key: "CLASSIFICATION", values: ["Security", "Bugfix"] },
                { key: "SEVERITY", values: ["Critical", "Important", "Medium", "Low", "None"] },
              ],
            },
          },
        ],
      },
    });
    const patchWindow = new ssm.CfnMaintenanceWindow(this, "PatchWindow", {
      name: "prayerteam-weekly-patch",
      // Sunday 09:00 UTC: night-time in the Americas, after the RDS window.
      schedule: "cron(0 9 ? * SUN *)",
      scheduleTimezone: "UTC",
      duration: 2,
      cutoff: 1,
      allowUnassociatedTargets: false,
    });
    const windowTarget = new ssm.CfnMaintenanceWindowTarget(this, "PatchWindowTarget", {
      windowId: patchWindow.ref,
      resourceType: "INSTANCE",
      targets: [{ key: "InstanceIds", values: [instance.instanceId] }],
    });
    new ssm.CfnMaintenanceWindowTask(this, "PatchTask", {
      windowId: patchWindow.ref,
      taskArn: "AWS-RunPatchBaseline",
      taskType: "RUN_COMMAND",
      priority: 1,
      maxConcurrency: "1",
      maxErrors: "1",
      targets: [{ key: "WindowTargetIds", values: [windowTarget.ref] }],
      taskInvocationParameters: {
        maintenanceWindowRunCommandParameters: {
          parameters: { Operation: ["Install"], RebootOption: ["RebootIfNeeded"] },
        },
      },
    });
  }

  // One distribution: the web build from S3, and /api/* to the instance.
  private web(): cloudfront.Distribution {
    const { data, settings } = this;
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      comment: "Rewrite extension-less app paths to /index.html (ADR 0001)",
      code: cloudfront.FunctionCode.fromInline(spaRewriteFunctionCode),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const distribution = new cloudfront.Distribution(this, "Web", {
      comment: "Prayer Team web app and /api",
      domainNames: [settings.domain],
      certificate: data.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(settings.originDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
            customHeaders: { [ORIGIN_SECRET_HEADER]: this.originSecret() },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new route53.ARecord(this, "WebRecord", {
      zone: data.zone,
      recordName: settings.domain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });
    return distribution;
  }

  // The origin secret is a SecureString. CloudFormation can't resolve
  // ssm-secure references in CloudFront properties, so a custom resource
  // reads the pinned version at deploy time. The value still ends up in the
  // distribution's config, which only account admins can read.
  private originSecret(): string {
    const versioned = `${ORIGIN_SECRET_PARAMETER}:${this.settings.originSecretVersion}`;
    const reader = new cr.AwsCustomResource(this, "OriginSecret", {
      onUpdate: {
        service: "SSM",
        action: "getParameter",
        parameters: { Name: versioned, WithDecryption: true },
        physicalResourceId: cr.PhysicalResourceId.of(versioned),
        outputPaths: ["Parameter.Value"],
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.parameterArn(ORIGIN_SECRET_PARAMETER)],
      }),
      installLatestAwsSdk: false,
      logGroup: new logs.LogGroup(this, "OriginSecretLogs", { retention: logs.RetentionDays.TWO_WEEKS }),
    });
    return reader.getResponseField("Parameter.Value");
  }

  // The only command the deploy role may run on the instance: write the
  // server's environment, fetch the deploy files and run deploy.sh for one
  // image SHA.
  private deployDocument(): ssm.CfnDocument {
    const { data } = this;
    // Everything the server image reads from its environment (the contract
    // in deploy/README.md). Secrets and minimum versions come from SSM.
    const serverEnvironment: Record<string, string> = {
      NODE_ENV: "production",
      AWS_REGION: REGION,
      SSM_PREFIX,
      DATABASE_HOST: data.database.attrEndpointAddress,
      DATABASE_PORT: data.database.attrEndpointPort,
      DATABASE_NAME: DB_NAME,
      DATABASE_SECRET_ARN: data.databaseSecretArn,
    };
    const deployEnvironment: Record<string, string> = {
      AWS_REGION: REGION,
      IMAGE_REPOSITORY: this.repository.repositoryUri,
      ORIGIN_SECRET_PARAMETER,
      ORIGIN_DOMAIN: this.settings.originDomain,
      SERVER_ENV_FILE,
    };
    const assignments = (env: Record<string, string>) =>
      Object.entries(env).map(([key, value]) => `${key}=${value}`);

    return new ssm.CfnDocument(this, "DeployDocument", {
      documentType: "Command",
      updateMethod: "NewVersion",
      content: {
        schemaVersion: "2.2",
        description: "Deploy one Prayer Team server image by commit SHA",
        parameters: {
          sha: { type: "String", allowedPattern: "^[0-9a-f]{7,40}$" },
        },
        mainSteps: [
          {
            action: "aws:runShellScript",
            name: "deploy",
            inputs: {
              timeoutSeconds: "900",
              runCommand: [
                "set -eu",
                `aws s3 cp --recursive --only-show-errors s3://${this.deployBucket.bucketName}/deploy/ /opt/prayerteam/`,
                "chmod +x /opt/prayerteam/deploy.sh",
                `cat > ${SERVER_ENV_FILE} <<'EOF'`,
                ...assignments(serverEnvironment),
                "EOF",
                [...assignments(deployEnvironment), "/opt/prayerteam/deploy.sh {{ sha }}"].join(" "),
              ],
            },
          },
        ],
      },
    });
  }

  // GitHub Actions signs in through OIDC. Only `main` of this repository
  // can assume the role, so forks and branches can't deploy.
  private deployRole(
    instance: ec2.Instance,
    distribution: cloudfront.Distribution,
    deployDocument: ssm.CfnDocument,
  ): iam.Role {
    const github = new iam.OidcProviderNative(this, "GitHubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });
    const role = new iam.Role(this, "DeployRole", {
      roleName: DEPLOY_ROLE_NAME,
      description: "GitHub Actions deploys from main",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${this.settings.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    this.repository.grantPullPush(role);
    this.deployBucket.grantPut(role, "deploy/*");
    this.webBucket.grantReadWrite(role);
    distribution.grantCreateInvalidation(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:SendCommand"],
        resources: [
          this.formatArn({ service: "ec2", resource: "instance", resourceName: instance.instanceId }),
          this.formatArn({ service: "ssm", resource: "document", resourceName: deployDocument.ref }),
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        // Waiting for the deploy command and showing its output. It has no
        // resource-level permissions.
        actions: ["ssm:GetCommandInvocation"],
        resources: ["*"],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        // `cdk deploy` works through the bootstrap roles.
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-role-${this.account}-${REGION}`],
      }),
    );
    return role;
  }

  private parameterArn(name: string): string {
    return this.formatArn({ service: "ssm", resource: "parameter", resourceName: name.slice(1) });
  }
}
