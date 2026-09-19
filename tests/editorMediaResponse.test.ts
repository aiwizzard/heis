import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectMediaResponse } from "../electron/editor/mediaResponse";

test("project media streams byte ranges, suffixes and HEAD with accurate boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heis-range-")),
    file = path.join(root, "video.mp4");
  fs.writeFileSync(file, Buffer.from("0123456789"));
  try {
    for (const [range, status, text, contentRange] of [
      [undefined, 200, "0123456789", null],
      ["bytes=2-5", 206, "2345", "bytes 2-5/10"],
      ["bytes=7-", 206, "789", "bytes 7-9/10"],
      ["bytes=-3", 206, "789", "bytes 7-9/10"],
      ["bytes=8-50", 206, "89", "bytes 8-9/10"],
    ] as const) {
      const r = await projectMediaResponse(
        file,
        new Request("https://local/video", {
          headers: range ? { Range: range } : {},
        }),
      );
      assert.equal(r.status, status);
      assert.equal(r.headers.get("Content-Range"), contentRange);
      assert.equal(r.headers.get("Content-Length"), String(text.length));
      assert.equal(await r.text(), text);
    }
    for (const range of [
      "bytes=10-",
      "bytes=6-2",
      "bytes=-0",
      "bytes=",
      "bytes=0-1,3-4",
    ]) {
      const r = await projectMediaResponse(
        file,
        new Request("https://local/video", { headers: { Range: range } }),
      );
      assert.equal(r.status, 416);
      assert.equal(r.headers.get("Content-Range"), "bytes */10");
    }
    const head = await projectMediaResponse(
      file,
      new Request("https://local/video", { method: "HEAD" }),
    );
    assert.equal(head.headers.get("Content-Length"), "10");
    assert.equal(await head.text(), "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
