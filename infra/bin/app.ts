import { App } from 'aws-cdk-lib';
import { settingsFromContext } from '../src/settings.ts';
import { createStacks } from '../src/stacks.ts';

const app = new App();
createStacks(
  app,
  settingsFromContext((key) => app.node.tryGetContext(key), process.env.CDK_DEFAULT_ACCOUNT),
);
