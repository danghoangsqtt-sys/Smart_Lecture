/**
 * mDNS resilience regression test.
 *
 * bonjour-service (the library behind advertiseMdns() in system.routes.ts) exposes
 * no public API for its underlying multicast-dns socket's 'error' event — the one
 * that fires on EACCES/EADDRINUSE for the shared UDP 5353 port, which is exactly
 * what happens when another SmartLecture instance is already advertising on the
 * same LAN or host. With zero listeners on that EventEmitter, Node rethrows the
 * error as an uncaught exception and kills the whole server over a network hiccup
 * unrelated to the app's core function — verified directly against this repo's
 * installed node_modules/multicast-dns package (index.js).
 *
 * attachMdnsSafetyNet() (server/src/routes/system.routes.ts) reaches into the
 * private `server.mdns` field to attach a listener and neutralize this. This test
 * proves that fix against a real Bonjour instance from the actual dependency:
 *   1. without attachMdnsSafetyNet, forcing that socket error crashes the process
 *      (regression baseline — this must currently FAIL to prove the test is real)
 *   2. with attachMdnsSafetyNet, the same forced error does not crash the process
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// This test only imports server/dist/routes/system.routes.js for attachMdnsSafetyNet;
// that import chain reaches db/connection.ts, which opens node:sqlite at module load
// time. Force an isolated DATA_DIR so that open can never touch the real project
// database, no matter how this script itself was invoked.
const isolatedDataDir = mkdtempSync(path.join(tmpdir(), 'smart-lecture-mdns-test-'));
const childEnv = { ...process.env, DATA_DIR: isolatedDataDir, DB_PATH: path.join(isolatedDataDir, 'mdns-test.db') };

function runChild(scriptBody) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', scriptBody], {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => resolve({ code, output }));
  });
}

const forceErrorAfterPublish = `
import { Bonjour } from 'bonjour-service';
const bonjour = new Bonjour();
{{ATTACH}}
bonjour.publish({ name: 'ReproTest', type: 'http', port: 12399 });
setTimeout(() => {
  const err = new Error('simulated EADDRINUSE');
  err.code = 'EADDRINUSE';
  bonjour.server.mdns.emit('error', err);
}, 200);
setTimeout(() => { console.log('SURVIVED'); process.exit(0); }, 800);
`;

function fail(message, output) {
  console.error(`  FAIL  ${message}`);
  console.error(output);
  rmSync(isolatedDataDir, { recursive: true, force: true });
  process.exit(1);
}

console.log('=== mDNS resilience regression test ===');

const withoutFix = await runChild(forceErrorAfterPublish.replace('{{ATTACH}}', ''));
const withoutFixCrashed = withoutFix.code !== 0 && withoutFix.output.includes("Unhandled 'error' event");
if (!withoutFixCrashed) {
  fail('baseline (no safety net) did not crash as expected — test no longer proves anything; re-check bonjour-service behavior', withoutFix.output);
}
console.log('  OK    confirmed baseline: an unhandled mdns socket error crashes the process without the safety net');

const attachSnippet = `
import { attachMdnsSafetyNet } from './server/dist/routes/system.routes.js';
`;
const withFix = await runChild(attachSnippet + forceErrorAfterPublish.replace('{{ATTACH}}', 'attachMdnsSafetyNet(bonjour);'));
const withFixSurvived = withFix.code === 0 && withFix.output.includes('SURVIVED');
if (!withFixSurvived) {
  fail('attachMdnsSafetyNet did not prevent the crash', withFix.output);
}
console.log('  PASS  attachMdnsSafetyNet prevents the crash on a simulated mdns socket error');

rmSync(isolatedDataDir, { recursive: true, force: true });
process.exit(0);
