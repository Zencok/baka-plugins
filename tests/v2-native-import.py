"""Exercise the real application import enumerator with a local public QQ fixture.

Usage: python tests/v2-native-import.py PATH_TO_BAKA_FFI_DLL
No remote service or account is contacted.
"""
import ctypes
import http.server
import json
import pathlib
import sys
import threading


requests = []
failures = []


class Fixture(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        try:
            raw = self.rfile.read(int(self.headers["Content-Length"]))
            body = json.loads(raw)
            assert body["req"]["method"] == "uniform_get_Dissinfo"
            begin = body["req"]["param"]["song_begin"]
            requests.append(begin)
            songs = [{"id": index, "mid": f"mid{index}", "title": "Track",
                      "singer": [{"name": "Fixture"}]}
                     for index in range(begin + 1, min(begin + 501, 251))]
            result = {"code": 0, "req": {"code": 0, "data": {
                "code": 0, "dirinfo": {"disstid": "123", "dissname": "Public fixture",
                                        "songnum": 250}, "songlist": songs}}}
            encoded = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        except Exception as error:
            failures.append(str(error))
            self.send_error(500)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
threading.Thread(target=server.serve_forever, daemon=True).start()
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
try:
    source = (pathlib.Path(__file__).resolve().parents[1] / "plugins/v2/qq.js").read_text(encoding="utf-8")
    source = source.replace("// {{REQUEST_HANDLER}}", 'const UPDATE_URL="";')
    source = source.replace("https://u.y.qq.com/cgi-bin/musicu.fcg",
                            f"http://127.0.0.1:{server.server_port}/qq")
    take(library.baka_restore_plugins(engine, json.dumps({
        "plugins": [{"id": "cc.baka.qq", "enabled": True, "variables": {}, "source": source}],
        "bindings": []}).encode()))
    result = take(library.baka_call(engine, b"cc.baka.qq", b"__importMusicSheet", b'["123"]'))
    assert [track["id"] for track in result["musicList"]] == list(range(1, 251))
    assert requests == [0], requests
    assert not failures, failures
    print("Native import passed: 250 exact tracks, one public upstream fetch, V2 snapshot enumeration")
finally:
    library.baka_engine_free(engine)
    server.shutdown()
