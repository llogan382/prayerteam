import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";
import { REGION, type Settings } from "./settings.ts";

// CloudFront's origin-facing managed prefix list
// (com.amazonaws.global.cloudfront.origin-facing) in us-east-1.
export const CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST = "pl-3b927c52";

export const DB_NAME = "prayerteam";
const DB_USER = "prayerteam";

export interface DataStackProps extends StackProps {
  settings: Settings;
}

// The long-lived part: network, database, DNS zone, certificate and the SES
// identity. It changes rarely and holds the data, so it is termination
// protected and the database is retained.
export class DataStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly apiSecurityGroup: ec2.SecurityGroup;
  readonly database: rds.CfnDBInstance;
  readonly databaseSecretArn: string;
  readonly zone: route53.IHostedZone;
  readonly certificate: acm.Certificate;
  readonly emailIdentity: ses.EmailIdentity;

  // Named here instead of looked up from the account, so `cdk synth` needs
  // no AWS access (CI runs it with none) and never writes cdk.context.json.
  override get availabilityZones(): string[] {
    return [`${REGION}a`, `${REGION}b`];
  }

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, { ...props, terminationProtection: true });
    const { settings } = props;

    // Two AZs because an RDS subnet group needs them. No NAT gateways and no
    // interface endpoints: the instance reaches AWS, Expo and SES through the
    // internet gateway from its public subnet.
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: false,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.apiSecurityGroup = new ec2.SecurityGroup(this, "ApiSecurityGroup", {
      vpc: this.vpc,
      description: "API instance: 443 from CloudFront only, 80 for ACME and redirects",
      allowAllOutbound: true,
    });
    this.apiSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST),
      ec2.Port.tcp(443),
      "HTTPS from CloudFront origin-facing servers",
    );
    this.apiSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Caddy: Let's Encrypt HTTP-01 and redirect to HTTPS",
    );

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: this.vpc,
      description: "RDS Postgres: 5432 from the API instance only",
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(
      this.apiSecurityGroup,
      ec2.Port.tcp(5432),
      "Postgres from the API instance",
    );

    const subnetGroup = new rds.CfnDBSubnetGroup(this, "DatabaseSubnets", {
      dbSubnetGroupDescription: "Isolated subnets for RDS Postgres",
      subnetIds: this.vpc.isolatedSubnets.map((s) => s.subnetId),
    });

    // L1 because the L2 can't ask RDS to manage the master password: RDS
    // creates the Secrets Manager secret and rotates it, with no rotation
    // Lambda of ours and no password ever typed.
    this.database = new rds.CfnDBInstance(this, "Database", {
      engine: "postgres",
      engineVersion: "18",
      dbInstanceClass: "db.t4g.micro",
      multiAz: false,
      allocatedStorage: "20",
      storageType: "gp3",
      storageEncrypted: true,
      publiclyAccessible: false,
      dbName: DB_NAME,
      masterUsername: DB_USER,
      manageMasterUserPassword: true,
      dbSubnetGroupName: subnetGroup.ref,
      vpcSecurityGroups: [dbSecurityGroup.securityGroupId],
      backupRetentionPeriod: 7,
      preferredBackupWindow: "06:00-06:30",
      preferredMaintenanceWindow: "sun:07:00-sun:07:30",
      autoMinorVersionUpgrade: true,
      deletionProtection: true,
      copyTagsToSnapshot: true,
    });
    this.database.applyRemovalPolicy(RemovalPolicy.RETAIN);
    this.databaseSecretArn = this.database.attrMasterUserSecretSecretArn;

    this.zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: settings.hostedZoneId,
      zoneName: settings.hostedZoneName,
    });

    // For CloudFront, so it must be in us-east-1 (the whole app is).
    this.certificate = new acm.Certificate(this, "WebCertificate", {
      domainName: settings.domain,
      validation: acm.CertificateValidation.fromDns(this.zone),
    });

    // Easy DKIM records go into the zone. Sandbox exit, DMARC and MAIL FROM
    // are manual or later work.
    this.emailIdentity = new ses.EmailIdentity(this, "EmailIdentity", {
      identity: ses.Identity.publicHostedZone(this.zone),
    });
  }
}
