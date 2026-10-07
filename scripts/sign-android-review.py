#!/usr/bin/env python3
"""Sign an already verified review build with an explicitly pinned existing key."""
import argparse, hashlib, json, os, pathlib, re, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]

def fail(code):
    raise SystemExit(code)

def command(args):
    result=subprocess.run([str(arg) for arg in args],cwd=ROOT,capture_output=True,text=True)
    if result.returncode:
        # Native signing failures may contain operator paths or key metadata.
        fail('ANDROID_SIGNING_TOOL_FAILED:'+pathlib.Path(str(args[0])).name+':'+str(result.returncode))
    return result.stdout

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ack',required=True,choices=['REVIEW_APK_SIGNING'])
    args=parser.parse_args()
    names=['VIEWS_ANDROID_KEYSTORE','VIEWS_ANDROID_KEY_ALIAS','VIEWS_ANDROID_STORE_PASSWORD_FILE',
           'VIEWS_ANDROID_KEY_PASSWORD_FILE','VIEWS_ANDROID_CERT_SHA256']
    missing=[name for name in names if not os.environ.get(name)]
    if missing:fail('MISSING_SIGNING_CONFIGURATION: '+', '.join(missing))
    pin=os.environ['VIEWS_ANDROID_CERT_SHA256'].lower().replace(':','')
    if not re.fullmatch('[0-9a-f]{64}',pin):fail('INVALID_CERTIFICATE_PIN')
    for name in [names[0],names[2],names[3]]:
        p=pathlib.Path(os.environ[name]).resolve()
        if p.is_relative_to(ROOT) or not p.is_file():fail('SIGNING_SECRET_MUST_BE_AN_EXISTING_FILE_OUTSIDE_REPOSITORY')
        if os.name=='posix' and p.stat().st_mode & 0o077:fail('SIGNING_SECRET_FILE_MUST_BE_PRIVATE')
    sdk=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk:fail('ANDROID_SDK_REQUIRED')
    tools=pathlib.Path(sdk)/'build-tools/35.0.0'
    output=ROOT/'review-output';unsigned=output/'VIEWS-Review-unsigned.apk'
    evidence=json.loads((output/'build-evidence.json').read_text())
    source=command(['git','rev-parse','HEAD']).strip()
    if command(['git','status','--porcelain']).strip() or evidence['sourceDirty'] or evidence['sourceCommit']!=source:
        fail('CLEAN_MATCHING_SOURCE_BUILD_REQUIRED')
    if evidence.get('compiledManifestVerified') is not True or evidence.get('assetsMatchWebBuild') is not True or evidence.get('applicationId')!='uz.views.review':
        fail('VERIFIED_REVIEW_PACKAGE_REQUIRED')
    if evidence.get('mode')!='static-demo' or evidence.get('productionBackendConnected') is not False or evidence.get('productionPaymentsConnected') is not False:
        fail('REVIEW_ONLY_BUILD_REQUIRED')
    if hashlib.sha256(unsigned.read_bytes()).hexdigest()!=evidence['apkSha256']:
        fail('UNSIGNED_APK_CHECKSUM_MISMATCH')
    command([tools/'zipalign','-c','4',unsigned])
    with tempfile.TemporaryDirectory(prefix='views-sign-',dir=output) as directory:
        signed=pathlib.Path(directory)/'candidate.apk'
        # apksigner consumes sequential lines if the same password file is reused.
        # Separate private copies also support an operator using one shared file.
        with tempfile.TemporaryDirectory(prefix='views-key-pass-') as passwords:
            store_password=pathlib.Path(passwords)/'store'
            key_password=pathlib.Path(passwords)/'key'
            for destination,name in [(store_password,names[2]),(key_password,names[3])]:
                destination.write_bytes(pathlib.Path(os.environ[name]).read_bytes())
                destination.chmod(0o600)
            command([tools/'apksigner','sign','--ks',os.environ[names[0]],'--ks-key-alias',os.environ[names[1]],
                     '--ks-pass','file:'+str(store_password),'--key-pass','file:'+str(key_password),
                     '--out',signed,unsigned])
        verified=command([tools/'apksigner','verify','--verbose','--print-certs',signed])
        pins=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)$',verified,re.M)
        if [p.lower() for p in pins]!=[pin]:fail('SIGNER_CERTIFICATE_PIN_MISMATCH')
        command([tools/'zipalign','-c','4',signed])
        candidate=output/'VIEWS-Review-candidate.apk'
        if candidate.exists():fail('CANDIDATE_ALREADY_EXISTS_ARCHIVE_IT_BEFORE_SIGNING')
        # The final file only appears after every validation passes.
        os.link(signed,candidate)
        result={'result':'pass','sourceCommit':source,'apkSha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),
                'certificateSha256':pin,'signatureVerified':True,'productionEnabled':False,
                'physicalDeviceTested':False,'upgradeCompatibilityTested':False}
        (output/'signing-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result))

if __name__=='__main__':
    try:main()
    except (OSError,KeyError,ValueError):fail('SIGNING_INPUT_OR_TOOL_ERROR')
