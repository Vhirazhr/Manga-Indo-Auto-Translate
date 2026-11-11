import { test } from "node:test";
import assert from "node:assert/strict";
import { engineConfig, readFrames, translateLocal, checkEngine, ENGINE_URL, STREAM_PATH, MAX_FRAME } from "../local-engine.mjs";

// PNG IHDR structure suffices for the adapter's signature/placeholder checks.
const png = new Uint8Array(24);
png.set([137,80,78,71,13,10,26,10]);
new DataView(png.buffer).setUint32(16, 640);
new DataView(png.buffer).setUint32(20, 960);
function frame(code, data) {
  if (typeof data === "string") data = new TextEncoder().encode(data);
  const result = new Uint8Array(data.length + 5);
  result[0] = code;
  new DataView(result.buffer).setUint32(1, data.length);
  result.set(data, 5);
  return result;
}
function stream(chunks) {
  return new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close(); } });
}

test("all targets use offline M2M100 and LaMa; unsupported target fails", () => {
  for (const language of ["id","en","ja","ko","zh","es","fr","pt","de","ru","vi","th","tr","ar"]) {
    const config = engineConfig(language);
    assert.equal(config.translator.translator, "m2m100");
    assert.equal(config.inpainter.inpainter, "lama_large");
  }
  assert.equal(engineConfig().translator.target_lang, "IND");
  assert.throws(() => engineConfig("xx"));
});

test("handles every byte fragmented and multiple progress frames", async () => {
  const data = new Uint8Array([...frame(3, "1"), ...frame(1, "inpainting"), ...frame(0, png)]);
  const progress = [];
  const result = await readFrames(stream(Array.from(data, byte => Uint8Array.of(byte))), (...args) => progress.push(args));
  assert.equal(result, "data:image/png;base64," + Buffer.from(png).toString("base64"));
  assert.deepEqual(progress, [[3,"1"],[1,"inpainting"]]);
});

test("handles coalesced frames", async () => {
  const result = await readFrames(stream([new Uint8Array([...frame(4, ""), ...frame(0, png)])]));
  assert.match(result, /^data:image\/png;base64,/);
});

test("fails safely on engine error, truncated streams, bad code and oversized frames", async () => {
  await assert.rejects(readFrames(stream([frame(2,"out of memory")])), /out of memory/);
  await assert.rejects(readFrames(stream([frame(0,png).slice(0,7)])), /terputus/);
  await assert.rejects(readFrames(stream([frame(5,"")])), /Protokol/);
  const header = new Uint8Array(5); new DataView(header.buffer).setUint32(1, MAX_FRAME + 1);
  await assert.rejects(readFrames(stream([header])), /terlalu besar/);
  await assert.rejects(readFrames(stream([frame(0,"<html>error</html>")])), /PNG/);
  const placeholder = png.slice(); new DataView(placeholder.buffer).setUint32(16,1);
  await assert.rejects(readFrames(stream([frame(0,placeholder)])), /placeholder/);
});

test("posts image bytes and exact offline config only to loopback", async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, ENGINE_URL + STREAM_PATH);
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("image").type, "image/png");
    assert.equal(await options.body.get("image").text(), "abc");
    assert.deepEqual(JSON.parse(options.body.get("config")), engineConfig("id"));
    return new Response(stream([frame(0,png)]), { headers: { "content-type": "application/octet-stream" } });
  };
  await translateLocal({ mimeType:"image/png", data:btoa("abc") }, "id", () => {}, undefined, mockFetch);
});

test("HTTP failures and incompatible response types surface to user", async () => {
  const run = response => translateLocal({ mimeType:"image/png", data:"YQ==" }, "id", () => {}, undefined, async () => response);
  await assert.rejects(run(new Response("bad config", { status:422 })), /422.*bad config/);
  await assert.rejects(run(new Response("html", { headers: { "content-type":"text/html" } })), /Format streaming/);
});

test("health check verifies protocol, not just an open port", async () => {
  await checkEngine(async () => Response.json({ paths:{ [STREAM_PATH]:{ post:{} } } }));
  await assert.rejects(checkEngine(async () => Response.json({ paths:{} })), /bukan Manga/);
  await assert.rejects(checkEngine(async () => new Response("", { status:503 })), /503/);
});
