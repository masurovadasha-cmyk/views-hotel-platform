'use strict';
// Dedicated disposable PostgreSQL on the fixed loopback endpoints required by
// the existing rehearsal guard. Refuse occupied ports; never touch a live DB.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const REPO = path.resolve(__dirname, '..');
const { Client } = require(path.join(REPO, 'apps/api/node_modules/pg'));
const IMAGE = 'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4';
const name = 'views-mail-ci-' + randomBytes(8).toString('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-mail-ci-'));
const run = args => {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  if (r.error || r.status !== 0) throw Error('DOCKER_COMMAND_FAILED:' + args[0]);
  return r.stdout;
};
async function free(port) {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => reject(Error('LOCAL_PORT_IN_USE:' + port)));
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
}
(async () => {
  let db, created = false;
  try {
    await free(55432); await free(3001); await free(4173);
    fs.writeFileSync(path.join(dir, 'password'), 'fixture-owner', { mode: 0o600 });
    run(['run', '--detach', '--rm', '--name', name, '--label', 'views.disposable-mail-test=true',
      '--publish', '127.0.0.1:55432:5432', '--mount', `type=bind,src=${path.join(dir, 'password')},dst=/run/password,readonly`,
      '--env', 'POSTGRES_DB=views_local', '--env', 'POSTGRES_USER=views_owner', '--env', 'POSTGRES_PASSWORD_FILE=/run/password', IMAGE]);
    created = true;
    for (let i = 0; i < 60; i++) {
      const candidate = new Client({ connectionString: 'postgresql://views_owner:fixture-owner@127.0.0.1:55432/views_local', connectionTimeoutMillis: 1000 });
      try { await candidate.connect(); db = candidate; break; }
      catch { await candidate.end().catch(() => {}); await new Promise(r => setTimeout(r, 500)); }
    }
    if (!db) throw Error('MAIL_CI_POSTGRES_NOT_READY');
    await db.query("COMMENT ON DATABASE views_local IS 'VIEWS_DISPOSABLE_STAFF_MAIL'");
    await db.query(fs.readFileSync(path.join(REPO, 'infra/postgres/init/001_extensions.sql'), 'utf8'));
    const migrations = path.join(REPO, 'apps/api/db/migrations');
    for (const file of fs.readdirSync(migrations).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
      try { await db.query(fs.readFileSync(path.join(migrations, file), 'utf8')); }
      catch (e) { console.error('Migration failed:', file, e.code, e.message); throw e; }
    }
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/staff-mail.integration.cjs'], {
        cwd: REPO, stdio: 'inherit', env: { ...process.env, VIEWS_MAIL_TEST_CONTAINER: name, VIEWS_MAIL_PROOF_ACK: 'DISPOSABLE_MAIL_ONLY',
          STAFF_MAIL_PROOF_OWNER_URL: 'postgresql://views_owner:fixture-owner@127.0.0.1:55432/views_local' }
      });
      child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
    });
    process.exitCode = code;
  } finally {
    if (db) await db.end();
    if (created) run(['stop', '--time', '10', name]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error('MAIL_CI_FAILED:' + (e.code || e.message)); process.exitCode = 1; });
