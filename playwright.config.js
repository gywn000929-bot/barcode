const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8765",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "node tests/server.cjs",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: false,
  },
  workers: 1,
});
