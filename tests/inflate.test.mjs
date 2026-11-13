import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = fs.readFileSync(path.join(root, 'src', 'app-core.js'), 'utf8');
const imp = fs.readFileSync(path.join(root, 'src', 'app-import.js'), 'utf8');

const sandbox = { console, Date, Math, JSON, String, Number, Object, Array, RegExp, Uint8Array, TextDecoder, Blob, Response, DecompressionStream, crypto: globalThis.crypto };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(core + '\n' + imp + '\nwindow.__builder.inflateRaw = inflateRaw;\n})();', sandbox, { filename: 'app.js' });
const inflateRaw = sandbox.window.__builder.inflateRaw;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  -', name); }
  catch (e) { console.error('FAIL-', name); console.error(e && e.stack || e); process.exitCode = 1; }
}

function roundtrip(data, level) {
  const compressed = zlib.deflateRawSync(data, { level });
  const out = inflateRaw(new Uint8Array(compressed), data.length);
  assert.equal(Buffer.compare(Buffer.from(out), data), 0);
}

test('stored block (level 0)', () => {
  roundtrip(Buffer.from('hello world hello world hello world'), 0);
});
test('text level 6', () => {
  roundtrip(Buffer.from('题目检测生成器 '.repeat(500)), 6);
});
test('text level 9', () => {
  roundtrip(Buffer.from('a'.repeat(100000) + 'b'.repeat(1000)), 9);
});
test('random binary level 6 (stored fallback)', () => {
  roundtrip(crypto.randomBytes(70000), 6);
});
test('empty input', () => {
  const compressed = zlib.deflateRawSync(Buffer.alloc(0));
  const out = inflateRaw(new Uint8Array(compressed), 0);
  assert.equal(out.length, 0);
});
test('mixed random sizes/levels', () => {
  for (let i = 0; i < 12; i++) {
    const size = Math.floor(Math.random() * 5000);
    const data = crypto.randomBytes(size);
    roundtrip(data, i % 10);
  }
});
test('repetitive binary (long matches)', () => {
  const data = Buffer.alloc(200000);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + (i >> 4)) & 0xff;
  roundtrip(data, 9);
});

console.log(`\n${passed} tests passed`);
