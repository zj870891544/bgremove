#!/usr/bin/env node
/**
 * Mirror BGRemove's Hugging Face ONNX models into a Cloudflare R2 bucket so
 * Transformers.js can load them from a fast custom domain (`NEXT_PUBLIC_MODEL_HOST`).
 *
 * Zero external dependencies. A temporary authenticated Worker streams the fixed
 * public model files from Hugging Face directly to R2, including files above
 * Wrangler's 300 MiB upload limit. The helper is deleted when the run finishes.
 * --local retains local downloads and uses 64 MiB multipart uploads for large files.
 *
 * Usage:
 *   node scripts/mirror-models-r2.mjs --bucket bgremove-models --dry-run
 *   node scripts/mirror-models-r2.mjs --bucket bgremove-models
 *   node scripts/mirror-models-r2.mjs --bucket bgremove-models --models wonfy/BiRefNet_lite-ONNX-webgpu,studioludens/birefnet-lite-512
 *
 * Flags:
 *   --bucket <name>       Target Cloudflare R2 bucket name (or env R2_BUCKET).
 *   --models <list>       Comma-separated Hugging Face repo IDs (repeatable).
 *   --cache-dir <path>    Local download cache directory (default: .cache/r2-models).
 *   --hf-host <url>       Source Hugging Face host (default: https://huggingface.co).
 *   --dry-run             Print planned downloads and wrangler commands without running them.
 *   --force               Re-download local files even if cached.
 *   --local               Download through this machine instead of cloud-to-cloud copy.
 *   -h, --help            Show this help message.
 *
 * Environment:
 *   R2_BUCKET             Default value for --bucket.
 *   HF_TOKEN              Optional Hugging Face token for local downloads.
 *   CLOUDFLARE_ACCOUNT_ID  Optional account selection for temporary helper deployment.
 *
 * After mirroring, attach a public custom domain (e.g. https://models.bgremove.cc) with CORS
 * allowing GET/HEAD from your site origin, then set NEXT_PUBLIC_MODEL_HOST=https://models.bgremove.cc/.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

export const DEFAULT_MODELS = [
  "wonfy/BiRefNet_lite-ONNX-webgpu",
  "wonfy/BiRefNet-ONNX-webgpu",
  "studioludens/birefnet-lite-512",
  "Ko033/isnet-general-use-onnx",
];

export const MODEL_FILES = [
  { path: "config.json", optional: true, contentType: "application/json", cacheControl: "public, max-age=86400" },
  { path: "preprocessor_config.json", optional: false, contentType: "application/json", cacheControl: "public, max-age=86400" },
  { path: "onnx/model_fp16.onnx", optional: false, contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" },
];

const USAGE = `Mirror BGRemove ONNX models from Hugging Face into Cloudflare R2.

Usage:
  node scripts/mirror-models-r2.mjs --bucket <r2-bucket> [options]

Options:
  --bucket <name>       Target R2 bucket name (or set R2_BUCKET env var)
  --models <repos>      Comma-separated HF repos (default: all 4 shipped models)
  --cache-dir <dir>     Local cache directory (default: .cache/r2-models)
  --hf-host <url>       Source host (default: https://huggingface.co)
  --dry-run             Show planned downloads and wrangler put commands without executing
  --force               Re-download even if cached locally
  --local               Use local download + multipart upload instead of cloud copy
  -h, --help            Show help

Default models:
${DEFAULT_MODELS.map((m) => `  - ${m}`).join("\n")}

Files mirrored per repo:
${MODEL_FILES.map((f) => `  - ${f.path}${f.optional ? " (optional if repo omits it)" : ""}`).join("\n")}

Example:
  node scripts/mirror-models-r2.mjs --bucket bgremove-models --dry-run
  node scripts/mirror-models-r2.mjs --bucket bgremove-models
`;

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      bucket: { type: "string" },
      models: { type: "string", multiple: true },
      "cache-dir": { type: "string", default: ".cache/r2-models" },
      "hf-host": { type: "string", default: "https://huggingface.co" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      local: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  const modelList =
    values.models && values.models.length > 0
      ? values.models
          .flatMap((entry) => entry.split(","))
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_MODELS;

  const dryRun = Boolean(values["dry-run"]);
  const bucket = values.bucket || process.env.R2_BUCKET || (dryRun ? "bgremove-models" : "");

  return {
    help: Boolean(values.help),
    dryRun,
    force: Boolean(values.force),
    local: Boolean(values.local),
    bucket,
    models: modelList,
    cacheDir: path.resolve(values["cache-dir"] || ".cache/r2-models"),
    hfHost: (values["hf-host"] || "https://huggingface.co").replace(/\/+$/, ""),
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function downloadFile(url, destPath, { force, optional }) {
  if (!force && existsSync(destPath)) {
    const size = statSync(destPath).size;
    if (size > 0) {
      console.log(`  [cache] ${destPath} (${formatBytes(size)})`);
      return { status: "cached", size };
    }
  }

  mkdirSync(path.dirname(destPath), { recursive: true });
  const headers = {};
  if (process.env.HF_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }

  console.log(`  [fetch] ${url}`);
  const res = await fetch(url, { headers, redirect: "follow" });
  if (res.status === 404 && optional) {
    console.log(`  [skip]  404 Not Found (optional file): ${url}`);
    return { status: "missing", size: 0 };
  }
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status} ${res.statusText}`);
  }

  const partPath = `${destPath}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(partPath));
    renameSync(partPath, destPath);
  } catch (err) {
    rmSync(partPath, { force: true });
    throw err;
  }

  const size = statSync(destPath).size;
  console.log(`  [saved] ${destPath} (${formatBytes(size)})`);
  return { status: "downloaded", size };
}

function buildWranglerArgs(bucket, repo, fileSpec, localPath) {
  const objectKey = `${bucket}/${repo}/resolve/main/${fileSpec.path}`;
  return [
    "wrangler",
    "r2",
    "object",
    "put",
    objectKey,
    "--file",
    localPath,
    "--content-type",
    fileSpec.contentType,
    "--cache-control",
    fileSpec.cacheControl,
    "--remote",
  ];
}

function uploadToR2(bucket, repo, fileSpec, localPath) {
  const args = buildWranglerArgs(bucket, repo, fileSpec, localPath);
  console.log(`  [r2]    npx ${args.join(" ")}`);
  const result = spawnSync("npx", args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`wrangler exited with status ${result.status} for ${repo}/${fileSpec.path}`);
  }
}

const CLI_UPLOAD_LIMIT = 300 * 1024 * 1024;
const MULTIPART_PART_SIZE = 64 * 1024 * 1024;

function createUploadHelper(bucket) {
  const secret = randomBytes(32).toString("hex");
  const name = `bgremove-r2-mirror-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const directory = mkdtempSync(path.join(tmpdir(), "bgremove-r2-mirror-"));
  const configPath = path.join(directory, "wrangler.json");
  const config = {
    name,
    main: fileURLToPath(new URL("./r2-model-mirror-worker.mjs", import.meta.url)),
    compatibility_date: "2026-11-01",
    workers_dev: true,
    r2_buckets: [{ binding: "MODELS", bucket_name: bucket }],
    ...(process.env.CLOUDFLARE_ACCOUNT_ID ? { account_id: process.env.CLOUDFLARE_ACCOUNT_ID } : {}),
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  const redact = (value) => String(value || "").split(secret).join("[redacted]");
  const run = (args, input, { allowMissing = false } = {}) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = spawnSync("npx", ["--no-install", "wrangler", ...args, "--config", configPath], {
        encoding: "utf8",
        ...(input === undefined ? {} : { input }),
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120_000,
      });
      const output = redact((result.stdout || "") + (result.stderr || ""));
      if (!result.error && result.status === 0) return output;
      if (allowMissing && /code:\s*100(?:07|90)|HTTP\s*404|worker[^\n]*not found|worker[^\n]*does not exist/i.test(output)) return output;
      const details = output || result.error?.message || `exit ${result.status}`;
      if (attempt < 3 && (/fetch failed|timed? ?out|timeout|connectivity|ECONN|ETIMEDOUT|HTTP\s*5\d\d/i.test(details) || (args[0] !== "delete" && /code:\s*100(?:07|90)/.test(details)))) {
        console.log(`  [helper] transient network failure; retrying (${attempt}/3)`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1000);
        continue;
      }
      throw new Error(`Temporary helper command failed: ${details}`);
    }
  };
  let deployed = false;
  let endpoint;
  const uploads = new Map();
  const cleanup = () => {
    if (deployed) {
      run(["delete", "--name", name, "--force"], undefined, { allowMissing: true });
      deployed = false;
      console.log(`  [helper] removed ${name}`);
    }
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    console.log(`  [helper] deploying temporary bucket-scoped uploader ${name}`);
    // Mark before dispatch so a partially successful deployment is also cleaned up.
    deployed = true;
    const output = run(["deploy"]);
    const match = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i);
    if (!match) throw new Error("Could not find the temporary workers.dev endpoint");
    endpoint = match[0];
    // Secret travels over stdin, never as a command argument or public Worker var.
    run(["secret", "put", "UPLOAD_TOKEN"], `${secret}\n`);
  } catch (error) {
    try { cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `Helper setup/cleanup failed; remove ${name} before retrying`); }
    throw error;
  }
  async function call(route, key, { method = "POST", params = {}, body, headers = {} } = {}) {
    const url = new URL(route, endpoint);
    url.searchParams.set("key", key);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    for (let attempt = 1; attempt <= 6; attempt++) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${secret}`, ...headers },
        ...(body === undefined ? {} : { body, duplex: "half" }),
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
      const text = await response.text();
      let value;
      try { value = JSON.parse(text); } catch { value = { error: text.slice(0, 300) }; }
      // A newly created secret can take a moment to reach the workers.dev edge.
      // Retry only before an authorized operation ran (401), or idempotent copies.
      if (attempt < 6 && (response.status === 401 || (route === "/copy" && response.status >= 500))) {
        console.log(`  [helper] waiting for edge readiness (${attempt}/6)`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      if (!response.ok) throw new Error(`Upload helper HTTP ${response.status}: ${redact(value.error || "request failed")}`);
      return value;
    }
  }

  return {
    copy: (key) => call("/copy", key),
    async multipart(key, filename) {
      const size = statSync(filename).size;
      const { uploadId } = await call("/start", key);
      uploads.set(key, uploadId);
      const parts = [];
      try {
        for (let offset = 0, partNumber = 1; offset < size; offset += MULTIPART_PART_SIZE, partNumber++) {
          const end = Math.min(size, offset + MULTIPART_PART_SIZE) - 1;
          console.log(`  [multipart] ${partNumber}/${Math.ceil(size / MULTIPART_PART_SIZE)}`);
          parts.push(await call("/part", key, {
            method: "PUT", params: { uploadId, partNumber },
            body: createReadStream(filename, { start: offset, end }),
            headers: { "Content-Length": String(end - offset + 1) },
          }));
        }
        const result = await call("/complete", key, {
          params: { uploadId }, body: JSON.stringify({ parts }), headers: { "Content-Type": "application/json" },
        });
        uploads.delete(key);
        if (result.size !== size) throw new Error(`Multipart object size mismatch: ${result.size}/${size}`);
        return result;
      } catch (error) {
        await call("/abort", key, { params: { uploadId } });
        uploads.delete(key);
        throw error;
      }
    },
    async close() {
      const errors = [];
      for (const [key, uploadId] of uploads) {
        try { await call("/abort", key, { params: { uploadId } }); } catch (error) { errors.push(error); }
      }
      try { cleanup(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, `Temporary helper cleanup failed; inspect ${name}`);
    },
  };
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return; }
  if (!opts.bucket) throw new Error("--bucket <name> (or R2_BUCKET env var) is required");
  if (!opts.models.length) throw new Error("--models list is empty");
  const cloud = !opts.local && opts.hfHost === "https://huggingface.co" && opts.models.every((model) => DEFAULT_MODELS.includes(model));
  console.log(`[mirror-models-r2] bucket=${opts.bucket} models=${opts.models.length} mode=${cloud ? "cloud-copy" : "local"}${opts.dryRun ? " (DRY RUN)" : ""}`);
  if (opts.dryRun) {
    if (cloud) console.log("  [dry-run] deploy a temporary authenticated Worker bound only to the selected bucket; delete it after copying");
    let planned = 0;
    for (const repo of opts.models) {
      for (const file of MODEL_FILES) {
        const key = `${repo}/resolve/main/${file.path}`;
        if (cloud) console.log(`  [dry-run] stream https://huggingface.co/${key} -> r2://${opts.bucket}/${key}`);
        else console.log(`  [dry-run] download https://${new URL(opts.hfHost).host}/${key}; upload using Wrangler (<=300 MiB) or temporary-helper multipart (64 MiB parts)`);
        planned++;
      }
    }
    console.log(`[mirror-models-r2] Dry run complete: ${planned} objects planned across ${opts.models.length} models. No resources changed.`);
    return;
  }
  let helper;
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  try {
    if (cloud) helper = createUploadHelper(opts.bucket);
    for (const repo of opts.models) {
      console.log(`\n==> ${repo}`);
      for (const file of MODEL_FILES) {
        const key = `${repo}/resolve/main/${file.path}`;
        if (cloud) {
          console.log(`  [cloud-copy] ${key}`);
          const result = await helper.copy(key);
          if (result.skipped) { skipped++; continue; }
          console.log(`  [saved] ${formatBytes(result.size)} etag=${result.etag}`);
          bytes += result.size;
        } else {
          const localPath = path.join(opts.cacheDir, ...repo.split("/"), ...file.path.split("/"));
          const result = await downloadFile(`${opts.hfHost}/${key}`, localPath, { force: opts.force, optional: file.optional });
          if (result.status === "missing") { skipped++; continue; }
          if (result.size > CLI_UPLOAD_LIMIT) {
            if (!DEFAULT_MODELS.includes(repo)) throw new Error("Large custom-model uploads require an S3 multipart client; the temporary helper only accepts the four shipped model repositories");
            helper ||= createUploadHelper(opts.bucket);
            await helper.multipart(key, localPath);
          } else uploadToR2(opts.bucket, repo, file, localPath);
          bytes += result.size;
        }
        uploaded++;
      }
    }
  } finally {
    if (helper) await helper.close();
  }
  console.log(`\n[mirror-models-r2] Done: ${uploaded} uploaded, ${skipped} optional files skipped, ${formatBytes(bytes)} total.`);
}

main().catch((err) => {
  const details = err instanceof AggregateError ? [err.message, ...err.errors.map((error) => error instanceof Error ? error.message : String(error))].join("\n") : err instanceof Error ? err.message : String(err);
  console.error(`[mirror-models-r2] Failed: ${details}`);
  process.exitCode = 1;
});
