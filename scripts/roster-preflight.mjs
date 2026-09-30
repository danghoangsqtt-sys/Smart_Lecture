import { inspectRoster } from './lib/rosterPreflight.mjs';

function usage() {
  console.error('Usage: node scripts/roster-preflight.mjs --db <existing-sqlite-file> [--json]');
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const dbOption = args.indexOf('--db');
const json = args.includes('--json');
const validLength = json ? 3 : 2;
if (dbOption < 0 || !args[dbOption + 1] || args.length !== validLength || args.some((arg, index) => arg.startsWith('--') && arg !== '--db' && arg !== '--json')) {
  usage();
} else {
  try {
    const report = inspectRoster(args[dbOption + 1]);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const { users, students, classes, enrollments, issueCounts } = report.summary;
      console.log(`Roster: ${users} users, ${students} students, ${classes} classes, ${enrollments} enrollments`);
      for (const [name, count] of Object.entries(issueCounts)) console.log(`${name}: ${count}`);
      console.log(report.readyForConstraint ? 'READY: no roster conflicts detected' : 'BLOCKED: review conflicts before enforcing one-class constraints');
      console.log('No database changes were made. Use --json only when identifier details are needed.');
    }
    process.exitCode = report.readyForConstraint ? 0 : 1;
  } catch (error) {
    console.error(`Roster preflight failed: ${error.message}`);
    process.exitCode = 2;
  }
}
