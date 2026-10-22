#!/usr/bin/env python3
"""Sign a verified debug candidate using the existing official Expo template key.

No key is generated. No release signing settings or identities are read/changed.
The bundled public-development identity is extracted only inside a temporary dir.
"""
import hashlib, json, os, pathlib, re, subprocess, tarfile, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(args):
    result=subprocess.run([str(v) for v in args],cwd=ROOT,capture_output=True,text=True)
    if result.returncode:raise SystemExit('DEBUG_TOOL_FAILED:'+pathlib.Path(str(args[0])).name)
    return result.stdout

def main():
    sdk=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk:raise SystemExit('ANDROID_SDK_REQUIRED')
    tools=pathlib.Path(sdk)/'build-tools/35.0.0'
    output=ROOT/'review-output';apk=output/'VIEWS-Debug-unsigned.apk'
    evidence=json.loads((output/'debug-build-evidence.json').read_text())
    source=run(['git','rev-parse','HEAD']).strip()
    if run(['git','status','--porcelain']).strip() or evidence['sourceDirty'] or evidence['sourceCommit']!=source:
        raise SystemExit('CLEAN_MATCHING_DEBUG_SOURCE_REQUIRED')
    if evidence.get('debuggable') is not True or evidence.get('mode')!='static-demo' or evidence.get('applicationId')!='uz.views.preview':
        raise SystemExit('DEBUG_PREVIEW_PACKAGE_REQUIRED')
    if not evidence.get('compiledManifestVerified') or not evidence.get('assetsMatchWebBuild') or evidence.get('productionBackendConnected') is not False or evidence.get('productionPaymentsConnected') is not False:
        raise SystemExit('VERIFIED_DEMO_ONLY_REQUIRED')
    if hashlib.sha256(apk.read_bytes()).hexdigest()!=evidence['apkSha256']:raise SystemExit('DEBUG_APK_HASH_MISMATCH')
    template=(ROOT/'apps/mobile/node_modules/expo/template.tgz').resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='views-existing-debug-') as folder:
        temp=pathlib.Path(folder);key=temp/'debug.keystore';cert=temp/'debug.der';signed=temp/'debug.apk'
        with tarfile.open(template,'r:gz') as archive:
            member=archive.getmember('package/android/app/debug.keystore')
            if not member.isfile() or member.size>100000:raise SystemExit('INVALID_TEMPLATE_DEBUG_KEY')
            key.write_bytes(archive.extractfile(member).read());key.chmod(0o600)
        # Public standard debug parameters already declared in Expo's template.
        run(['keytool','-exportcert','-keystore',key,'-storepass','android','-alias','androiddebugkey','-file',cert])
        pin=hashlib.sha256(cert.read_bytes()).hexdigest()
        run([tools/'apksigner','sign','--ks',key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',signed,apk])
        verified=run([tools/'apksigner','verify','--verbose','--print-certs',signed])
        pins=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)$',verified,re.M)
        if [p.lower() for p in pins]!=[pin]:raise SystemExit('DEBUG_CERTIFICATE_MISMATCH')
        run([tools/'zipalign','-c','4',signed])
        target=output/('VIEWS-'+evidence['versionName']+'-Debug.apk')
        if target.exists():raise SystemExit('DEBUG_CANDIDATE_ALREADY_EXISTS')
        target.write_bytes(signed.read_bytes())
        report={**evidence,'apkSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'apkSizeBytes':target.stat().st_size,
                'signatureVerified':True,'signature':'existing Expo template Android debug key',
                'certificateSha256':pin,'newKeyGenerated':False,'releaseIdentityChanged':False,
                'installationTested':False,'upgradeCompatibilityTested':False,'physicalDeviceTested':False}
        (output/'debug-signing-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))
if __name__=='__main__':main()
