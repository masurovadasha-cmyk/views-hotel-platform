import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const dir='diagnostic-evidence';mkdirSync(dir,{recursive:true});
const config=readFileSync('wrangler.toml','utf8');
const configIsWorker=/^main\s*=\s*"workers\/review.ts"/m.test(config)&&/^\[assets\]/m.test(config);
if(!configIsWorker||/^pages_build_output_dir\s*=/m.test(config))throw Error('WORKER_CONFIG_INVALID');
if(!/^pages_build_output_dir\s*=/m.test(readFileSync('wrangler.pages.toml','utf8')))throw Error('PAGES_CONFIG_INVALID');
const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
// No Cloudflare credentials are available to either local build command.
for(const key of Object.keys(env))if(/^(CLOUDFLARE_|CF_API_|CF_ACCOUNT|WRANGLER_API)/.test(key))delete env[key];
function command(args){
 const result=spawnSync('npx',['--yes','wrangler@4.148.0',...args],{env,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 return {status:result.status,output:(result.stdout||'')+(result.stderr||'')};
}
const worker=command(['deploy','--dry-run','--config','wrangler.toml']);
writeFileSync(path.join(dir,'workers-dry-run.log'),worker.output);
const pages=command(['pages','functions','build','functions','--outdir='+path.join(dir,'pages-build')]);
writeFileSync(path.join(dir,'pages-functions-build.log'),pages.output);
const report={schemaVersion:2,sourceCommit:process.env.GITHUB_SHA,wrangler:'4.148.0',configType:'worker-assets',
 workersDryRunExit:worker.status,pagesFunctionsBuildExit:pages.status,configCommandMismatchFixedLocally:worker.status===0,
 productionDeployed:false,cloudflareCredentialsUsed:false,remoteBuildLogsRead:false,remoteBuildFixed:false,
 conclusion:worker.status===0&&pages.status===0?'WORKER_AND_PAGES_BUILDS_VALID':'BUILD_FAILED',
 persistentPostgresCoreDeployed:false};
writeFileSync(path.join(dir,'cloudflare-build-diagnostic.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(worker.status!==0||pages.status!==0)process.exitCode=1;
