#!/usr/bin/env node

/**
 * block-local-publish.mjs
 *
 * Prevents `npm publish` from running outside of CI.
 * All publishes MUST go through the CI/CD pipeline.
 *
 * CI environments set one of: CI, GITHUB_ACTIONS, GITLAB_CI, CIRCLECI, JENKINS_URL
 */

const isCI =
  process.env.CI === 'true' ||
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.GITLAB_CI === 'true' ||
  process.env.CIRCLECI === 'true' ||
  !!process.env.JENKINS_URL;

if (!isCI) {
  console.error('\n');
  console.error('  \x1b[31m\x1b[1m✖ LOCAL PUBLISH BLOCKED\x1b[0m');
  console.error('');
  console.error('  npm publish is not allowed from local machines.');
  console.error('  All publishes go through CI/CD.');
  console.error('');
  console.error('  To release:');
  console.error('    1. Push your branch');
  console.error('    2. Create a PR → merge to main');
  console.error('    3. CI handles the publish automatically');
  console.error('\n');
  process.exit(1);
}
