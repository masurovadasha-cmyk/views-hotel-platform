"""Fail closed when a review bundle does not describe this clean checkout."""
import json
import zipfile


def verify_release(metadata, release, source, dirty=False):
    if dirty or not isinstance(metadata, dict) or metadata.get('sourceDirty') is not False or metadata.get('sourceCommit') != source:
        raise ValueError('CLEAN_MATCHING_WEB_SOURCE_REQUIRED')
    for key in ('version', 'androidVersionCode', 'androidApplicationId', 'mode'):
        if metadata.get(key) != release.get(key):
            raise ValueError('WEB_RELEASE_MISMATCH:' + key)
    if metadata.get('mode') != 'static-demo' or metadata.get('androidApplicationId') != 'uz.views.preview' or metadata.get('corePublic') is not False or metadata.get('emailConnected') is not False:
        raise ValueError('DISCONNECTED_PREVIEW_REQUIRED')


def verify_apk_release(apk, release, source):
    with zipfile.ZipFile(apk) as archive:
        name = 'assets/www/release.json'
        if archive.namelist().count(name) != 1:
            raise ValueError('UNIQUE_APK_RELEASE_REQUIRED')
        verify_release(json.loads(archive.read(name)), release, source)
