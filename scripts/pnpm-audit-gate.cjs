const {spawnSync}=require("node:child_process");

const exceptions={
  "GHSA-86w9-cpqp-85rv":{
    package:"node-forge",
    expiresAt:"2026-11-15T00:00:00Z",
    reason:"Unpatched upstream advisory reachable only through Expo CLI build tooling.",
    path:(p)=>p.startsWith("apps__mobile>expo>")&&p.includes("@expo/cli")&&p.endsWith(">node-forge")
  },
  "GHSA-vfj7-8cjw-p6xm":{
    package:"braces",
    expiresAt:"2026-11-15T00:00:00Z",
    reason:"Unpatched upstream advisory reachable only through Expo Metro build tooling.",
    path:(p)=>p.startsWith("apps__mobile>expo>")&&p.includes("@expo/metro")&&p.endsWith(">braces")
  }
};

function ghsa(advisory,key){
  for(const value of [advisory.github_advisory_id,advisory.githubAdvisoryId,advisory.id,key,advisory.url]){
    const match=String(value||"").match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i);
    if(match)return match[0].toUpperCase();
  }
  return null;
}
function paths(advisory){
  const found=[];
  for(const finding of advisory.findings||[]){
    for(const p of finding.paths||[])found.push(String(p));
  }
  if(Array.isArray(advisory.paths))for(const p of advisory.paths)found.push(String(p));
  return [...new Set(found)];
}
function hasPublishedFix(advisory){
  const patched=advisory.patched_versions??advisory.patchedVersions;
  if(patched===null||patched===undefined||patched==="")return false;
  const value=String(patched).trim();
  return value!=="<0.0.0"&&value!=="<0.0.0-0"&&value.toLowerCase()!=="none";
}

const run=spawnSync("pnpm",["audit","--prod","--audit-level=high","--json"],{
  encoding:"utf8",
  env:{...process.env,NO_COLOR:"1"}
});
if(run.error)throw run.error;
if(!run.stdout.trim()){
  console.error(run.stderr||"pnpm audit produced no JSON output");
  process.exit(2);
}
let report;
try{report=JSON.parse(run.stdout)}
catch(error){
  console.error("Unable to parse pnpm audit JSON.");
  console.error(run.stdout.slice(0,4000));
  process.exit(2);
}

const raw=report.advisories||{};
const advisories=Array.isArray(raw)?raw:Object.entries(raw).map(([key,value])=>({...value,__key:key}));
if(advisories.length===0){
  if(run.status!==0){
    console.error(run.stderr||"pnpm audit failed without advisories");
    process.exit(run.status||2);
  }
  console.log("Security audit passed: no high/critical production advisories.");
  process.exit(0);
}

const now=Date.now();
const accepted=[];
const blocked=[];
for(const advisory of advisories){
  const id=ghsa(advisory,advisory.__key);
  const exception=id&&exceptions[id];
  const advisoryPaths=paths(advisory);
  if(!exception){
    blocked.push({id:id||advisory.__key||"unknown",package:advisory.module_name||advisory.name||"unknown",reason:"not allowlisted",paths:advisoryPaths});
    continue;
  }
  if(now>=Date.parse(exception.expiresAt)){
    blocked.push({id,package:exception.package,reason:"security exception expired",paths:advisoryPaths});
    continue;
  }
  if(hasPublishedFix(advisory)){
    blocked.push({id,package:exception.package,reason:"a patched version is now published; upgrade instead of ignoring",patched:advisory.patched_versions??advisory.patchedVersions,paths:advisoryPaths});
    continue;
  }
  if(advisoryPaths.length===0||advisoryPaths.some(p=>!exception.path(p))){
    blocked.push({id,package:exception.package,reason:"dependency path moved outside the reviewed Expo build-tool path",paths:advisoryPaths});
    continue;
  }
  accepted.push({id,package:exception.package,expiresAt:exception.expiresAt,paths:advisoryPaths});
}

if(blocked.length){
  console.error("Security audit blocked.");
  console.error(JSON.stringify({blocked,accepted},null,2));
  process.exit(1);
}
console.log("Security audit passed with time-boxed upstream exceptions.");
console.log(JSON.stringify({accepted},null,2));
