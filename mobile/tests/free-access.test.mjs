import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('PDF processing has no trial or payment dependency', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(!/Trial\.status|refreshAccess|showUnlock|unlock-dialog/.test(source));
  const run = source.slice(source.indexOf('async function run('), source.indexOf('async function processPython('));
  assert(!/Ads\.|purchased|trial/i.test(run));
  assert(!existsSync(new URL('../android/app/src/main/java/com/nishanchettri/rabpdf/TrialPlugin.java', import.meta.url)));
});

test('advertising is optional and uses separate test IDs', () => {
  const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  assert(gradle.includes("getOrElse('off')"));
  assert(gradle.includes('ca-app-pub-3940256099942544/6300978111'));
  assert(!gradle.includes('billingclient'));
});
