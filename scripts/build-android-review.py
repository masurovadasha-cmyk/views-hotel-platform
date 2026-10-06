#!/usr/bin/env python3
"""Package the existing VIEWS dist output. No second frontend or live backend."""
import hashlib, json, os, pathlib, shutil, subprocess, tempfile, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
def run(*args):
    subprocess.run([str(arg) for arg in args],check=True)
sdk=pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
builds=sorted((sdk/'build-tools').iterdir(),key=lambda p:tuple(int(n) if n.isdigit() else 0 for n in p.name.split('.')))
tools=next((p for p in reversed(builds) if (p/'aapt2').exists() and (p/'d8').exists()),None)
assert tools,'Android build-tools required'
android=sdk/'platforms/android-35/android.jar'
assert android.exists(),'Android platform 35 required'
assert (ROOT/'dist/index.html').exists(),'Build the web app first'
source=ROOT/'apps/android-review'
output=ROOT/'review-output'
output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='views-android-') as directory:
    work=pathlib.Path(directory)
    (work/'classes').mkdir(); (work/'dex').mkdir(); (work/'assets/www').mkdir(parents=True)
    shutil.copytree(ROOT/'dist',work/'assets/www',dirs_exist_ok=True)
    manifest=(source/'AndroidManifest.xml').read_text()
    version=717000+int(os.environ.get('GITHUB_RUN_NUMBER','1'))
    manifest=manifest.replace('717001',str(version))
    (work/'AndroidManifest.xml').write_text(manifest)
    run(tools/'aapt2','compile','--dir',source/'res','-o',work/'resources.zip')
    run(tools/'aapt2','link','-o',work/'unsigned.apk','--manifest',work/'AndroidManifest.xml','-I',android,'-A',work/'assets','--min-sdk-version','26','--target-sdk-version','35',work/'resources.zip')
    javafiles=list((source/'src').rglob('*.java'))
    run('javac','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',android,'-d',work/'classes',*javafiles)
    run(tools/'d8','--lib',android,'--min-api','26','--output',work/'dex',*list((work/'classes').rglob('*.class')))
    with zipfile.ZipFile(work/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as archive:
        archive.write(work/'dex/classes.dex','classes.dex')
    run(tools/'zipalign','-f','4',work/'unsigned.apk',work/'aligned.apk')
    # Ephemeral review signature; never a production signing credential.
    key=work/'review.keystore'
    run('keytool','-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','views-review','-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=VIEWS Review, OU=Demo, O=VIEWS, C=UZ')
    apk=output/'VIEWS-Review.apk'
    run(tools/'apksigner','sign','--ks',key,'--ks-key-alias','views-review','--ks-pass','pass:android','--key-pass','pass:android','--out',apk,work/'aligned.apk')
    checked=subprocess.check_output([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
    (output/'apk-verification.txt').write_text(checked)
    badging=subprocess.check_output([str(tools/'aapt2'),'dump','badging',str(apk)],text=True)
    assert "package: name='uz.views.review'" in badging
    assert "sdkVersion:'26'" in badging
    assert "launchable-activity: name='uz.views.review.MainActivity'" in badging
    (output/'apk-manifest.txt').write_text(badging)
    with zipfile.ZipFile(apk) as archive:
        assert archive.read('assets/www/index.html')==(ROOT/'dist/index.html').read_bytes()
        assert 'classes.dex' in archive.namelist()
    sha=hashlib.sha256(apk.read_bytes()).hexdigest()
    (output/'SHA256SUMS.txt').write_text(f'{sha}  VIEWS-Review.apk\n')
    evidence={'applicationId':'uz.views.review','versionName':'0.7.17-review','versionCode':version,'minAndroid':'8.0','minSdk':26,'targetSdk':35,'sourceCommit':os.environ.get('GITHUB_SHA'),'apkSha256':sha,'apkSizeBytes':apk.stat().st_size,'signatureVerified':True,'assetsMatchWebBuild':True,'physicalDeviceTested':False,'mode':'static-demo','productionBackendConnected':False,'productionPaymentsConnected':False,'signature':'ephemeral review-only key; not a production release key'}
    (output/'build-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
