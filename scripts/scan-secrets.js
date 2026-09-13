const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const GENERATED_ROOTS = [".next/standalone", ".next/static", "dist-electron", "apps/web/.next/server", "apps/web/.next/static"];
const TEXT_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".map", ".html", ".css", ".md", ".toml", ".yaml", ".yml", ".env", ".txt"]);
const PATTERNS = [
  { name: "OpenAI secret key", pattern: /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/g },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { name: "AWS-style access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "Private key", pattern: /-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----\s+[A-Za-z0-9+/=\r\n]{100,}\s+-----END \1-----/g },
];

function trackedFiles() {
  return childProcess.execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
}

function generatedFiles(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else files.push(path.relative(ROOT, absolute));
    }
  }
  return files;
}

function scan(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && !path.basename(relativePath).startsWith(".env")) return [];
  const absolute = path.join(ROOT, relativePath);
  let stat;
  try { stat = fs.statSync(absolute); } catch { return []; }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return [];
  const text = fs.readFileSync(absolute, "utf8");
  const findings = [];
  for (const candidate of PATTERNS) {
    candidate.pattern.lastIndex = 0;
    for (const match of text.matchAll(candidate.pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ file: relativePath, line, kind: candidate.name });
    }
  }
  return findings;
}

const files = new Set(trackedFiles());
for (const root of GENERATED_ROOTS) for (const file of generatedFiles(root)) files.add(file);
const findings = [...files].flatMap(scan);
if (findings.length) {
  console.error("Potential secrets found:");
  for (const finding of findings) console.error(`${finding.file}:${finding.line} ${finding.kind}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.size} source and packaged files checked).`);
}
