#!/usr/bin/env python3
"""Package the existing VIEWS dist output. No second frontend or live backend."""
import hashlib, json, os, pathlib, shutil, subprocess, tempfile, zipfile
import xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
def run(*args):
    subprocess.run([str(arg) for arg in args],check=True)
sdk_path=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
if not sdk_path:
    raise SystemExit('ANDROID_HOME or ANDROID_SDK_ROOT required: platform 35, build-tools 35.0.0 and cmdline-tools. JDK javac/key tools must be installed separately.')
sdk=pathlib.Path(sdk_path)
tools=sdk/'build-tools/35.0.0'
assert (tools/'aapt2').exists() and (tools/'d8').exists(),'Android build-tools 35.0.0 required'
android=sdk/'platforms/android-35/android.jar'
assert android.exists(),'Android platform 35 required'
assert (ROOT/'dist/index.html').exists(),'Build the web app first'
source=ROOT/'apps/android-review'
output=ROOT/'review-output'
output.mkdir(exist_ok=True)
if not shutil.which('javac'):
    raise SystemExit('JDK javac is required; a Java runtime alone cannot compile the shell')
with tempfile.TemporaryDirectory(prefix='views-android-') as directory:
    work=pathlib.Path(directory)
    (work/'classes').mkdir(); (work/'dex').mkdir(); (work/'assets/www').mkdir(parents=True)
    shutil.copytree(ROOT/'dist',work/'assets/www',dirs_exist_ok=True)
    manifest=(source/'AndroidManifest.xml').read_text()
    version=738001
    manifest=manifest.replace('717001',str(version))
    (work/'AndroidManifest.xml').write_text(manifest)
    run(tools/'aapt2','compile','--dir',source/'res','-o',work/'resources.zip')
    run(tools/'aapt2','link','-o',work/'unsigned.apk','--manifest',work/'AndroidManifest.xml','-I',android,'-A',work/'assets','--min-sdk-version','26','--target-sdk-version','35',work/'resources.zip')
    javafiles=list((source/'src').rglob('*.java'))
    run('javac','-encoding','UTF-8','--release','8','-classpath',android,'-d',work/'classes',*javafiles)
    run(tools/'d8','--lib',android,'--min-api','26','--output',work/'dex',*list((work/'classes').rglob('*.class')))
    with zipfile.ZipFile(work/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as archive:
        archive.write(work/'dex/classes.dex','classes.dex')
    run(tools/'zipalign','-f','4',work/'unsigned.apk',work/'aligned.apk')
    # Signing is a separate owner-approved release step; never rotate identity here.
    apk=output/'VIEWS-Review-unsigned.apk'
    shutil.copyfile(work/'aligned.apk',apk)
    badging=subprocess.check_output([str(tools/'aapt2'),'dump','badging',str(apk)],text=True)
    (output/'apk-manifest.txt').write_text(badging)
    print(badging)
    analyzer=next((sdk/'cmdline-tools').glob('*/bin/apkanalyzer'))
    compiled_xml=subprocess.check_output([str(analyzer),'manifest','print',str(apk)],text=True)
    (output/'apk-manifest.xml').write_text(compiled_xml)
    root=ET.fromstring(compiled_xml)
    A='{http://schemas.android.com/apk/res/android}'
    assert root.get('package')=='uz.views.review'
    assert root.get(A+'versionName')=='0.7.38-review'
    assert root.get(A+'versionCode')==str(version)
    assert root.find('uses-sdk').get(A+'minSdkVersion')=='26',compiled_xml
    assert root.find('uses-sdk').get(A+'targetSdkVersion')=='35',compiled_xml
    assert root.find('application/activity').get(A+'name') in ['.MainActivity','uz.views.review.MainActivity']
    assert [p.get(A+'name') for p in root.findall('uses-permission')]==['android.permission.INTERNET']
    with zipfile.ZipFile(apk) as archive:
        assert archive.read('assets/www/index.html')==(ROOT/'dist/index.html').read_bytes()
        assert 'classes.dex' in archive.namelist()
    sha=hashlib.sha256(apk.read_bytes()).hexdigest()
    (output/'SHA256SUMS.txt').write_text(f'{sha}  VIEWS-Review-unsigned.apk\n')
    evidence={'applicationId':'uz.views.review','versionName':'0.7.38-review','versionCode':version,'minAndroid':'8.0','minSdk':26,'targetSdk':35,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceDirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'apkSha256':sha,'apkSizeBytes':apk.stat().st_size,'signatureVerified':False,'compiledManifestVerified':True,'assetsMatchWebBuild':True,'physicalDeviceTested':False,'mode':'static-demo','productionBackendConnected':False,'productionPaymentsConnected':False,'signature':'unsigned; not installable until approved signing'}
    (output/'build-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
