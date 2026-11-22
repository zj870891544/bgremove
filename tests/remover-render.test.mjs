import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the production render and color-cleanup functions together. Only the
// browser's small Canvas subset is replaced, with copy/destination-in alpha math.
class PixelCanvas {
  constructor() {
    this._width = 0;
    this._height = 0;
    this.pixels = new Uint8ClampedArray();
    const state = [];
    this.ctx = {
      globalCompositeOperation: "source-over",
      createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (image, x, y) => {
        assert.equal(x, 0);
        assert.equal(y, 0);
        assert.equal(image.data.length, this.pixels.length);
        this.pixels.set(image.data);
      },
      getImageData: (x, y, width, height) => {
        assert.equal(x, 0);
        assert.equal(y, 0);
        assert.equal(width, this.width);
        assert.equal(height, this.height);
        return { width, height, data: new Uint8ClampedArray(this.pixels) };
      },
      save: () => state.push(this.ctx.globalCompositeOperation),
      restore: () => { this.ctx.globalCompositeOperation = state.pop(); },
      beginPath() {},
      rect: (x, y, width, height) => {
        assert.deepEqual([x, y, width, height], [0, 0, this.width, this.height]);
      },
      clip() {},
      drawImage: (source, x, y) => {
        assert.deepEqual([x, y], [0, 0]);
        assert.equal(source.width, this.width);
        assert.equal(source.height, this.height);
        if (this.ctx.globalCompositeOperation === "copy") {
          this.pixels.set(source.pixels);
          return;
        }
        assert.equal(this.ctx.globalCompositeOperation, "destination-in");
        for (let j = 3; j < this.pixels.length; j += 4) {
          this.pixels[j] = Math.round(this.pixels[j] * source.pixels[j] / 255);
        }
      },
    };
  }

  get width() { return this._width; }
  set width(value) { this._width = value; this.reset(); }
  get height() { return this._height; }
  set height(value) { this._height = value; this.reset(); }
  reset() { this.pixels = new Uint8ClampedArray(this._width * this._height * 4); }
  getContext() { return this.ctx; }
}

function loadModule(filename, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    Float32Array,
    Float64Array,
    Math,
    document: { createElement: () => new PixelCanvas() },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected render import: ${name}`);
      return dependencies[name];
    },
  });
  return mod.exports;
}

const postprocess = loadModule("../src/lib/remover/postprocess.ts");
const render = loadModule("../src/lib/remover/render.ts", { "./postprocess": postprocess });

function image(rgba) {
  const canvas = render.makeCanvas(rgba.length / 4, 1);
  canvas.pixels.set(rgba);
  return canvas;
}

function alpha(canvas) {
  return Array.from(canvas.pixels).filter((_, index) => index % 4 === 3);
}

test("local defringing preserves PNG transparency, including model false positives on transparent pixels", () => {
  const rgba = new Uint8ClampedArray([
    220, 160, 80, 128,
    160, 120, 60, 128,
    0, 0, 0, 0,
    80, 60, 40, 255,
  ]);
  const original = image(rgba);
  const mask = image([
    255, 255, 255, 255,
    255, 255, 255, 128,
    255, 255, 255, 255,
    255, 255, 255, 128,
  ]);
  const baseline = render.makeCanvas(4, 1);
  render.updateCut(baseline, original, mask);
  const foreground = render.buildDecontaminatedForeground(original, mask, { defringe: true, defringeStrength: 0.9 });
  assert.ok(foreground, "Exercise the enabled defringing path");
  const cleaned = render.makeCanvas(4, 1);
  render.updateCut(cleaned, original, mask, undefined, foreground);

  assert.deepEqual(alpha(cleaned), [128, 64, 0, 128]);
  assert.deepEqual(alpha(cleaned), alpha(baseline), "Color cleanup must not change source transparency");
  assert.deepEqual(original.pixels, rgba, "The original image stays available for Restore");
});

test("remote cut-out alpha is applied once instead of being squared by its RGB foreground canvas", () => {
  const original = image([220, 160, 80, 255, 0, 0, 0, 255]);
  const remote = {
    rgba: new Uint8ClampedArray([80, 70, 60, 128, 0, 0, 0, 0]),
    mask: new Uint8ClampedArray([128, 0]),
    width: 2,
    height: 1,
    ms: 1,
  };
  const mask = image([255, 255, 255, 128, 255, 255, 255, 0]);
  const foreground = render.buildForegroundFromRgba(remote, 2, 1);
  assert.ok(foreground);
  const cut = render.makeCanvas(2, 1);
  render.updateCut(cut, original, mask, undefined, foreground);

  assert.deepEqual(alpha(cut), [128, 0]);
  assert.deepEqual(Array.from(cut.pixels.subarray(0, 3)), [80, 70, 60]);
});
