'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
function gate(advisory,date='2026-10-25T00:00:00Z'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'views-audit-policy-'));
 try{
  const fake=path.join(dir,'pnpm');fs.writeFileSync(fake,'#!/usr/bin/env node\nprocess.stdout.write(process.env.VIEWS_AUDIT_FIXTURE);process.exit(1);\n',{mode:0o700});
  const preload=path.join(dir,'clock.cjs');fs.writeFileSync(preload,`Date.now=()=>${JSON.stringify(Date.parse(date))};`);
  return spawnSync(process.execPath,['--require',preload,path.resolve('scripts/pnpm-audit-gate.cjs')],{encoding:'utf8',env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,VIEWS_AUDIT_FIXTURE:JSON.stringify({advisories:{fixture:advisory}})}});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const forge={github_advisory_id:'GHSA-86w9-cpqp-85rv',module_name:'node-forge',patched_versions:'<0.0.0',findings:[{paths:['apps__mobile>expo>@expo/cli>node-forge']}]};
test('unpatched Forge exception is bounded by reviewed path and original expiry',()=>{
 assert.equal(gate(forge).status,0);
 for(const input of [{...forge,patched_versions:'>=1.4.1'},{...forge,findings:[{paths:['apps__api>node-forge']}]},{...forge,findings:[]}])assert.equal(gate(input).status,1);
 assert.equal(gate(forge,'2026-11-15T00:00:00Z').status,1);
});
test('withdrawn braces advisory is not silently allowlisted if it returns',()=>{
 const result=gate({github_advisory_id:'GHSA-vfj7-8cjw-p6xm',module_name:'braces',patched_versions:'<0.0.0',findings:[{paths:['apps__mobile>expo>@expo/metro>braces']}]});
 assert.equal(result.status,1);assert.match(result.stderr,/not allowlisted/);
});
