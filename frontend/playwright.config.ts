/**
 * Playwright settings for the end-to-end smoke test (e2e/smoke.spec.ts).
 *
 * Run it against running servers (backend on :8000, frontend on :3000):
 *   npm run test:e2e
 *
 * Browsers get a fake camera and microphone, and permission to use them, so two
 * "people" can hold a real WebRTC call inside the test. Full Chromium (not the stripped
 * headless shell) is used because the headless shell crashes with fake media.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The meeting room is shared state on one server: run tests one after another.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chromium",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
});
