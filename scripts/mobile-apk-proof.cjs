// Offline artifact checks; does not claim installation or device acceptance.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const sdk=process.env.ANDROID_HOME;
assert.ok(sdk,'Set ANDROID_HOME');
const tools=path.join(sdk,'build-tools/36.0.0');
const mobile=createRequire(path.resolve(__dirname,'../apps/mobile/package.json'));
const rn=createRequire(mobile.resolve('react-native/package.json'));
const hermes=path.join(path.dirname(rn.resolve('hermes-compiler/package.json')),'hermesc/linux64-bin/hermesc');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'views-apk-proof-'));
const run=(file,args)=>execFileSync(file,args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
const results=[];
try {
 for(const [index,mode] of ['guest','staff'].entries()) {
  const input=process.argv[index+2];assert.ok(input,`Missing ${mode} APK`);
  const apk=path.resolve(input);
  const signature=run(path.join(tools,'apksigner'),['verify','--print-certs',apk]);
  const certificate=signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1];
  assert.ok(certificate,'Signing certificate not found');
  const manifest=run(path.join(tools,'aapt2'),['dump','badging',apk]);
  assert.ok(manifest.includes(`package: name='uz.views.preview.${mode}'`),'Wrong application ID');
  assert.match(manifest,/native-code: 'arm64-v8a'\s*$/m);
  assert.doesNotMatch(manifest,/application-debuggable/);
  const bundle=execFileSync('unzip',['-p',apk,'assets/index.android.bundle'],{maxBuffer:16*1024*1024});
  assert.ok(bundle.length>1024);
  // Hermes requires .hbc to read bytecode rather than parse it as JavaScript.
  const file=path.join(root,`${mode}.hbc`);fs.writeFileSync(file,bundle);
  const dump=run(hermes,['-dump-bytecode',file]);
  const app=dump.match(/Function<App>\([\s\S]*?(?=\n(?:NC)?Function<|$)/)?.[0];
  assert.ok(app,'App bytecode missing');
  assert.match(app,new RegExp(`LoadConstString[^\\n]*${mode==='guest'?'Guest':'Staff'} app`));
  results.push({mode,apk,bytes:fs.statSync(apk).size,sha256:createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),certificateSha256:certificate,embeddedProfileVerified:true});
 }
 console.log(JSON.stringify({artifacts:results,signing:'Preview/test signing only',deviceAcceptance:'NOT_RUN'},null,2));
} finally {fs.rmSync(root,{recursive:true,force:true});}
