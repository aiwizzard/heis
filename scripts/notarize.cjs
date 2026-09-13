const path = require("node:path");
const { notarize } = require("@electron/notarize");

module.exports = async function notarizeHeis(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.HEIS_SKIP_NOTARIZE === "1") return;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    throw new Error("Apple notarization credentials are required. Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID, or set HEIS_SKIP_NOTARIZE=1 for a local-only build.");
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await notarize({ appPath, appleId, appleIdPassword, teamId });
};
