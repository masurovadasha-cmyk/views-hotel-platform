'use strict';
// Linux development launcher for the existing Stage 7.25 Core, never public ingress.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { localState } = require('./local-state.cjs');

const REPO = path.resolve(__dirname, '../../..');
const API = path.join(REPO, 'apps/api');
const IMAGE = 'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4';
const ORG = '74240000-0000-4000-8000-000000000001';
let state, config, container;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: REPO, encoding: 'utf8', timeout: 120000, ...options });
  if (result.error || result.status !== 0) {
    // Never echo a command environment or secret-bearing database diagnostic.
    throw Error('COMMAND_FAILED:' + path.basename(executable) + ':' + args[0]);
  }
  return result.stdout;
}

function prepare() {
  if (process.platform !== 'linux') throw Error('LINUX_ONLY');
  const root = path.resolve(process.env.VIEWS_LOCAL_STATE_DIR || '/workspace/.views-local');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, 'private'), { recursive: true, mode: 0o700 });
  process.env.VIEWS_CLOUD_REHEARSAL = 'true';
  process.env.VIEWS_LOCAL_STATE_DIR = root;
  state = localState();
  for (const name of ['data', 'logs', 'evidence', 'tools']) fs.mkdirSync(path.join(state.root, name), { recursive: true, mode: 0o700 });
  const file = path.join(state.privateDir, 'runtime.json');
  if (!fs.existsSync(file)) {
    const secret = () => randomBytes(32).toString('hex');
    write(file, { schemaVersion: 1, scope: state.scope, ownerPassword: secret(), runtimePassword: secret(), rateSecret: secret(), internalSecret: secret() });
  }
  if (fs.lstatSync(file).isSymbolicLink() || (fs.statSync(file).mode & 0o077)) throw Error('PRIVATE_CONFIGURATION_PERMISSIONS_INVALID');
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.scope !== state.scope || !['ownerPassword', 'runtimePassword', 'rateSecret', 'internalSecret'].every(k => /^[a-f0-9]{64}$/.test(config[k]))) {
    throw Error('LOCAL_RUNTIME_CONFIGURATION_INVALID');
  }
  if(config.documentVaultKey===undefined){config.documentVaultKey=randomBytes(32).toString('hex');write(file,config);}
  if(!/^[a-f0-9]{64}$/.test(config.documentVaultKey))throw Error('LOCAL_DOCUMENT_KEY_INVALID');
  const pw = path.join(state.privateDir, 'postgres-password');
  if (!fs.existsSync(pw)) fs.writeFileSync(pw, config.ownerPassword, { mode: 0o600, flag: 'wx' });
  container = 'views-local-' + createHash('sha256').update(state.root).digest('hex').slice(0, 12);
}

function inspectContainer() {
  const result = spawnSync('docker', ['container', 'inspect', container], { encoding: 'utf8' });
  if (result.status !== 0) {
    command('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (!result.stderr?.includes('No such container') && !result.stderr?.includes('No such object')) throw Error('CONTAINER_INSPECTION_FAILED');
    return null;
  }
  const info = JSON.parse(result.stdout)[0];
  const binding = info.HostConfig.PortBindings?.['5432/tcp'];
  if (info.Config.Labels?.['views.local.root'] !== state.root || info.Config.Labels?.['views.local.repo'] !== REPO ||
      info.Config.Image !== IMAGE || info.Config.User !== `${process.getuid()}:${process.getgid()}` ||
      binding?.length !== 1 || binding[0].HostIp !== '127.0.0.1' || binding[0].HostPort !== '55432') {
    throw Error('CONTAINER_IDENTITY_MISMATCH');
  }
  return info;
}

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', () => reject(Error('LOCAL_PORT_IN_USE:' + port)));
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
}

async function connect(runtime = false) {
  const client = new Client({ host: '127.0.0.1', port: 55432, database: 'views_local', user: runtime ? 'views_app' : 'views_owner',
    password: runtime ? config.runtimePassword : config.ownerPassword, connectionTimeoutMillis: 2000 });
  await client.connect();
  return client;
}

async function database() {
  let info = inspectContainer();
  if (!info) {
    await freePort(55432);
    command('docker', ['create', '--name', container, '--user', `${process.getuid()}:${process.getgid()}`,
      '--label', 'views.local.root=' + state.root, '--label', 'views.local.repo=' + REPO,
      '--publish', '127.0.0.1:55432:5432', '--restart', 'no',
      '--mount', `type=bind,src=${path.join(state.root, 'data')},dst=/var/lib/postgresql/data`,
      '--mount', `type=bind,src=${path.join(state.privateDir, 'postgres-password')},dst=/run/postgres-password,readonly`,
      '--env', 'POSTGRES_DB=views_local', '--env', 'POSTGRES_USER=views_owner',
      '--env', 'POSTGRES_PASSWORD_FILE=/run/postgres-password', '--env', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256', IMAGE]);
    info = inspectContainer();
  }
  if (!info.State.Running) { await freePort(55432); command('docker', ['start', container]); }
  let client;
  for (let i = 0; i < 60; i++) {
    try { client = await connect(); break; } catch { await pause(500); }
  }
  if (!client) throw Error('POSTGRES_NOT_READY');
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('views_cloud_bootstrap'))");
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='views_app'")).rowCount) {
      const q = (await client.query("SELECT format('CREATE ROLE views_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', $1::text) AS sql", [config.runtimePassword])).rows[0].sql;
      await client.query(q);
    }
    await client.query(fs.readFileSync(path.join(REPO, 'infra/postgres/init/001_extensions.sql'), 'utf8'));
    await client.query('CREATE TABLE IF NOT EXISTS public.views_local_migrations(name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = path.join(API, 'db/migrations');
    const files = fs.readdirSync(dir).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    let applied = 0;
    for (const name of files) {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const prior = (await client.query('SELECT sha256 FROM views_local_migrations WHERE name=$1', [name])).rows[0];
      if (prior) { if (prior.sha256 !== hash) throw Error('MIGRATION_CHECKSUM_CHANGED:' + name); continue; }
      if (!sql.startsWith('BEGIN;') || !/COMMIT;\s*$/.test(sql)) throw Error('MIGRATION_TRANSACTION_REQUIRED:' + name);
      // Add the checksum in the same transaction as the repository's migration.
      await client.query(sql.replace(/COMMIT;\s*$/, ''));
      await client.query('INSERT INTO views_local_migrations(name,sha256) VALUES($1,$2)', [name, hash]);
      await client.query('COMMIT');
      applied++;
    }
    await client.query('GRANT CONNECT ON DATABASE views_local TO views_app; GRANT USAGE ON SCHEMA public,app TO views_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO views_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO views_app; REVOKE INSERT,UPDATE,DELETE ON provider_egress_attempts,provider_egress_reconciliation_queue,views_local_migrations FROM views_app');
    console.log(JSON.stringify({ databaseReady: true, migrations: files.length, newMigrations: applied }));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}

function coreEnvironment() {
  return { ...process.env, NODE_ENV: 'test', PORT: '3001', VIEWS_ENV: 'local-rehearsal', VIEWS_LOCAL_REHEARSAL: 'true', TRUSTED_PROXY_MODE: 'direct',
    DATABASE_URL: `postgresql://views_app:${config.runtimePassword}@127.0.0.1:55432/views_local`,
    GUEST_AUTH_RATE_LIMIT_SECRET: config.rateSecret, VIEWS_INTERNAL_API_KEY: config.internalSecret,
    VIEWS_LOCAL_DOCUMENT_PILOT_ENABLED:'true', VIEWS_LOCAL_DOCUMENT_KEY:config.documentVaultKey,
    VIEWS_STAFF_AUTH_PILOT_ENABLED: 'true', VIEWS_STAFF_STAY_PILOT_ENABLED: 'true', VIEWS_STAFF_AUTH_ORGANIZATION_ID: ORG,
    VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON: '{"local-workspace":"internal_key_only"}',
    VIEWS_INTERNAL_SERVICE_KEYS_JSON: JSON.stringify({ 'local-workspace': [config.internalSecret] }),
    VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON: '{}', VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON: '{"local-workspace":["127.0.0.1/32"]}',
    VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON: '{}', VIEWS_TRUSTED_PROXY_CIDRS_JSON: '',
    VIEWS_PAYME_SANDBOX_ENABLED: 'false', VIEWS_PAYME_MODE: 'sandbox', VIEWS_STAGING_MAINTENANCE_ENABLED: 'false' };
}

function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').slice(1).join(') ').split(' ');
    if (stat[0] === 'Z') return null;
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const uid = Number(status.match(/^Uid:\s+(\d+)/m)?.[1]);
    if (uid !== process.getuid()) throw Error('PROCESS_OWNER_MISMATCH');
    return { start: stat[19], uid, args: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean),
      boot: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() };
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
}

function recordedProcess(name) {
  const file = path.join(state.root, name + '-process.json');
  if (!fs.existsSync(file)) return null;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Number.isSafeInteger(saved.pid) || saved.pid < 2) throw Error('PROCESS_RECORD_INVALID');
  const actual = processIdentity(saved.pid);
  if (!actual || actual.boot !== saved.identity.boot) { fs.unlinkSync(file); return null; }
  if (JSON.stringify(actual) !== JSON.stringify(saved.identity)) throw Error('PROCESS_IDENTITY_MISMATCH:' + name);
  return saved;
}

async function stopProcess(name) {
  const saved = recordedProcess(name);
  if (!saved) return;
  process.kill(saved.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    if (!processIdentity(saved.pid)) { fs.unlinkSync(path.join(state.root, name + '-process.json')); return; }
    await pause(100);
  }
  throw Error('PROCESS_STOP_TIMEOUT:' + name);
}

async function waitHttp(url, expected) {
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok && await expected(response)) return; } catch { /* startup */ }
    await pause(500);
  }
  throw Error('SERVICE_NOT_READY:' + new URL(url).port);
}

async function startProcess(name, entry, args, port, env) {
  if (recordedProcess(name)) return;
  await freePort(port);
  const out = fs.openSync(path.join(state.root, 'logs', name + '.log'), 'a', 0o600);
  const child = spawn(process.execPath, [entry, ...args], { cwd: REPO, env, detached: true, stdio: ['ignore', out, out] });
  child.unref(); fs.closeSync(out);
  await pause(100);
  const identity = processIdentity(child.pid);
  if (!identity) throw Error('PROCESS_START_FAILED:' + name);
  write(path.join(state.root, name + '-process.json'), { pid: child.pid, identity });
}

async function startWeb() {
  if (!fs.existsSync(path.join(REPO, 'dist/index.html'))) throw Error('BUILD_WEB_FIRST');
  await startProcess('web', __filename, ['serve-web'], 4173, process.env);
  await waitHttp('http://127.0.0.1:4173/?api=local-core', async r => (await r.text()).includes('<div id="root">'));
}

async function status() {
  if (!inspectContainer()?.State.Running || !recordedProcess('core') || !recordedProcess('web')) throw Error('LOCAL_SERVICES_NOT_RUNNING');
  const client = await connect(true);
  try {
    const role = (await client.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    if (role.name !== 'views_app' || role.rolsuper || role.rolbypassrls) throw Error('UNSAFE_RUNTIME_ROLE');
  } finally { await client.end(); }
  await waitHttp('http://127.0.0.1:3001/readiness', async r => (await r.json()).database === 'ok');
  const session = await fetch('http://127.0.0.1:4173/local-api/session', { headers: { 'X-Views-Local-Workspace': '1' }, signal: AbortSignal.timeout(5000) });
  if (!session.ok || (await session.json()).authenticated !== false) throw Error('LOGIN_NOT_READY');
  console.log(JSON.stringify({ ready: true, postgres: 16, runtimeRole: 'views_app', staffLogin: true, ports: [55432, 3001, 4173], loopbackOnly: true, realPayments: false }));
}

async function main() {
  const mode = process.argv[2] || 'start';
  if (!['start', 'init', 'status', 'stop', 'restart-web', 'serve-web'].includes(mode)) throw Error('UNKNOWN_LOCAL_COMMAND');
  prepare();
  if (mode === 'serve-web') {
    const fixture = JSON.parse(fs.readFileSync(path.join(state.privateDir, 'workspace.json'), 'utf8'));
    if (fixture.scope !== 'views-local-core-workspace' || fixture.organizationId !== ORG) throw Error('LOCAL_FIXTURE_SCOPE_REQUIRED');
    const server = require('./serve-local-review.cjs').createReviewServer({ configuration: { fixture, internalKey: config.internalSecret } });
    server.listen(4173, '127.0.0.1');
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    return;
  }
  if (mode === 'stop') {
    await stopProcess('web'); await stopProcess('core');
    if (inspectContainer()?.State.Running) command('docker', ['stop', '--time', '20', container]);
    console.log(JSON.stringify({ stopped: true, databaseRetained: true })); return;
  }
  if (mode === 'status') return status();
  if (mode === 'restart-web') { await stopProcess('web'); return startWeb(); }
  await database();
  for (const [file, ack] of [['prepare-local-workspace.cjs', 'LOCAL_SYNTHETIC_WORKSPACE'], ['prepare-staff-pilot.cjs', 'LOCAL_STAFF_PILOT']]) {
    process.stdout.write(command(process.execPath, [path.join(__dirname, file), '--ack=' + ack]));
  }
  if (mode === 'init') return;
  if (!fs.existsSync(path.join(API, 'dist/main.js'))) throw Error('BUILD_CORE_FIRST');
  await startProcess('core', path.join(API, 'dist/main.js'), [], 3001, coreEnvironment());
  await waitHttp('http://127.0.0.1:3001/readiness', async r => (await r.json()).database === 'ok');
  await startWeb();
  await status();
}

main().catch(error => {
  // PostgreSQL's human error text can contain connection details; only its code is logged.
  const code = error.code || (/^[A-Z0-9_:./-]+$/.test(error.message) ? error.message : 'LOCAL_REHEARSAL_FAILED');
  console.error(JSON.stringify({ ok: false, code })); process.exitCode = 1;
});
