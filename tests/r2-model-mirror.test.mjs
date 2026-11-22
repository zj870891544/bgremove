import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import mirrorWorker from "../scripts/r2-model-mirror-worker.mjs";

const key = "wonfy/BiRefNet-ONNX-webgpu/resolve/main/onnx/model_fp16.onnx";
const auth = { Authorization: "Bearer test-upload-token" };
const request = (route, objectKey, options = {}) => {
  const url = new URL(route, "https://example.workers.dev");
  url.searchParams.set("key", objectKey);
  return new Request(url, { method: "POST", headers: auth, ...options });
};

test("the temporary uploader rejects unauthenticated and non-allowlisted requests before storage access", async () => {
  const env = { UPLOAD_TOKEN: "test-upload-token", MODELS: new Proxy({}, { get() { throw new Error("Storage must not be touched"); } }) };
  assert.equal((await mirrorWorker.fetch(request("/copy", key, { headers: {} }), env)).status, 401);
  assert.equal((await mirrorWorker.fetch(request("/copy", "private/models/resolve/main/config.json"), env)).status, 400);
  assert.equal((await mirrorWorker.fetch(request("/copy", "wonfy/BiRefNet-ONNX-webgpu/resolve/main/../../secret"), env)).status, 400);
  assert.equal((await mirrorWorker.fetch(request("/copy", key), { MODELS: env.MODELS })).status, 401);
});

test("cloud copying streams the exact allowlisted URL and retains immutable model metadata", async (t) => {
  const payload = new Uint8Array([8, 9, 10, 11]);
  const fetchMock = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `https://huggingface.co/${key}`);
    return new Response(payload, { headers: { "Content-Length": String(payload.length) } });
  });
  let writes = 0;
  const response = await mirrorWorker.fetch(request("/copy", key), {
    UPLOAD_TOKEN: "test-upload-token",
    MODELS: { async put(actualKey, body, options) {
      writes++;
      assert.equal(actualKey, key);
      assert.deepEqual(new Uint8Array(await new Response(body).arrayBuffer()), payload);
      assert.equal(options.httpMetadata.contentType, "application/octet-stream");
      assert.match(options.httpMetadata.cacheControl, /immutable/);
      return { size: payload.length, etag: "test-etag" };
    } },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).size, 4);
  assert.equal(writes, 1);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("only missing config.json is optional; required preprocessing files fail without storage writes", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  const env = { UPLOAD_TOKEN: "test-upload-token", MODELS: { put() { throw new Error("Missing sources must not be written"); } } };
  const config = "Ko033/isnet-general-use-onnx/resolve/main/config.json";
  const optional = await mirrorWorker.fetch(request("/copy", config), env);
  assert.equal(optional.status, 200);
  assert.equal((await optional.json()).skipped, true);
  const required = await mirrorWorker.fetch(request("/copy", config.replace("config.json", "preprocessor_config.json")), env);
  assert.equal(required.status, 500);
});

test("multipart cancellation resumes only the allowed key and aborts its upload", async () => {
  let aborted = false;
  const response = await mirrorWorker.fetch(request("/abort?uploadId=test-upload", key), {
    UPLOAD_TOKEN: "test-upload-token",
    MODELS: { resumeMultipartUpload(actualKey, uploadId) {
      assert.equal(actualKey, key);
      assert.equal(uploadId, "test-upload");
      return { async abort() { aborted = true; } };
    } },
  });
  assert.equal(response.status, 200);
  assert.equal(aborted, true);
});

test("the default four-model dry run creates no files and dispatches no cloud command", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "bgremove-mirror-dry-run-test-"));
  try {
    const result = spawnSync(process.execPath, [new URL("../scripts/mirror-models-r2.mjs", import.meta.url).pathname, "--bucket", "test-models", "--dry-run"], {
      cwd, encoding: "utf8", env: { ...process.env, PATH: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /12 objects planned across 4 models/);
    assert.match(result.stdout, /No resources changed/);
    assert.deepEqual(readdirSync(cwd), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
