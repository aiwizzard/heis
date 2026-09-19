module.exports = async function preparePackage(context) {
 const { prepareCodex } = await import('./prepare-codex.mjs');
 const arch = ({0:'ia32',1:'x64',2:'armv7l',3:'arm64',4:'universal'})[context.arch];
 if (!arch || arch === 'universal') throw new Error('Build separate arm64 and x64 applications to bundle the matching Codex runtime.');
 const fs = require("node:fs"); const path = require("node:path");
 const runtime = path.resolve("build/media-runtime", arch);
 for (const binary of ["ffmpeg", "ffprobe", "whisper-cli", "manifest.json"]) if (!fs.existsSync(path.join(runtime,binary))) throw new Error(`Missing ${binary}. Run npm run build:media-runtime on a ${arch} Mac before packaging.`);
 const manifest = JSON.parse(fs.readFileSync(path.join(runtime,"manifest.json"),"utf8"));
 if (manifest.arch !== arch || manifest.platform !== context.electronPlatformName) throw new Error("Media runtime architecture mismatch");
 await prepareCodex({platform:context.electronPlatformName,arch});
};
