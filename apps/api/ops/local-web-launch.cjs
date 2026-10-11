'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'VIEWS-Staging');
const node=path.join(root,'tools','node-v22.23.3-win-x64','node.exe'),entry=path.join(__dirname,'serve-local-review.cjs'),record=path.join(root,'web-process.json');
(async()=>{
 if(process.platform!=='win32')throw Error('WINDOWS_ONLY');
 const mode=process.argv[2]||'start';if(!['start','stop'].includes(mode))throw Error('INVALID_ARGUMENT');
 if(fs.existsSync(record)){
  const r=JSON.parse(fs.readFileSync(record));if(!Number.isSafeInteger(r.pid)||r.entry!==entry)throw Error('WEB_PROCESS_RECORD_INVALID');
  const script=`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${r.pid}";if($p){if($p.ExecutablePath -ne '${node.replace(/'/g,"''")}' -or -not $p.CommandLine.Contains('${entry.replace(/'/g,"''")}')){exit 2};${mode==='stop'?`Stop-Process -Id ${r.pid};`:''}Write-Output 'owned'}`;
  const checked=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true});
  if(checked.status!==0)throw Error('WEB_PROCESS_IDENTITY_MISMATCH');
  if(mode==='start'&&checked.stdout.includes('owned')){console.log('VIEWS review already running');return;}
  fs.rmSync(record);
 }
 if(mode==='stop'){console.log('Local review stopped');return;}
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('PORT_4173_BUSY')));s.listen(4173,'127.0.0.1',()=>s.close(resolve));});
 const log=fs.openSync(path.join(root,'logs','review.log'),'a');
 const child=spawn(node,[entry],{cwd:path.resolve(__dirname,'../../..'),stdio:['ignore',log,log],detached:true,windowsHide:true});child.unref();fs.closeSync(log);
 fs.writeFileSync(record,JSON.stringify({pid:child.pid,entry,startedAt:new Date().toISOString()}));
 for(let i=0;i<20;i++){try{const r=await fetch('http://127.0.0.1:4173/?api=local-core');if(r.ok){console.log('WEB_READY=http://127.0.0.1:4173/?api=local-core');return;}}catch{}await new Promise(r=>setTimeout(r,200));}
 throw Error('WEB_START_FAILED');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
