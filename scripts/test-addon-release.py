#!/usr/bin/env python3
"""Offline checks: never publish, log in, touch real hardware or call a registry."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("addon_release", Path(__file__).with_name("addon-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name in release.IMAGE_INPUTS:
            target = self.root / name
            if name in {"client", "server", "shared", "script"}:
                target.mkdir()
                (target / "example.txt").write_text(name)
            else:
                target.write_text(name)
        (self.root / "package.json").write_text(json.dumps({"version": "0.3.15"}))
        (self.root / "package-lock.json").write_text(json.dumps({
            "version": "0.3.15", "packages": {"": {"version": "0.3.15"}},
        }))
        (self.root / "CHANGELOG.md").write_text("# Changelog\n\n## 0.3.15\n\nPrepared release\n")
        self.config = 'name: "S21"\nversion: "0.3.14"\nslug: blauberg_s21_ventilation\ningress_port: 8099\n'
        (self.root / "config.yaml").write_text(self.config)
        self.meta = release.metadata("Owner/Example", self.root)
        self.index = {"annotations": {
            "io.blauberg.source-sha256": self.meta["fingerprint"],
            "org.opencontainers.image.version": "0.3.15",
        }, "manifests": [
            {"platform": {"os": "linux", "architecture": "amd64"}, "digest": "sha256:" + "a" * 64},
            {"platform": {"os": "linux", "architecture": "arm64"}, "digest": "sha256:" + "b" * 64},
        ]}
        self.configs = {arch: {
            "os": "linux", "architecture": arch, "config": {"Labels": {
                "io.hass.type": "app", "io.hass.version": "0.3.15",
                "io.hass.arch": "amd64" if arch == "amd64" else "aarch64",
            }},
        } for arch in ("amd64", "arm64")}
        self.calls = []

    def tearDown(self):
        self.temp.cleanup()

    def fetch(self, url, headers=None):
        self.calls.append((url, headers))
        if "/token?" in url:
            self.assertIsNone(headers, "anonymous token request must not contain a runner login")
            return {"token": "test-anonymous-pull"}
        self.assertEqual(headers["Authorization"], "Bearer test-anonymous-pull")
        if url.endswith("/manifests/0.3.15"):
            return copy.deepcopy(self.index)
        for arch, digest_char, config_char in (("amd64", "a", "c"), ("arm64", "b", "d")):
            if url.endswith("/manifests/sha256:" + digest_char * 64):
                return {"config": {"digest": "sha256:" + config_char * 64}}
            if url.endswith("/blobs/sha256:" + config_char * 64):
                return copy.deepcopy(self.configs[arch])
        self.fail("Unexpected registry path")

    def test_staged_version_does_not_advertise_an_update(self):
        self.assertEqual(self.meta["image"], "ghcr.io/owner/example")
        self.assertEqual(self.meta["version"], "0.3.15")
        self.assertEqual((self.root / "config.yaml").read_text(), self.config)

    def test_lock_mismatch_and_missing_changelog_block_release(self):
        (self.root / "package-lock.json").write_text('{"version":"0.3.14","packages":{"":{"version":"0.3.14"}}}')
        with self.assertRaises(release.ReleaseError):
            release.metadata("owner/example", self.root)
        (self.root / "package-lock.json").write_text('{"version":"0.3.15","packages":{"":{"version":"0.3.15"}}}')
        (self.root / "CHANGELOG.md").write_text("# Changelog\n")
        with self.assertRaises(release.ReleaseError):
            release.metadata("owner/example", self.root)

    def test_fingerprint_tracks_sources_but_not_activation_or_local_files(self):
        old = release.source_fingerprint(self.root)
        (self.root / "config.yaml").write_text("activated config")
        (self.root / "client/.env").write_text("test placeholder")
        cache = self.root / "client/node_modules"
        cache.mkdir()
        (cache / "placeholder").write_text("not an image input")
        self.assertEqual(release.source_fingerprint(self.root), old)
        (self.root / "server/example.txt").write_text("changed source")
        self.assertNotEqual(release.source_fingerprint(self.root), old)

    def test_package_downloads_must_be_portable_and_integrity_checked(self):
        lock_path = self.root / "package-lock.json"
        lock = json.loads(lock_path.read_text())
        entry = {"version": "1.0.0", "integrity": "sha512-test",
                 "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz"}
        lock["packages"]["node_modules/example"] = entry
        lock_path.write_text(json.dumps(lock))
        release.metadata("owner/example", self.root)
        for bad_url in (
            "http://package-firewall.replit.local/npm/example/-/example-1.0.0.tgz",
            "https://package-firewall.replit.local/npm/example/-/example-1.0.0.tgz",
            "http://registry.npmjs.org/example/-/example-1.0.0.tgz",
            "https://registry.npmjs.org.evil.invalid/example.tgz",
            "file:../example.tgz",
            "",
        ):
            with self.subTest(url=bad_url):
                entry["resolved"] = bad_url
                lock_path.write_text(json.dumps(lock))
                with self.assertRaisesRegex(release.ReleaseError, "Non-portable"):
                    release.metadata("owner/example", self.root)
        entry["resolved"] = "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
        del entry["integrity"]
        lock_path.write_text(json.dumps(lock))
        with self.assertRaisesRegex(release.ReleaseError, "Non-portable"):
            release.metadata("owner/example", self.root)

    def test_public_multi_architecture_image_passes(self):
        release.verify_public(self.meta, self.fetch)
        self.assertEqual(len(self.calls), 6)

    def test_missing_architecture_blocks_release(self):
        self.index["manifests"].pop()
        with self.assertRaisesRegex(release.ReleaseError, "Both linux"):
            release.verify_public(self.meta, self.fetch)

    def test_incorrect_platform_or_labels_block_release(self):
        for field, bad in (("io.hass.version", "0.3.14"), ("io.hass.arch", "amd64"), ("io.hass.type", "")):
            with self.subTest(field=field):
                original = self.configs["arm64"]["config"]["Labels"][field]
                self.configs["arm64"]["config"]["Labels"][field] = bad
                with self.assertRaises(release.ReleaseError):
                    release.verify_public(self.meta, self.fetch)
                self.configs["arm64"]["config"]["Labels"][field] = original

    def test_wrong_sources_or_version_block_reusing_a_tag(self):
        for field in ("io.blauberg.source-sha256", "org.opencontainers.image.version"):
            with self.subTest(field=field):
                original = self.index["annotations"][field]
                self.index["annotations"][field] = "different"
                with self.assertRaises(release.ReleaseError):
                    release.verify_public(self.meta, self.fetch)
                self.index["annotations"][field] = original

    def test_duplicate_platform_and_invalid_digest_are_rejected(self):
        self.index["manifests"].append(copy.deepcopy(self.index["manifests"][0]))
        with self.assertRaises(release.ReleaseError):
            release.verify_public(self.meta, self.fetch)
        self.index["manifests"].pop()
        self.index["manifests"][0]["digest"] = "../../unexpected/path"
        with self.assertRaises(release.ReleaseError):
            release.verify_public(self.meta, self.fetch)

    def test_activation_is_idempotent_and_preserves_device_identity(self):
        first = release.render_config(self.config, self.meta["version"], self.meta["image"])
        self.assertIn('version: "0.3.15"\nimage: "ghcr.io/owner/example"', first)
        self.assertIn("slug: blauberg_s21_ventilation\ningress_port: 8099", first)
        self.assertEqual(release.render_config(first, self.meta["version"], self.meta["image"]), first)
        with self.assertRaises(release.ReleaseError):
            release.render_config(first, "0.3.14", self.meta["image"])

    def test_private_or_failed_registry_cannot_change_config(self):
        for message in ("Package is private", "Network timeout", "Missing architecture"):
            with self.subTest(message=message):
                with patch("sys.argv", ["addon-release.py", "activate", "--repository", "owner/example"]):
                    with patch.object(release, "verify_public", side_effect=release.ReleaseError(message)):
                        with self.assertRaises(release.ReleaseError):
                            release.main(self.root)
                self.assertEqual((self.root / "config.yaml").read_text(), self.config)
                self.assertFalse((self.root / "config.yaml.tmp").exists())

    def test_successful_gate_activates_only_config(self):
        with patch("sys.argv", ["addon-release.py", "activate", "--repository", "owner/example"]):
            with patch.object(release, "verify_public") as verify:
                release.main(self.root)
                verify.assert_called_once()
        self.assertIn('version: "0.3.15"', (self.root / "config.yaml").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
