import { mkdir, readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const runtime = resolve('public/runtime');
await mkdir(runtime, { recursive: true });
await cp(await realpath('node_modules/pyodide'), runtime, { recursive: true, dereference: true });
for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, {recursive:true});
const lock = JSON.parse(await readFile(`${runtime}/pyodide-lock.json`, 'utf8'));
const base = 'https://cdn.jsdelivr.net/pyodide/v0.29.1/full/';
const loaded = new Set();
async function download(url, target, expectedHash) {
  if (expectedHash) {
    try {
      const existing=await readFile(target);
      if(createHash('sha256').update(existing).digest('hex')===expectedHash)return;
    } catch {}
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (expectedHash && createHash('sha256').update(data).digest('hex') !== expectedHash)
    throw new Error(`Checksum mismatch: ${url}`);
  await writeFile(target, data);
}
async function packageFiles(name) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const pkg = lock.packages[name];
  if (!pkg) throw new Error(`Missing Pyodide package: ${name}`);
  for (const dep of pkg.depends) await packageFiles(dep);
  await download(base + pkg.file_name, `${runtime}/${pkg.file_name}`, pkg.sha256);
  console.log(`Bundled ${name}`);
}
for (const name of ['pillow', 'cryptography', 'micropip']) await packageFiles(name);
const wheels = [];
await mkdir('public/wheels', { recursive: true });
for (const [name, version] of [['pypdf', '6.10.0'], ['reportlab', '4.4.9'], ['charset-normalizer', '3.4.3']]) {
  const response = await fetch(`https://pypi.org/pypi/${name}/${version}/json`);
  if (!response.ok) throw new Error(`Cannot resolve ${name}`);
  const info = await response.json();
  const wheel = info.urls.find(x => x.filename.endsWith('py3-none-any.whl'));
  if (!wheel) throw new Error(`No portable wheel for ${name}`);
  await download(wheel.url, `public/wheels/${wheel.filename}`, wheel.digests.sha256);
  wheels.push(wheel.filename);
}
await writeFile('public/wheels/manifest.json', JSON.stringify(wheels));
console.log('Offline runtime bundled; no package downloads are needed by app users');
