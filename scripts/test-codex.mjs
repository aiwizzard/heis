import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: [
    "electron/agent/service.ts",
    "electron/agent/rpc.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "test-results/unit",
  outExtension: { ".js": ".mjs" },
});
const result = spawnSync(
  process.execPath,
  ["--test", "scripts/codex.test.mjs"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
