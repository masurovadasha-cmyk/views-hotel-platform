'use strict';
// Run against a selected source checkout; transpiles only the pure projection module.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const source=path.resolve(process.argv[2]||'.'),file=path.join(source,'src/features/partner-assignments/model.ts'),out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};new Function('exports','require','module',out)(m.exports,require,m);const model=m.exports;
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',record={assignmentId:id,kind:'concierge',status:'offered',revision:1,termsVersion:1,requestedFor:'2026-10-26T12:00:00Z',expiresAt:'2026-10-26T13:00:00Z',synthetic:true},failures=[];
function rejects(name,fn){try{assert.throws(fn);console.log('PASS '+name);}catch{failures.push(name);console.log('FAIL '+name);}}
rejects('assignment revision zero',()=>model.assignment({...record,revision:0}));
rejects('dispatch revision zero',()=>model.dispatchOrder({orderId:id,kind:'concierge',revision:0,requestedFor:record.requestedFor,grantsTruncated:false,grants:[]}));
rejects('decision command revision zero',()=>model.command({kind:'decision',key:id,scope:'synthetic',assignmentId:other,body:{action:'accept',expectedRevision:0,termsVersion:1}}));
const absent={outcome:'not_applied',commandKey:id,assignmentId:null,synthetic:true,idempotentReplay:true};
rejects('absence receipt for another command',()=>model.receipt({...absent,commandKey:other},id));
rejects('absence receipt with assignment payload',()=>model.receipt({...absent,assignmentId:other},id));
rejects('applied receipt for another command',()=>model.receipt({...record,outcome:'applied',commandKey:other,idempotentReplay:true},id));
rejects('missing outcome receipt',()=>model.receipt({...record,commandKey:id,idempotentReplay:true},id));
assert.equal(model.receipt(absent,id).outcome,'not_applied');
assert.equal(model.receipt({...record,outcome:'applied',commandKey:id,idempotentReplay:true},id).assignmentId,id);
// journal revision zero is valid only for an empty journal; do not ban that counter.
assert.deepEqual(model.decideJournal(undefined,'synthetic',{kind:'read'}),{format:1,revision:0,command:null});
console.log(JSON.stringify({source,failures,realNetwork:false,realCredentials:false}));if(failures.length)process.exitCode=1;
