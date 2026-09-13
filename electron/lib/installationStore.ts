const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

class InstallationStore {
  private readonly filePath: string;

  constructor(filePath = path.join(app.getPath("userData"), "installation-id")) {
    this.filePath = filePath;
  }

  get(): string {
    try {
      const existing = fs.readFileSync(this.filePath, "utf8").trim();
      if (/^[0-9a-f-]{36}$/i.test(existing)) return existing;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
    const installationId = crypto.randomUUID();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, installationId, { mode: 0o600, flag: "wx" });
    return installationId;
  }
}

module.exports = { InstallationStore };
