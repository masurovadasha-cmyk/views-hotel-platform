import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
const build=path.resolve('.egress-test-build');
const evidence=path.resolve('.egress-test-evidence');
rmSync(build,{recursive:true,force:true});
mkdirSync(build,{recursive:true});mkdirSync(evidence,{recursive:true});
writeFileSync(path.join(build,'package.json'),'{"type":"commonjs"}\n');
const compiler=path.resolve('apps/api/node_modules/typescript/bin/tsc');
if(!existsSync(compiler))throw new Error('Install apps/api development dependencies before acceptance');
const sources=['provider-policy','provider-egress-client','https-relay-transport'].map(name=>'apps/api/src/security/egress/'+name+'.ts');
const compiled=spawnSync(process.execPath,[compiler,'--target','ES2022','--module','commonjs','--moduleResolution','node',
  '--esModuleInterop','--strict','--skipLibCheck','--types','node','--typeRoots','apps/api/node_modules/@types',
  '--outDir',build,...sources],{stdio:'inherit'});
if(compiled.status!==0)process.exit(compiled.status||1);
const result=spawnSync(process.execPath,['--test','scripts/provider-egress-client.acceptance.mjs',
  'scripts/relay-destination-policy.acceptance.mjs'],{encoding:'utf8',env:{...process.env,VIEWS_EGRESS_TEST_BUILD:build},timeout:60000});
const text=(result.stdout||'')+(result.stderr||'');
process.stdout.write(text);writeFileSync(path.join(evidence,'acceptance.tap'),text);
const tests=Number(text.match(/^# tests (\d+)$/m)?.[1]||0);
const failures=Number(text.match(/^# fail (\d+)$/m)?.[1]||0);
const passed=result.status===0&&tests>=71&&failures===0;
writeFileSync(path.join(evidence,'client-evidence.json'),JSON.stringify({schemaVersion:1,stage:'7.18',passed,tests,failures,
  sourceCommit:process.env.GITHUB_SHA||null,checkedAt:new Date().toISOString(),
  transport:'real loopback CONNECT + verified TLS fixture',realProviderConnected:false,
  automaticRetries:false,productionActivated:false,
  limitations:['Local TLS integration is not a live payment-provider test','Durable audit sink must be wired before provider activation']},null,2)+'\n');
process.exitCode=passed?0:1;
