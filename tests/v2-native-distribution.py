"""Verify a distribution through the app's actual native fetch/inspect/registry.

Usage: python tests/v2-native-distribution.py PATH_TO_BAKA_FFI_LIBRARY SUBSCRIPTION_URL
The URL may point to a local preview or a deployed distribution. No playback or
source-account API is called; downloaded scripts must not perform startup I/O.
Credentials and script contents are never printed or persisted.
"""
import ctypes
import json
import pathlib
import sys
from urllib.parse import urljoin, urlparse

library = ctypes.CDLL(str(pathlib.Path(sys.argv[1]).resolve()))
for name, arguments, result in [
    ("baka_engine_new", [ctypes.c_char_p], ctypes.c_void_p),
    ("baka_restore_plugins", [ctypes.c_void_p, ctypes.c_char_p], ctypes.c_void_p),
    ("baka_call", [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p], ctypes.c_void_p),
    ("baka_last_error", [], ctypes.c_char_p),
    ("baka_string_free", [ctypes.c_void_p], None),
    ("baka_engine_free", [ctypes.c_void_p], None),
]:
    function = getattr(library, name)
    function.argtypes, function.restype = arguments, result


def take(pointer):
    if not pointer:
        raise RuntimeError(library.baka_last_error().decode())
    try:
        return json.loads(ctypes.string_at(pointer))
    finally:
        library.baka_string_free(pointer)


engine = library.baka_engine_new(b"{}")
assert engine, "Native engine initialization failed"


def call(entry, arguments):
    return take(library.baka_call(engine, b"", entry.encode(), json.dumps(arguments).encode()))


def fetch(url):
    assert urlparse(url).scheme in {"http", "https"}
    return call("__pluginSourceFetch", [{"version": 1, "url": url, "permit": None}])["source"]


try:
    subscription_url = sys.argv[2]
    document = json.loads(fetch(subscription_url).removeprefix("\ufeff"))
    assert isinstance(document.get("plugins"), list) and document["plugins"]
    packages = []
    seen = set()
    for entry in document["plugins"]:
        source = fetch(urljoin(subscription_url, entry["url"]))
        assert source.splitlines()[0] == "// @baka-provider 2", "Downloaded source marker missing"
        manifest = call("__pluginInspect", [{"source": source, "variables": {}}])
        assert manifest["kind"] == "provider" and manifest["apiVersion"] == 2
        assert manifest["id"] == entry["id"] and manifest["id"].startswith("cc.baka.")
        assert manifest["id"] not in seen
        seen.add(manifest["id"])
        for field in ["name", "author", "version"]:
            assert manifest[field] == entry[field], f"Subscription {field} mismatch"
        assert manifest["version"] == "1.0.0"
        packages.append({"id": manifest["id"], "source": source, "enabled": True, "variables": {}})
    take(library.baka_restore_plugins(engine, json.dumps({"plugins": packages, "bindings": []}).encode()))
    print(json.dumps({"nativeFetchInspectAndRestore": True, "providers": sorted(seen)}))
finally:
    library.baka_engine_free(engine)
