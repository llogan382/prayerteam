import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './stacks.ts';

const { data } = synth();

describe('database', () => {
  it('is private, encrypted Postgres 18 with 7-day backups and deletion protection', () => {
    data.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^18'),
      PubliclyAccessible: false,
      StorageEncrypted: true,
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
      ManageMasterUserPassword: true,
      MasterUserPassword: Match.absent(),
    });
  });

  it('is retained if removed from the stack', () => {
    data.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  });

  it('lives in isolated subnets', () => {
    const subnetGroup = Object.values(data.findResources('AWS::RDS::DBSubnetGroup'))[0]!;
    const subnetIds = subnetGroup.Properties.SubnetIds as { Ref: string }[];
    const routes = data.findResources('AWS::EC2::Route', {
      Properties: { GatewayId: Match.anyValue() },
    });
    const publicTables = new Set(Object.values(routes).map((r) => r.Properties.RouteTableId.Ref));
    const associations = Object.values(data.findResources('AWS::EC2::SubnetRouteTableAssociation'));
    for (const { Ref } of subnetIds) {
      const association = associations.find((a) => a.Properties.SubnetId.Ref === Ref)!;
      expect(publicTables.has(association.Properties.RouteTableId.Ref)).toBe(false);
    }
  });

  it('accepts 5432 only from the API security group', () => {
    const [apiGroupId] = Object.keys(
      data.findResources('AWS::EC2::SecurityGroup', {
        Properties: { GroupDescription: Match.stringLikeRegexp('^API instance') },
      }),
    );
    const db = Object.values(data.findResources('AWS::RDS::DBInstance'))[0]!;
    const dbGroupId = db.Properties.VPCSecurityGroups[0]['Fn::GetAtt'][0];
    const dbGroup = data.findResources('AWS::EC2::SecurityGroup')[dbGroupId]!;
    expect(dbGroup.Properties.SecurityGroupIngress ?? []).toEqual([]);

    const ingress = Object.values(data.findResources('AWS::EC2::SecurityGroupIngress')).filter(
      (r) => r.Properties.GroupId['Fn::GetAtt'][0] === dbGroupId,
    );
    expect(ingress.map((r) => r.Properties)).toEqual([
      expect.objectContaining({
        FromPort: 5432,
        ToPort: 5432,
        SourceSecurityGroupId: { 'Fn::GetAtt': [apiGroupId, 'GroupId'] },
      }),
    ]);
  });
});
