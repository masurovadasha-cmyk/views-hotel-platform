'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {REQUIRED_CHECKS,validateReport,validateTap,validateDirectory}=require('./staff-ci-evidence.cjs');
const sha='a'.repeat(40),now=Date.parse('2026-10-07T12:00:00Z');
function report(){return {schemaVersion:1,stage:'7.30',result:'pass',sourceCommit:sha,sourceDirty:false,
 passkeyVirtualAuthenticator:true,actualSMTPTransportExercised:true,SMTPReceiptPositiveBranchSimulated:true,
 queueReplaysPrevented:true,mailerRuntimeSeparated:true,uncertainDeliveryNotRetried:true,externalEmailsSent:0,
 externalMailboxOwnershipProven:false,productionEnabled:false,privilegedMfaEnabled:false,hostDeploymentConfirmed:false,
 checks:[...REQUIRED_CHECKS],checkCount:REQUIRED_CHECKS.length,httpCalls:150,smtpMessagesCaptured:20,
 restore:{tables:75,privateTables:8,recoveryCodeRows:8,separateKeyring:true},
 checkedAt:new Date(now).toISOString(),limitations:['Synthetic validator fixture, not integration evidence']};}
const tap='TAP version 13\n1..2\nok 1 - test one\nok 2 - test two\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('complete source-bound synthetic report validates',()=>{
 assert.equal(validateReport(report(),sha,now).checkCount,47);
 assert.deepEqual(validateTap(tap),{tests:2,passed:2});
});
for(const name of REQUIRED_CHECKS)test('required scenario cannot be omitted: '+name,()=>{
 const r=report();r.checks=r.checks.filter(x=>x!==name);r.checkCount=r.checks.length;
 assert.throws(()=>validateReport(r,sha,now));
});
for(const [name,change] of [
 ['failed run',r=>r.result='fail'],['wrong schema',r=>r.schemaVersion=2],['older stage',r=>r.stage='7.26'],
 ['wrong commit',r=>r.sourceCommit='b'.repeat(40)],['dirty source',r=>r.sourceDirty=true],['absent dirty flag',r=>delete r.sourceDirty],
 ['skipped passkey',r=>r.passkeyVirtualAuthenticator=false],['no SMTP proof',r=>r.actualSMTPTransportExercised=false],
 ['duplicate checks',r=>{r.checks.push(r.checks[0]);r.checkCount++;}],['inflated count',r=>r.checkCount++],
 ['missing restore',r=>delete r.restore],['empty recovery backup',r=>r.restore.recoveryCodeRows=0],
 ['no private tables',r=>r.restore.privateTables=0],['key stored with database',r=>r.restore.separateKeyring=false],
 ['no actual HTTP',r=>r.httpCalls=0],['no captured SMTP',r=>r.smtpMessagesCaptured=0],
 ['real mail sent',r=>r.externalEmailsSent=1],['production enabled',r=>r.productionEnabled=true],
 ['privileged access enabled',r=>r.privilegedMfaEnabled=true],['external ownership claimed',r=>r.externalMailboxOwnershipProven=true],
 ['error alongside pass',r=>r.failure={code:'failure'}],['stale report',r=>r.checkedAt='2025-01-01T00:00:00Z'],
 ['future timestamp',r=>r.checkedAt='2099-01-01T00:00:00Z'],['missing limitations',r=>delete r.limitations]
])test('rejects '+name,()=>{const r=report();change(r);assert.throws(()=>validateReport(r,sha,now));});
test('malformed reports and SHA fail closed',()=>{
 for(const r of [null,[],{},'pass'])assert.throws(()=>validateReport(r,sha,now));
 assert.throws(()=>validateReport(report(),'not-a-sha',now));
});
for(const [name,text] of [
 ['empty',''],['raw log','tests successful'],['missing summary','TAP version 13\n'],
 ['failed test',tap.replace('# fail 0','# fail 1')],['skipped test',tap.replace('# skipped 0','# skipped 1')],
 ['cancelled',tap.replace('# cancelled 0','# cancelled 1')],['todo',tap.replace('# todo 0','# todo 1')],
 ['no tests',tap.replace('# tests 2','# tests 0').replace('# pass 2','# pass 0')],
 ['duplicate summary',tap+'# fail 0\n'],['failure contradicting totals',tap+'not ok 3 - failure\n']
])test('rejects TAP '+name,()=>assert.throws(()=>validateTap(text)));
test('a tiny archive or only source cannot stand in for real test reports',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'views-evidence-'));
 try{
  fs.writeFileSync(path.join(dir,'views-stage726-source.zip'),Buffer.alloc(174));
  assert.throws(()=>validateDirectory(dir,sha,now));
  fs.writeFileSync(path.join(dir,'unit.tap'),tap);fs.writeFileSync(path.join(dir,'gate.tap'),tap);
  fs.writeFileSync(path.join(dir,'integration.json'),'');assert.throws(()=>validateDirectory(dir,sha,now));
  fs.writeFileSync(path.join(dir,'integration.json'),'{');assert.throws(()=>validateDirectory(dir,sha,now));
  fs.writeFileSync(path.join(dir,'integration.json'),JSON.stringify(report()));assert.equal(validateDirectory(dir,sha,now).result,'pass');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('workflow rejects quote regression and separates diagnostics from proof',()=>{
 const y=fs.readFileSync(path.join(__dirname,'../.github/workflows/stage7-staff-email.yml'),'utf8');
 assert.match(y,/--health-cmd pg_isready\s/);
 assert.match(y,/PGUSER: views_owner/);assert.match(y,/PGDATABASE: views_local/);
 assert.doesNotMatch(y,/--health-cmd ['"]/);
 assert.match(y,/id: checkout/);assert.match(y,/id: integration/);assert.match(y,/id: verify_evidence/);
 assert.match(y,/node scripts\/staff-ci-evidence\.cjs mail-evidence/);
 assert.match(y,/steps\.verify_evidence\.outcome == 'success'/);
 assert.match(y,/steps\.archive\.outcome == 'success'/);
 assert.match(y,/name: staff-email-delivery-diagnostics/);
 assert.match(y,/failure\(\) && steps\.checkout\.outcome == 'success'/);
 assert.doesNotMatch(y,/^[ \t]+mail-evidence\/[ \t]*$/m);
});
