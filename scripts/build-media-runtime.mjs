import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  chmod,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir, availableParallelism } from "node:os";

// Build on a matching macOS architecture. No Homebrew libraries are shipped.
if (process.platform !== "darwin")
  throw new Error("Build the macOS media runtime on macOS.");
const work =
  process.env.HEIS_MEDIA_BUILD_DIR || join(tmpdir(), "heis-media-runtime-src");
const destination = resolve("build/media-runtime", process.arch);
await mkdir(work, { recursive: true });
await mkdir(destination, { recursive: true });
async function run(command, args, cwd = work) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
}
async function archive(name, url, sha) {
  const file = join(work, name);
  try {
    await access(file);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${url}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex") !== sha
  )
    throw new Error(`Checksum mismatch: ${name}`);
  return file;
}
const ffmpeg = await archive(
  "ffmpeg-8.0.tar.xz",
  "https://ffmpeg.org/releases/ffmpeg-8.0.tar.xz",
  "b2751fccb6cc4c77708113cd78b561059b6fa904b24162fa0be2d60273d27b8e",
);
const whisper = await archive(
  "whisper.tar.gz",
  "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/a8d002cfd879315632a579e73f0148d06959de36",
  "7b17da903114ed45d82f48c030e3be6a5a8a279f884b2f733706dbb4e832fb6b",
);
await run("tar", ["-xf", ffmpeg]);
await run("tar", ["-xf", whisper]);
const ffdir = join(work, "ffmpeg-8.0"),
  whdir = join(work, "whisper.cpp-a8d002cfd879315632a579e73f0148d06959de36");
await run(
  "./configure",
  [
    "--disable-shared",
    "--enable-static",
    "--disable-autodetect",
    "--enable-zlib",
    "--enable-videotoolbox",
    "--enable-audiotoolbox",
    "--disable-network",
    "--disable-ffplay",
    "--disable-doc",
  ],
  ffdir,
);
await run("make", ["-j", String(Math.min(8, availableParallelism()))], ffdir);
await run("cmake", [
  "-S",
  whdir,
  "-B",
  join(whdir, "build"),
  "-DCMAKE_BUILD_TYPE=Release",
  "-DBUILD_SHARED_LIBS=OFF",
  "-DGGML_METAL_EMBED_LIBRARY=ON",
  "-DWHISPER_BUILD_TESTS=OFF",
]);
await run("cmake", [
  "--build",
  join(whdir, "build"),
  "--config",
  "Release",
  "--target",
  "whisper-cli",
  "-j",
  String(Math.min(8, availableParallelism())),
]);
for (const [source, name] of [
  [join(ffdir, "ffmpeg"), "ffmpeg"],
  [join(ffdir, "ffprobe"), "ffprobe"],
  [join(whdir, "build/bin/whisper-cli"), "whisper-cli"],
]) {
  await copyFile(source, join(destination, name));
  await chmod(join(destination, name), 0o755);
  await run("otool", ["-L", join(destination, name)]);
}
await copyFile(
  join(ffdir, "COPYING.LGPLv2.1"),
  join(destination, "FFmpeg-LICENSE.txt"),
);
await copyFile(
  join(whdir, "LICENSE"),
  join(destination, "Whisper-LICENSE.txt"),
);
await copyFile(ffmpeg, join(destination, "ffmpeg-8.0-source.tar.xz"));
await copyFile(whisper, join(destination, "whisper-source.tar.gz"));
await copyFile(
  new URL(import.meta.url),
  join(destination, "build-media-runtime.mjs"),
);
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(
    {
      platform: process.platform,
      arch: process.arch,
      ffmpeg: "8.0",
      whisper: "a8d002cfd879315632a579e73f0148d06959de36",
    },
    null,
    2,
  ),
);
console.log(`Media runtime ready: ${destination}`);
