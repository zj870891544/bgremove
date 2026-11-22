// Short-lived, authenticated uploader used by mirror-models-r2.mjs. Never deployed
// as part of the website. The caller removes this Worker when mirroring finishes.
const MODELS = new Set([
  "wonfy/BiRefNet_lite-ONNX-webgpu",
  "wonfy/BiRefNet-ONNX-webgpu",
  "studioludens/birefnet-lite-512",
  "Ko033/isnet-general-use-onnx",
]);
const FILES = new Set(["config.json", "preprocessor_config.json", "onnx/model_fp16.onnx"]);

function metadata(file) {
  return file.endsWith(".json")
    ? { contentType: "application/json", cacheControl: "public, max-age=86400" }
    : { contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" };
}

const mirrorWorker = {
  async fetch(request, env) {
    if (!env.UPLOAD_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.UPLOAD_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";
    const match = /^(.+)\/resolve\/main\/(config\.json|preprocessor_config\.json|onnx\/model_fp16\.onnx)$/.exec(key);
    if (!match || !MODELS.has(match[1]) || !FILES.has(match[2])) {
      return new Response("Invalid object key", { status: 400 });
    }
    try {
      if (url.pathname === "/copy" && request.method === "POST") {
        // Fixed upstream host and allowlisted paths prevent an arbitrary-URL proxy.
        // Stream cloud-to-cloud: neither the Mac nor the Worker buffers the model.
        const source = await fetch(`https://huggingface.co/${key}`, { redirect: "follow" });
        if (source.status === 404 && match[2] === "config.json") {
          return Response.json({ key, skipped: true });
        }
        if (!source.ok || !source.body) throw new Error(`Upstream returned HTTP ${source.status}`);
        const expected = Number(source.headers.get("content-length") || 0);
        const object = await env.MODELS.put(key, source.body, { httpMetadata: metadata(match[2]) });
        if (expected && expected !== object.size) throw new Error(`Object size mismatch: ${object.size}/${expected}`);
        return Response.json({ key, size: object.size, etag: object.etag });
      }
      if (url.pathname === "/start" && request.method === "POST") {
        const upload = await env.MODELS.createMultipartUpload(key, { httpMetadata: metadata(match[2]) });
        return Response.json({ key, uploadId: upload.uploadId });
      }
      const uploadId = url.searchParams.get("uploadId");
      if (!uploadId) return new Response("uploadId required", { status: 400 });
      const upload = env.MODELS.resumeMultipartUpload(key, uploadId);
      if (url.pathname === "/part" && request.method === "PUT") {
        const partNumber = Number(url.searchParams.get("partNumber"));
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
          return new Response("Invalid part number", { status: 400 });
        }
        return Response.json(await upload.uploadPart(partNumber, request.body));
      }
      if (url.pathname === "/complete" && request.method === "POST") {
        const { parts } = await request.json();
        if (!Array.isArray(parts) || !parts.length || parts.length > 10000) {
          return new Response("Invalid parts", { status: 400 });
        }
        const object = await upload.complete(parts);
        return Response.json({ key, size: object.size, etag: object.etag });
      }
      if (url.pathname === "/abort" && request.method === "POST") {
        await upload.abort();
        return Response.json({ aborted: true });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json({ error: String(error.message || error) }, { status: 500 });
    }
  },
};

export default mirrorWorker;
