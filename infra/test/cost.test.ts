import { describe, expect, it } from 'vitest';
import { synth } from './stacks.ts';

const expensive = [
  'AWS::EC2::NatGateway',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancing::LoadBalancer',
  'AWS::RDS::DBProxy',
];

describe('cost guard', () => {
  const templates = Object.entries(synth());

  it.each(templates)('%s stack has no NAT gateway or load balancer', (_, template) => {
    for (const type of expensive) template.resourceCountIs(type, 0);
  });

  it.each(templates)('%s stack has no interface VPC endpoints', (_, template) => {
    const endpoints = template.findResources('AWS::EC2::VPCEndpoint');
    const interfaces = Object.values(endpoints).filter(
      (e) => e.Properties.VpcEndpointType === 'Interface',
    );
    expect(interfaces).toEqual([]);
  });

  it('runs the API on one t4g.micro and the database on db.t4g.micro, Single-AZ', () => {
    const { data, app } = synth();
    app.resourceCountIs('AWS::EC2::Instance', 1);
    app.hasResourceProperties('AWS::EC2::Instance', { InstanceType: 't4g.micro' });
    data.resourceCountIs('AWS::RDS::DBInstance', 1);
    data.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t4g.micro',
      MultiAZ: false,
    });
  });
});
