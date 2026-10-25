'use strict';
// Standalone S1 proof: disposable Docker PostgreSQL only; no environment DATABASE_URL.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{Client}=require(path.join(root,'apps/api/node_modules/pg'));
const name='views-partner-negative-'+randomBytes(8).toString('hex'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'views-partner-negative-')),ownerPassword=randomBytes(32).toString('hex'),runtimePassword=randomBytes(32).toString('hex');
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8',timeout:120000});if(r.error||r.status!==0)throw Error('SLA_DOCKER_'+args[0]+'_FAILED');return r.stdout;};
(async()=>{let admin,created=false;try{
 fs.writeFileSync(path.join(dir,'password'),ownerPassword,{mode:0o600});docker(['run','--detach','--rm','--name',name,'--label','views.disposable-core-test=true','--publish','127.0.0.1::5432','--mount',`type=bind,src=${path.join(dir,'password')},dst=/run/password,readonly`,'--env','POSTGRES_DB=views','--env','POSTGRES_USER=views','--env','POSTGRES_PASSWORD_FILE=/run/password','postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4']);created=true;
 const binding=JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');const port=Number(binding.HostPort);
 for(let i=0;i<60;i++){const c=new Client({host:'127.0.0.1',port,database:'views',user:'views',password:ownerPassword,connectionTimeoutMillis:1000});try{await c.connect();admin=c;break;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,500));}}if(!admin)throw Error('SLA_DB_NOT_READY');
 await admin.query("COMMENT ON DATABASE views IS 'VIEWS_DISPOSABLE_CORE_TEST'");await admin.query(fs.readFileSync(path.join(root,'infra/postgres/init/001_extensions.sql'),'utf8'));
 const migrations=fs.readdirSync(path.join(root,'db/migrations')).filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort();for(const f of migrations)await admin.query(fs.readFileSync(path.join(root,'db/migrations',f),'utf8'));
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/production-core.yml'),'utf8'),blocks=[...workflow.matchAll(/<<'SQL'\r?\n([\s\S]*?)\r?\n\s+SQL(?:\r?\n|$)/g)].map(m=>m[1]);assert.equal(blocks.length,3);for(const sql of blocks)await admin.query(sql.replaceAll("'views_app_test'","'"+runtimePassword+"'"));
 await admin.query(fs.readFileSync(path.join(root,'apps/api/db/seeds/stage-b1.synthetic.sql'),'utf8'));
 await admin.query('REVOKE UPDATE,DELETE ON sla_policy_draft_versions,sla_policy_draft_commands FROM views_app');await admin.query('GRANT SELECT,INSERT ON sla_policy_draft_versions,sla_policy_draft_commands TO views_app');
 await require('../apps/api/db/tests/partner-foundation.cjs')({admin,runtimeUrl:`postgresql://views_app:${runtimePassword}@127.0.0.1:${port}/views`});console.log('P1 negative standalone disposable migrations='+migrations.length+' PASS; no live database used.');
 }finally{if(admin)await admin.end();if(created)docker(['rm','--force',name]);fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error('SLA_DISPOSABLE_FAILED '+e.message);process.exitCode=1;});
