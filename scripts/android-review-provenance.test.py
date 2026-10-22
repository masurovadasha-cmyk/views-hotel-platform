import io
import json
import unittest
import zipfile
from android_review_provenance import verify_release, verify_apk_release


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.source = 'a' * 40
        self.release = dict(version='0.17.0-integration-demo', androidVersionCode=1700001,
                            androidApplicationId='uz.views.preview', mode='static-demo')
        self.meta = dict(self.release, sourceCommit=self.source, sourceDirty=False,
                         corePublic=False, emailConnected=False)

    def test_clean_matching_bundle(self):
        verify_release(self.meta, self.release, self.source)

    def test_stale_or_dirty_bundles(self):
        for mutation in [dict(sourceCommit='b' * 40), dict(sourceDirty=True), dict(sourceDirty=None)]:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                verify_release(dict(self.meta, **mutation), self.release, self.source)
        with self.assertRaises(ValueError):
            verify_release(self.meta, self.release, self.source, dirty=True)

    def test_release_identity_and_mode(self):
        for key, value in [('version', 'old'), ('androidVersionCode', 1501001),
                           ('androidApplicationId', 'other.app'), ('mode', 'live'),
                           ('corePublic', True), ('emailConnected', True)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_release(dict(self.meta, **{key: value}), self.release, self.source)

    def test_apk_inspects_embedded_release_not_external_evidence(self):
        for source in [self.source, 'b' * 40]:
            apk = io.BytesIO()
            with zipfile.ZipFile(apk, 'w') as z:
                z.writestr('assets/www/release.json', json.dumps(dict(self.meta, sourceCommit=source)))
            apk.seek(0)
            if source == self.source:
                verify_apk_release(apk, self.release, self.source)
            else:
                with self.assertRaises(ValueError):
                    verify_apk_release(apk, self.release, self.source)

    def test_missing_or_duplicate_release(self):
        for count in [0, 2]:
            apk = io.BytesIO()
            with zipfile.ZipFile(apk, 'w') as z:
                for _ in range(count):
                    z.writestr('assets/www/release.json', json.dumps(self.meta))
            apk.seek(0)
            with self.assertRaises(ValueError):
                verify_apk_release(apk, self.release, self.source)


if __name__ == '__main__':
    unittest.main()
