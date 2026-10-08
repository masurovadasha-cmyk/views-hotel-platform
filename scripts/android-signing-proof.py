#!/usr/bin/env python3
"""Exercise signing guards in a disposable repository with a disposable key."""
import hashlib,json,os,pathlib,secrets,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(args,**kwargs):
    return subprocess.run([str(v) for v in args],check=True,capture_output=True,**kwargs)
with tempfile.TemporaryDirectory(prefix='views-sign-proof-') as name:
    temp=pathlib.Path(name);repo=temp/'repo';(repo/'scripts').mkdir(parents=True)
    script=repo/'scripts/sign-android-review.py';shutil.copyfile(ROOT/'scripts/sign-android-review.py',script)
    shutil.copyfile(ROOT/'release.config.json',repo/'release.config.json')
    (repo/'.gitignore').write_text('review-output/\n');(repo/'README').write_text('synthetic signing fixture\n')
    run(['git','init','-q',repo]);run(['git','-C',repo,'add','.'])
    run(['git','-C',repo,'-c','user.name=VIEWS Test','-c','user.email=synthetic@views.invalid','commit','-qm','fixture'])
    source=run(['git','-C',repo,'rev-parse','HEAD']).stdout.decode().strip()
    output=repo/'review-output';output.mkdir()
    original=(ROOT/'review-output/VIEWS-Review-unsigned.apk').read_bytes();unsigned=output/'VIEWS-Review-unsigned.apk';unsigned.write_bytes(original)
    evidence={'compiledManifestVerified':True,'assetsMatchWebBuild':True,'applicationId':'uz.views.preview','sourceCommit':source,'sourceDirty':False,'mode':'static-demo','productionBackendConnected':False,'productionPaymentsConnected':False,'apkSha256':hashlib.sha256(original).hexdigest()}
    report=output/'build-evidence.json';report.write_text(json.dumps(evidence))
    password=secrets.token_hex(24);pw=temp/'password';pw.write_text(password+'\n');pw.chmod(0o600)
    key=temp/'test.keystore';cert=temp/'certificate.der'
    run(['keytool','-genkeypair','-keystore',key,'-storepass:file',pw,'-keypass:file',pw,'-alias','test','-keyalg','RSA','-keysize','2048','-validity','2','-dname','CN=VIEWS Disposable Signing Test'])
    key.chmod(0o600)
    run(['keytool','-exportcert','-keystore',key,'-storepass:file',pw,'-alias','test','-file',cert])
    pin=hashlib.sha256(cert.read_bytes()).hexdigest()
    env={**os.environ,'VIEWS_ANDROID_KEYSTORE':str(key),'VIEWS_ANDROID_KEY_ALIAS':'test','VIEWS_ANDROID_STORE_PASSWORD_FILE':str(pw),'VIEWS_ANDROID_KEY_PASSWORD_FILE':str(pw),'VIEWS_ANDROID_CERT_SHA256':pin}
    checks=[]
    def attempt(label,code=None,values=None):
        result=subprocess.run(['python3',str(script),'--ack=REVIEW_APK_SIGNING'],capture_output=True,text=True,env=values or env)
        assert password not in result.stdout+result.stderr
        if code:
            assert result.returncode!=0 and code in result.stderr,(label,result.stderr)
        else:
            assert result.returncode==0,(label,result.stderr)
            assert json.loads(result.stdout)['certificateSha256']==pin
        checks.append(label)
    attempt('missing_configuration','MISSING_SIGNING_CONFIGURATION',{k:v for k,v in env.items() if not k.startswith('VIEWS_ANDROID_')})
    attempt('wrong_certificate','SIGNER_CERTIFICATE_PIN_MISMATCH',{**env,'VIEWS_ANDROID_CERT_SHA256':'0'*64})
    assert not (output/'VIEWS-Review-candidate.apk').exists()
    (repo/'README').write_text('modified')
    attempt('dirty_source','CLEAN_MATCHING_SOURCE_BUILD_REQUIRED');(repo/'README').write_text('synthetic signing fixture\n')
    unsigned.write_bytes(original+b'changed');attempt('changed_input','UNSIGNED_APK_CHECKSUM_MISMATCH');unsigned.write_bytes(original)
    report.write_text(json.dumps({**evidence,'sourceCommit':'0'*40}));attempt('stale_source','CLEAN_MATCHING_SOURCE_BUILD_REQUIRED');report.write_text(json.dumps(evidence))
    pw.chmod(0o644);attempt('password_file_permissions','SIGNING_SECRET_FILE_MUST_BE_PRIVATE');pw.chmod(0o600)
    report.write_text(json.dumps({**evidence,'productionBackendConnected':True}));attempt('non_review_build','REVIEW_ONLY_BUILD_REQUIRED');report.write_text(json.dumps(evidence))
    report.write_text(json.dumps({**evidence,'compiledManifestVerified':False}));attempt('unverified_package','VERIFIED_REVIEW_PACKAGE_REQUIRED');report.write_text(json.dumps(evidence))
    attempt('matching_key_signature')
    candidate=output/'VIEWS-Review-candidate.apk';saved=candidate.read_bytes()
    attempt('no_candidate_overwrite','CANDIDATE_ALREADY_EXISTS_ARCHIVE_IT_BEFORE_SIGNING');assert candidate.read_bytes()==saved
    print(json.dumps({'result':'pass','checks':checks,'count':len(checks),'disposableKeyOnly':True,'productionSigning':False,'secretsPrinted':False}))
