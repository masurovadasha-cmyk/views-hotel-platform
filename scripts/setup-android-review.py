#!/usr/bin/env python3
"""Install pinned, verified Linux x64 tooling under a user-writable directory."""
import argparse, hashlib, json, os, pathlib, platform, tarfile, urllib.request, zipfile
if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
    raise SystemExit('This toolchain is for Linux x64 only')
parser=argparse.ArgumentParser()
parser.add_argument('--with-emulator',action='store_true',help='Also install pinned Android 10 x64 test image, emulator and ADB (about 1 GiB downloads)')
args=parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[1]
root = pathlib.Path(os.environ.get('VIEWS_ANDROID_TOOLS', '/workspace/android-tools'))
root.mkdir(parents=True, exist_ok=True)
items=json.loads((repo/'apps/android-review/toolchain-linux-x64.json').read_text())
if args.with_emulator:
    items+=json.loads((repo/'apps/android-review/emulator-linux-x64.json').read_text())
for item in items:
    archive = root/item['file']
    if not archive.exists():
        request = urllib.request.Request(item['url'], headers={'User-Agent': 'VIEWS-build-setup'})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
        if hashlib.sha256(payload).hexdigest() != item['sha256']:
            raise SystemExit('Downloaded toolchain checksum mismatch: '+item['file'])
        archive.write_bytes(payload)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('Cached toolchain checksum mismatch: '+item['file'])
    destination = root/item['destination']
    destination.mkdir(parents=True, exist_ok=True)
    if item['file'].endswith('.tar.gz'):
        with tarfile.open(archive) as contents:
            contents.extractall(destination, filter='data')
    else:
        with zipfile.ZipFile(archive) as contents:
            for entry in contents.infolist():
                parts = pathlib.PurePosixPath(entry.filename).parts[1:]
                if not parts:
                    continue
                if '..' in parts or entry.filename.startswith('/'):
                    raise SystemExit('Invalid archive path')
                target = destination.joinpath(*parts)
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    payload=contents.read(entry)
                    if not target.exists() or target.read_bytes()!=payload:
                        target.write_bytes(payload)
                    target.chmod((entry.external_attr >> 16) & 0o777 or 0o644)
    print(item['file']+': checksum verified, installed')
print('Set JAVA_HOME='+str(root/'java/jdk-21.0.12.1+1'))
print('Set ANDROID_HOME='+str(root/'sdk')+' and prepend $JAVA_HOME/bin to PATH')
