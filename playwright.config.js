// @ts-check
const { defineConfig } = require('@playwright/test');
const config = require('./config/env');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['json', { outputFile: 'reports/json/results.json' }],
  ],
  outputDir: 'reports/test-artifacts',

  use: {
    baseURL: config.baseURL,
    extraHTTPHeaders: { 'X-Test-Suite': 'policyhub-api-automation' },
  },

  // Start the PolicyHub mock API before the tests (skipped when testing a deployed environment).
  webServer: config.server.startLocalServer
    ? {
      command: 'node mock-server/server.js',
      url: `${config.baseURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    }
    : undefined,
});
