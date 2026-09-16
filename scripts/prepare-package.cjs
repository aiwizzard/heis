module.exports = async function preparePackage(context) {
 const { prepareCodex } = await import('./prepare-codex.mjs');
 const arch = ({0:'ia32',1:'x64',2:'armv7l',3:'arm64',4:'universal'})[context.arch];
 if (!arch || arch === 'universal') throw new Error('Build separate arm64 and x64 applications to bundle the matching Codex runtime.');
 await prepareCodex({platform:context.electronPlatformName,arch});
};
