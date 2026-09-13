import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_configure_heis",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 5, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, factor: 2, randomize: true },
  },
  maxDuration: 3600,
});
