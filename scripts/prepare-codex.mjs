import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
export async function prepareCodex(options = {}) {
  const triples = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-arm64": "aarch64-unknown-linux-musl",
    "linux-x64": "x86_64-unknown-linux-musl",
    "win32-arm64": "aarch64-pc-windows-msvc",
    "win32-x64": "x86_64-pc-windows-msvc",
  };
  const platform = `${options.platform ?? process.platform}-${options.arch ?? process.arch}`;
  const packagePath = require.resolve(`@openai/codex-${platform}/package.json`);
  const target = path.join(
    path.dirname(packagePath),
    "vendor",
    triples[platform],
  );
  const version = JSON.parse(await readFile(packagePath, "utf8")).version;
  // The complete target includes Codex's helper binaries and runtime resources.
  await rm("dist-codex", { recursive: true, force: true });
  await mkdir("dist-codex", { recursive: true });
  await cp(target, "dist-codex", { recursive: true, force: true });
  console.log(`Prepared Codex ${version} for ${platform}`);
}
