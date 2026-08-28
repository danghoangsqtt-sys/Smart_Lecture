import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
let failures = 0;

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

const manifests = ['package.json', 'server/package.json', 'web/package.json'];
const versions = manifests.map((file) => JSON.parse(read(file)).version);
const appVersion = versions[0];

check('workspace package versions match', versions.every((version) => version === appVersion));
check('lockfile version matches package version', JSON.parse(read('package-lock.json')).version === appVersion);
check('server runtime version matches package version', read('server/src/version.ts').includes(`APP_VERSION = '${appVersion}'`));
check('system info imports the central version', read('server/src/routes/system.routes.ts').includes("from '../version.js'"));
check('backup manifest imports the central version', read('server/src/services/backup.ts').includes("from '../version.js'"));
check('no stale runtime app version remains', !read('server/src/routes/system.routes.ts').includes("appVersion: '0.3.0'") && !read('server/src/services/backup.ts').includes("appVersion: '0.3.0'"));
check('handoff identifies the active development version', JSON.parse(read('.DHSYSTEM/HANDOFF.json')).version.startsWith(appVersion));
check('project metadata identifies the active development version', read('.DHSYSTEM/PROJECT-META.md').includes(`| Phiên bản | ${appVersion} (planned) |`));

if (failures) process.exit(1);
