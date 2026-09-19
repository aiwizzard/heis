import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { decodeLayeredImage, fetchLayeredImage } from "../apps/web/lib/layeredImage";
import { validateGenerationRequest } from "../packages/core/src/generationValidation";

const request = () => ({ operation: "decompose-layers" as const, modelId: "heis-image-layers", billing: { mode: "managed" as const, accountId: "test", idempotencyKey: "test" }, inputs: { positivePrompt: "Separate the image", inputs: { referenceImages: ["https://example.com/image.png"] }, settings: { layers: 4 }, outputFormat: "TIFF" } });
test("layer requests require bounded layer count, one source and TIFF", () => {
  assert.equal(validateGenerationRequest(request()).providerModelId, "alibaba:qwen-image@layered");
  for (const layers of [0, 1, 11, 2.5, NaN]) assert.throws(() => validateGenerationRequest({ ...request(), inputs: { ...request().inputs, settings: { layers } } }));
  assert.throws(() => validateGenerationRequest({ ...request(), inputs: { ...request().inputs, numberResults: 20 } }));
  assert.throws(() => validateGenerationRequest({ ...request(), inputs: { ...request().inputs, outputFormat: "PNG" } }));
  assert.throws(() => validateGenerationRequest({ ...request(), inputs: { ...request().inputs, inputs: { referenceImages: [] } } }));
});
test("TIFF extraction preserves page order, canvas size and alpha", async () => {
  const raw = Buffer.from([255,0,0,128, 255,0,0,0, 0,255,0,255, 0,255,0,64]);
  const tiff = await sharp(raw, { raw: { width: 2, height: 2, channels: 4, pageHeight: 1 } }).tiff({ compression: "deflate" }).toBuffer();
  const outputs = await decodeLayeredImage(tiff);
  assert.equal(outputs.length, 2);
  for (let i = 0; i < outputs.length; i++) {
    const { data, info } = await sharp(outputs[i]).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 2); assert.equal(info.height, 1); assert.equal(info.channels, 4);
    assert.deepEqual(data, raw.subarray(i * 8, (i + 1) * 8));
  }
});
test("flattened, opaque and corrupt results cannot masquerade as layers", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  await assert.rejects(decodeLayeredImage(png), /TIFF/);
  const tiff = await sharp(png).tiff({ compression: "deflate" }).toBuffer();
  await assert.rejects(decodeLayeredImage(tiff), /TIFF/);
  await assert.rejects(decodeLayeredImage(Buffer.from("bad")));
  const opaque = await sharp(Buffer.alloc(12), { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } }).tiff({ compression: "deflate" }).toBuffer();
  await assert.rejects(decodeLayeredImage(opaque), /alpha/);
  await assert.rejects(fetchLayeredImage("http://localhost/private"), /Untrusted/);
  await assert.rejects(fetchLayeredImage("https://runware.ai.evil.example/private"), /Untrusted/);
});
