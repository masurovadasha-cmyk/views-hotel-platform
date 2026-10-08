'use strict';
// Run the existing CI's PostgreSQL fixtures and full API suite in a fresh container.
// The development database is never reset or used by this runner.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const REPO = path.resolve(__dirname, '..');
const { Client } = require(path.join(REPO, 'apps/api/node_modules/pg'));
const IMAGE = 'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4';
const name = 'views-core-ci-' + randomBytes(8).toString('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-core-ci-'));
const ownerPassword = randomBytes(32).toString('hex');
const runtimePassword = randomBytes(32).toString('hex');
const run = args => {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  if (r.error || r.status !== 0) throw Error('DOCKER_COMMAND_FAILED:' + args[0]);
  return r.stdout;
};

(async () => {
  let admin, runtime, created = false;
  try {
    fs.writeFileSync(path.join(dir, 'password'), ownerPassword, { mode: 0o600 });
    run(['run', '--detach', '--rm', '--name', name, '--label', 'views.disposable-core-test=true',
      '--publish', '127.0.0.1::5432', '--mount', `type=bind,src=${path.join(dir, 'password')},dst=/run/password,readonly`,
      '--env', 'POSTGRES_DB=views', '--env', 'POSTGRES_USER=views', '--env', 'POSTGRES_PASSWORD_FILE=/run/password', IMAGE]);
    created = true;
    const binding = JSON.parse(run(['inspect', name]))[0].NetworkSettings.Ports['5432/tcp'][0];
    assert.equal(binding.HostIp, '127.0.0.1');
    const port = Number(binding.HostPort);
    for (let i = 0; i < 60; i++) {
      const candidate = new Client({ host: '127.0.0.1', port, database: 'views', user: 'views', password: ownerPassword, connectionTimeoutMillis: 1000 });
      try { await candidate.connect(); admin = candidate; break; }
      catch { await candidate.end().catch(() => {}); await new Promise(r => setTimeout(r, 500)); }
    }
    if (!admin) throw Error('CI_POSTGRES_NOT_READY');
    await admin.query("COMMENT ON DATABASE views IS 'VIEWS_DISPOSABLE_CORE_TEST'");
    await admin.query(fs.readFileSync(path.join(REPO, 'infra/postgres/init/001_extensions.sql'), 'utf8'));
    const migrations = path.join(REPO, 'apps/api/db/migrations');
    for (const file of fs.readdirSync(migrations).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
      await admin.query(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
    // Use the authoritative workflow fixture SQL, including its scoped identities.
    const workflow = fs.readFileSync(path.join(REPO, '.github/workflows/production-core.yml'), 'utf8');
    const blocks = [...workflow.matchAll(/<<'SQL'\r?\n([\s\S]*?)\r?\n\s+SQL(?:\r?\n|$)/g)].map(m => m[1]);
    assert.equal(blocks.length, 3, 'Review this runner when the CI seed contract changes');
    for (const sql of blocks) await admin.query(sql.replaceAll("'views_app_test'", "'" + runtimePassword + "'"));
    await admin.query(fs.readFileSync(path.join(REPO, 'apps/api/db/seeds/stage-b1.synthetic.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(REPO, 'apps/api/db/tests/stage-b1.constraints.sql'), 'utf8'));
    console.log('B1 administrative constraint proofs: 7 groups PASS (rolled back).');
    await admin.query(fs.readFileSync(path.join(REPO, 'apps/api/db/tests/stage-b2.sms.sql'), 'utf8'));
    console.log('B2 SMS administrative clock and identity proofs PASS (rolled back).');
    await admin.query(fs.readFileSync(path.join(REPO, 'apps/api/db/tests/stage-b2.email.sql'), 'utf8'));
    console.log('B2 email expiry, supersession and role separation proofs PASS (rolled back).');
    await assert.rejects(admin.query(`INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,source_ref,stay_period)
      VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000004','maintenance','cloud-ci-overlap',tstzrange('2026-10-11T12:00:00+05','2026-10-13T12:00:00+05','[)'))`), { code: '23P01' });
    runtime = new Client({ host: '127.0.0.1', port, database: 'views', user: 'views_app', password: runtimePassword });
    await runtime.connect();
    const role = (await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
    await runtime.query("BEGIN; SELECT set_config('app.organization_id','00000000-0000-0000-0000-000000000001',true); SELECT set_config('app.user_id','20000000-0000-4000-8000-000000000001',true); SELECT set_config('app.membership_id','30000000-0000-4000-8000-000000000001',true)");
    assert.equal((await runtime.query("SELECT count(*)::int n FROM properties WHERE id='00000000-0000-0000-0000-000000000002'")).rows[0].n, 1);
    assert.equal((await runtime.query("SELECT count(*)::int n FROM properties WHERE id='10000000-0000-4000-8000-000000000002'")).rows[0].n, 0);
    await runtime.query('ROLLBACK');
    console.log('PostgreSQL 16: migrations, no-overbooking and tenant isolation PASS; starting complete Core suite.');
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(REPO, 'apps/api/node_modules/vitest/vitest.mjs'), 'run'], {
        cwd: path.join(REPO, 'apps/api'), stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: `postgresql://views_app:${runtimePassword}@127.0.0.1:${port}/views` }
      });
      child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
    if(exitCode===0&&process.env.VIEWS_HOUSEKEEPING_HTTP_PROOF==='true')await require('./housekeeping-connected-proof.cjs')({admin,runtimeUrl:`postgresql://views_app:${runtimePassword}@127.0.0.1:${port}/views`});
    if(exitCode===0&&process.env.VIEWS_GUEST_EMAIL_HTTP_PROOF==='true')await require('./guest-email-http-proof.cjs')({admin,runtimeUrl:`postgresql://views_app:${runtimePassword}@127.0.0.1:${port}/views`});
  } finally {
    if (runtime) await runtime.end();
    if (admin) await admin.end();
    if (created) run(['stop', '--time', '10', name]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error('CORE_CI_FAILED:' + (error.code || 'SETUP_OR_ASSERTION')); process.exitCode = 1; });
