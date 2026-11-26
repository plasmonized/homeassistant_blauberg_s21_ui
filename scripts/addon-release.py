#!/usr/bin/env python3
"""Fail-closed release gate. No registry credentials or third-party packages used."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
IMAGE_INPUTS = (
    "Dockerfile", ".dockerignore", "package.json", "package-lock.json", "run.sh",
    "drizzle.config.ts", "tsconfig.json", "tailwind.config.ts",
    "postcss.config.js", "vite.config.ts", "components.json",
    "client", "server", "shared", "script",
)
ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))


class ReleaseError(Exception):
    pass


def source_fingerprint(root=ROOT):
    digest = hashlib.sha256()
    files = []
    for name in IMAGE_INPUTS:
        target = root / name
        if not target.exists():
            raise ReleaseError(f"Missing image input: {name}")
        if target.is_dir():
            files.extend(p for p in target.rglob("*") if p.is_file())
        else:
            files.append(target)
    for file in sorted(files):
        relative = file.relative_to(root)
        if any(part in {"node_modules", ".git", ".cache", "dist"} for part in relative.parts):
            continue
        if file.name == ".env" or file.name.startswith(".env."):
            continue
        if file.is_symlink():
            raise ReleaseError(f"Symlinks are not allowed in image inputs: {relative}")
        digest.update(str(relative).encode() + b"\0")
        digest.update(hashlib.sha256(file.read_bytes()).digest())
    return digest.hexdigest()


def metadata(repository, root=ROOT):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ReleaseError("Invalid GitHub repository")
    package = json.loads((root / "package.json").read_text())
    lock = json.loads((root / "package-lock.json").read_text())
    version = package["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ReleaseError("Release version must have the form 0.3.15")
    if lock["version"] != version or lock["packages"][""]["version"] != version:
        raise ReleaseError("package.json and package-lock.json versions must match")
    for name, entry in lock["packages"].items():
        if not name:
            continue
        url = urlsplit(entry.get("resolved", ""))
        if (url.scheme != "https" or url.netloc != "registry.npmjs.org"
                or url.query or url.fragment or not entry.get("integrity")):
            raise ReleaseError(
                f"Non-portable package lock entry: {name}. "
                "Use public HTTPS npm tarballs with integrity hashes; "
                "internal registry addresses cannot be downloaded by GitHub."
            )
    if f"\n## {version}\n" not in (root / "CHANGELOG.md").read_text():
        raise ReleaseError("Release is missing from CHANGELOG.md")
    return {
        "image": f"ghcr.io/{repository.lower()}",
        "version": version,
        "fingerprint": source_fingerprint(root),
    }


def fetch_json(url, headers=None):
    try:
        with urlopen(Request(url, headers=headers or {}), timeout=30) as response:
            body = response.read(4 * 1024 * 1024 + 1)
            if len(body) > 4 * 1024 * 1024:
                raise ReleaseError("Registry response exceeds size limit")
            return json.loads(body)
    except HTTPError as error:
        # Never print tokens, signed URLs, or authentication response bodies.
        raise ReleaseError(
            f"Anonymous registry check failed (HTTP {error.code}). "
            "Make the GHCR package public in GitHub package settings and re-run the workflow. "
            "The add-on configuration has NOT been activated."
        ) from None
    except (URLError, TimeoutError, ValueError):
        raise ReleaseError("Registry check failed: unavailable or invalid response. Configuration unchanged.") from None


def valid_digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        raise ReleaseError("Invalid image digest")
    return value


def verify_public(meta, fetch=fetch_json):
    image_path = meta["image"].removeprefix("ghcr.io/")
    # Explicitly request an ANONYMOUS token. Never read GITHUB_TOKEN, Docker's
    # credential store, or the runner's registry login here.
    auth = fetch("https://ghcr.io/token?" + urlencode({
        "service": "ghcr.io", "scope": f"repository:{image_path}:pull",
    }))
    token = auth.get("token") or auth.get("access_token")
    if not isinstance(token, str) or not token:
        raise ReleaseError("No anonymous pull access. Make the GHCR package public.")
    headers = {"Authorization": f"Bearer {token}", "Accept": ACCEPT}
    base = f"https://ghcr.io/v2/{image_path}"
    index = fetch(f"{base}/manifests/{meta['version']}", headers)
    annotations = index.get("annotations") or {}
    if annotations.get("io.blauberg.source-sha256") != meta["fingerprint"]:
        raise ReleaseError("Published image sources differ. Use a NEW version; never overwrite a release tag.")
    if annotations.get("org.opencontainers.image.version") != meta["version"]:
        raise ReleaseError("Multi-architecture image version does not match")
    platforms = {}
    for entry in index.get("manifests", []):
        platform = entry.get("platform") or {}
        if platform.get("os") == "linux" and platform.get("architecture") in {"amd64", "arm64"}:
            arch = platform["architecture"]
            if arch in platforms:
                raise ReleaseError(f"Duplicate architecture: {arch}")
            platforms[arch] = valid_digest(entry.get("digest"))
    if set(platforms) != {"amd64", "arm64"}:
        raise ReleaseError("Both linux/amd64 and linux/arm64 must be published before activation")
    for arch, manifest_digest in platforms.items():
        manifest = fetch(f"{base}/manifests/{manifest_digest}", headers)
        config_digest = valid_digest((manifest.get("config") or {}).get("digest"))
        config = fetch(f"{base}/blobs/{config_digest}", headers)
        labels = (config.get("config") or {}).get("Labels") or {}
        if config.get("os") != "linux" or config.get("architecture") != arch:
            raise ReleaseError(f"Incorrect platform in {arch} image")
        expected_arch = "aarch64" if arch == "arm64" else "amd64"
        if labels.get("io.hass.version") != meta["version"] or labels.get("io.hass.arch") != expected_arch:
            raise ReleaseError(f"Incorrect Home Assistant version/architecture labels in {arch} image")
        if labels.get("io.hass.type") not in {"app", "addon"}:
            raise ReleaseError(f"Missing Home Assistant image type in {arch} image")


def render_config(text, version, image):
    if len(re.findall(r"^version:.*$", text, flags=re.M)) != 1:
        raise ReleaseError("Expected one top-level version in config.yaml")
    if len(re.findall(r"^image:.*$", text, flags=re.M)) > 1:
        raise ReleaseError("Duplicate image in config.yaml")
    current = re.search(r'^version:\s*"(\d+\.\d+\.\d+)"\s*$', text, flags=re.M)
    if not current or tuple(map(int, current[1].split("."))) > tuple(map(int, version.split("."))):
        raise ReleaseError("Refusing to downgrade or replace an unrecognized add-on version")
    text = re.sub(r"^image:.*\n?", "", text, flags=re.M)
    return re.sub(r"^version:.*$", f'version: "{version}"\nimage: "{image}"', text, flags=re.M)


def main(root=ROOT):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("metadata", "verify", "activate"))
    parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    meta = metadata(args.repository, root)
    if args.command == "metadata":
        for key, value in meta.items():
            print(f"{key}={value}")
        return
    verify_public(meta)
    if args.command == "activate":
        target = root / "config.yaml"
        # All checks complete BEFORE touching the live add-on advertisement.
        rendered = render_config(target.read_text(), meta["version"], meta["image"])
        temp = target.with_suffix(".yaml.tmp")
        temp.write_text(rendered)
        temp.replace(target)
    print(f"Verified public AMD64/ARM64 image: {meta['image']}:{meta['version']}")


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, OSError, KeyError, json.JSONDecodeError) as error:
        print(f"Release blocked: {error}", file=sys.stderr)
        sys.exit(1)
