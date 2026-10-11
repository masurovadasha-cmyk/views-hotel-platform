'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../apps/mobile/package.json'));
const rn=createRequire(mobile.resolve('react-native/package.json'));
assert.equal(process.platform,'linux','Hermes profile proof currently requires Linux');
const hermes=path.join(path.dirname(rn.resolve('hermes-compiler/package.json')),'hermesc/linux64-bin/hermesc');
function hash(root,title){
 assert.ok(root,'Provide guest and staff export directories');
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'metadata.json'),'utf8'));
 assert.equal(metadata.bundler,'metro');
 const file=path.resolve(root,metadata.fileMetadata.android.bundle);
 assert.ok(file.startsWith(path.resolve(root)+path.sep));
 const bytes=fs.readFileSync(file);assert.ok(bytes.length>1024);
 const dump=execFileSync(hermes,['-dump-bytecode',file],{encoding:'utf8',maxBuffer:32*1024*1024});
 const app=dump.match(/Function<App>\([\s\S]*?(?=\n(?:NC)?Function<|$)/)?.[0];
 assert.ok(app,'App bytecode missing');
 assert.match(app,new RegExp('LoadConstString[^\\n]*'+title),'Wrong mode in App bytecode');
 return createHash('sha256').update(bytes).digest('hex');
}
assert.notEqual(hash(process.argv[2],'Guest app'),hash(process.argv[3],'Staff app'),'Guest/staff bundles must not reuse stale mode');
console.log('PASS: Android bytecode contains correct guest/staff modes; distinct bundles');
