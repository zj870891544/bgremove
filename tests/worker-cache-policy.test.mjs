import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("background workers revalidate instead of retaining a broken model runtime for four hours", () => {
  const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const rules = [];
  let current;
  for (const line of headers.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith("/")) {
      current = { path: line.trim(), cache: [] };
      rules.push(current);
    } else if (current) {
      const match = line.match(/^\s+Cache-Control:\s*(.+)$/i);
      if (match) current.cache.push(match[1]);
    }
  }

  assert.ok(rules.some((rule) => rule.path === "/workers/*"), "Worker files need an explicit cache override");
  const target = "/workers/bg-worker.js";
  const directives = rules
    .filter((rule) => new RegExp(`^${rule.path.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(target))
    .flatMap((rule) => rule.cache.flatMap((value) => value.toLowerCase().split(",").map((part) => part.trim())));

  assert.ok(directives.includes("no-cache"), "Revalidate even when a browser already has a worker script");
  assert.ok(directives.includes("max-age=0"));
  assert.ok(directives.includes("must-revalidate"));
  assert.equal(directives.includes("immutable"), false);
  for (const directive of directives.filter((value) => /^(s-maxage|max-age)=/.test(value))) {
    assert.match(directive, /^(s-maxage|max-age)=0$/, "No matching rule may make a worker fresh for hours");
  }
});
