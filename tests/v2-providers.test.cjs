const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const path = require("node:path");
const ids = ["am", "wy", "qq", "kg", "kw", "mg", "bilibili"];
const pluginPath = (id) => path.join(__dirname, "..", "plugins", "v2", id + ".js");
function load(id, injected = "", vectors = []) {
  let source = fs.readFileSync(pluginPath(id), "utf8").replace("// {{REQUEST_HANDLER}}", injected);
  if (vectors.length)
    source = source.replace(
      /return \{\s*search,/,
      "globalThis.vectors = {" + vectors.join(",") + "};\nreturn {\n  search,",
    );
  const context = { module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source + "\nmodule.exports.operations = operations;", context, {
    filename: id + ".js",
  });
  return { plugin: context.module.exports, context };
}
function sdkFor(
  respond = () => {
    throw new Error("Unexpected HTTP request");
  },
  settings = {},
) {
  const calls = [];
  const sdk = {
    settings,
    bytes: {
      encode: (value, encoding = "utf8") => Buffer.from(value, encoding).toString("hex"),
      decode: (hex, encoding = "utf8") => Buffer.from(hex, "hex").toString(encoding),
      decompress: (hex) => zlib.inflateSync(Buffer.from(hex, "hex")).toString("hex"),
    },
    crypto: {
      hash: (algorithm, hex) =>
        crypto.createHash(algorithm).update(Buffer.from(hex, "hex")).digest("hex"),
      randomBytes: (count) => crypto.randomBytes(count).toString("hex"),
      hmacSha256: (key, hex) =>
        crypto
          .createHmac("sha256", Buffer.from(key, "hex"))
          .update(Buffer.from(hex, "hex"))
          .digest("hex"),
      aesEncrypt: (request) => {
        const key = Buffer.from(request.keyHex, "hex");
        const cipher = crypto.createCipheriv(
          `aes-${key.length * 8}-${request.mode}`,
          key,
          request.ivHex ? Buffer.from(request.ivHex, "hex") : null,
        );
        return Buffer.concat([
          cipher.update(Buffer.from(request.dataHex, "hex")),
          cipher.final(),
        ]).toString("hex");
      },
    },
    text: { decodeHtml: (value) => String(value).replace(/&amp;/g, "&").replace(/&#39;/g, "'") },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    http: {
      request: async (request) => {
        calls.push(request);
        let result = await respond(request, calls.length);
        if (request.responseType === "json" && typeof result === "string")
          result = JSON.parse(result);
        if (request.responseType === "text" && typeof result !== "string")
          result = JSON.stringify(result);
        return { status: 200, headers: {}, body: result };
      },
    },
  };
  return { sdk, calls };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
async function enumerateImported(plugin, entity, sdk, limit = 1) {
  assert.equal(entity.musicList, undefined);
  assert.ok(entity._bakaImportToken);
  const items = [];
  let cursor = null;
  do {
    const page = await plugin.handlers.collections.members(
      { entity, kind: "music", cursor, limit },
      sdk,
    );
    assert.ok(page.items.length <= limit);
    assert.ok(page.nextCursor === null || page.items.length > 0);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

test("all seven V2 providers load with no Node/DOM/package globals and declare implemented handlers", () => {
  for (const id of ids) {
    const { plugin } = load(id);
    assert.equal(plugin.manifest.id, "cc.baka." + id);
    assert.equal(plugin.manifest.version, ["kw", "mg"].includes(id) ? "1.0.4" : ["wy", "kg"].includes(id) ? "1.0.3" : id === "am" ? "1.0.1" : "1.0.2");
    assert.equal(plugin.manifest.sourceId, id + ".v1");
    assert.equal(plugin.manifest.author, "BakaMusic");
    for (const capability of plugin.manifest.capabilities) {
      assert.equal(
        typeof capability.split(".").reduce((value, key) => value && value[key], plugin.handlers),
        "function",
        id + ":" + capability,
      );
    }
    assert.doesNotMatch(
      fs.readFileSync(pluginPath(id), "utf8"),
      /require\(|\baxios\b|CryptoJS|CryptoJs|\bBuffer\b|\bcheerio\b/,
    );
    assert.doesNotThrow(() => plugin.operations(sdkFor().sdk), id);
  }
});

test("QQ playlist import uses public uniform_get_Dissinfo and advances source offsets across short pages", async () => {
  const { plugin } = load("qq");
  const { sdk, calls } = sdkFor((request, count) => {
    assert.equal(request.url, "https://u.y.qq.com/cgi-bin/musicu.fcg");
    const body = JSON.parse(request.body);
    assert.equal(body.req.module, "music.srfDissInfo.aiDissInfo");
    assert.equal(body.req.method, "uniform_get_Dissinfo");
    assert.equal(body.req.param.song_begin, (count - 1) * 500);
    assert.equal(body.req.param.song_num, 500);
    return {
      code: 0,
      req: {
        code: 0,
        data: {
          code: 0,
          dirinfo: { disstid: "123", dissname: "Public &amp; playlist", songnum: 501 },
          songlist: [
            {
              id: count,
              mid: "mid" + count,
              title: "Track " + count,
              singer: [{ name: "Singer" }],
            },
          ],
        },
      },
    };
  });
  const result = await plugin.handlers.links.resolve(
    { url: "https://y.qq.com/n/ryqq/playlist/123" },
    sdk,
  );
  assert.equal(calls.length, 2);
  assert.equal(result.title, "Public & playlist");
  assert.equal(result.worksNum, 501);
  const imported = await enumerateImported(plugin, result, sdk);
  assert.deepEqual(plain(imported.map((item) => item.id)), [1, 2]);
  assert.equal(calls.length, 2);
});

test("SDK transport retains HTML/text before opportunistic JSON parsing", async () => {
  const provider = load("mg", "", ["httpGet"]);
  const { sdk, calls } = sdkFor((request) => {
    if (request.url.endsWith("/html")) return '<div data-cid="123">Song</div>';
    return '{"code":0,"name":"public"}';
  });
  provider.plugin.operations(sdk);
  const html = await provider.context.vectors.httpGet("https://music.migu.cn/html");
  assert.equal(html.data, '<div data-cid="123">Song</div>');
  assert.equal(calls[0].responseType, "text");
  const json = await provider.context.vectors.httpGet("https://music.migu.cn/json");
  assert.deepEqual(plain(json.data), { code: 0, name: "public" });
  const text = await provider.context.vectors.httpGet("https://music.migu.cn/json", {
    responseType: "text",
  });
  assert.equal(text.data, '{"code":0,"name":"public"}');
  await assert.rejects(
    provider.context.vectors.httpGet("https://music.migu.cn/html", { responseType: "json" }),
    SyntaxError,
  );
});

test("QQ V2 cursor slices public 100-track pages to host limit without gaps or duplicates", async () => {
  const { plugin } = load("qq");
  const { sdk, calls } = sdkFor((request) => {
    const body = JSON.parse(request.body);
    const begin = body.req.param.song_begin;
    assert.equal(body.req.param.song_num, 100);
    return {
      code: 0,
      req: {
        code: 0,
        data: {
          code: 0,
          dirinfo: { disstid: "123", dissname: "Sheet", songnum: 250 },
          songlist: Array.from({ length: Math.min(100, 250 - begin) }, (_, index) => ({
            id: begin + index + 1,
            mid: "mid" + (begin + index + 1),
            title: "Track",
            singer: [{ name: "Singer" }],
          })),
        },
      },
    };
  });
  let cursor = null;
  const tracks = [];
  const lengths = [];
  do {
    const page = await plugin.handlers.collections.members(
      { entity: { id: "123", type: "sheet" }, kind: "music", cursor, limit: 30 },
      sdk,
    );
    assert.ok(page.items.length <= 30);
    assert.ok(page.nextCursor === null || page.items.length > 0);
    assert.equal(page.entity.worksNum, 250);
    tracks.push(...page.items.map((item) => item.id));
    lengths.push(page.items.length);
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    tracks,
    Array.from({ length: 250 }, (_, index) => index + 1),
  );
  assert.deepEqual(lengths, [30, 30, 30, 10, 30, 30, 30, 10, 30, 20]);
  assert.deepEqual(
    calls.map((request) => JSON.parse(request.body).req.param.song_begin),
    [0, 0, 0, 0, 100, 100, 100, 100, 200, 200],
  );
});

test("provider paging rejects empty nonterminal pages and accepts default/bounded limits", async () => {
  const { plugin } = load("qq");
  const { sdk } = sdkFor(() => ({
    code: 0,
    req: {
      code: 0,
      data: { code: 0, dirinfo: { disstid: "123", dissname: "Sheet", songnum: 250 }, songlist: [] },
    },
  }));
  await assert.rejects(
    plugin.handlers.collections.members(
      { entity: { id: "123", type: "sheet" }, kind: "music", cursor: null, limit: 30 },
      sdk,
    ),
    /pagination did not advance/,
  );
  const source = fs.readFileSync(pluginPath("qq"), "utf8");
  const context = { module: { exports: {} } };
  vm.runInNewContext(
    source + "\nmodule.exports.pageResult = pageResult; module.exports.sliceResult = sliceResult;",
    context,
  );
  const items = Array.from({ length: 240 }, (_, id) => ({ id }));
  const first = context.module.exports.pageResult({ data: items, isEnd: true }, {});
  assert.equal(first.items.length, 30);
  const second = context.module.exports.pageResult(
    { data: items, isEnd: true },
    { cursor: first.nextCursor, limit: 500 },
  );
  assert.equal(second.items.length, 100);
  assert.equal(second.items[0].id, 30);
  const third = context.module.exports.pageResult(
    { data: items, isEnd: true },
    { cursor: second.nextCursor, limit: 7 },
  );
  assert.equal(third.items[0].id, 130);
  assert.equal(third.items.length, 7);
  const grouped = context.module.exports.sliceResult(
    [
      {
        title: "Popular",
        data: [{ id: 1 }, { id: 2, group: "Own group" }, { id: 3, category: "Own category" }],
      },
    ],
    { limit: 30 },
  );
  assert.deepEqual(plain(grouped.items), [
    { id: 1, group: "Popular" },
    { id: 2, group: "Own group" },
    { id: 3, category: "Own category" },
  ]);
});

test("Kugou gcid import uses public signed decode and gateway list APIs", async () => {
  const { plugin } = load("kg");
  const { sdk, calls } = sdkFor((request, count) => {
    if (count === 1) {
      assert.match(request.url, /^https:\/\/t\.kugou\.com\/v1\/songlist\/batch_decode\?/);
      assert.match(request.url, /signature=[a-f0-9]{32}$/);
      assert.equal(JSON.parse(request.body).data[0].id, "gcid_abcdef123");
      return { status: 1, data: { list: [{ global_collection_id: "collection_1_2_3_4" }] } };
    }
    if (count === 3) {
      assert.match(request.url, /^https:\/\/gateway\.kugou\.com\/v2\/get_res_privilege\/lite\?/);
      return { status: 1, data: [{ hash: "public-hash-1" }, { hash: "public-hash-2" }] };
    }
    assert.match(
      request.url,
      /^https:\/\/gateway\.kugou\.com\/pubsongs\/v2\/get_other_list_file_nofilt\?/,
    );
    assert.match(request.url, /global_collection_id=collection_1_2_3_4/);
    return {
      status: 1,
      data: {
        songs: [
          { hash: "public-hash-1", name: "Singer - One" },
          { hash: "public-hash-2", name: "Singer - Two" },
        ],
        count: 2,
        list_info: { name: "Public list" },
      },
    };
  });
  const result = await plugin.handlers.links.resolve(
    { url: "https://www.kugou.com/songlist/gcid_abcdef123" },
    sdk,
  );
  assert.equal(calls.length, 3);
  assert.equal(result.id, "gcid_abcdef123");
  const imported = await enumerateImported(plugin, result, sdk);
  assert.deepEqual(plain(imported.map((item) => item.id)), ["public-hash-1", "public-hash-2"]);
  assert.equal(calls.length, 3);
});

test("Kugou numeric import uses public command endpoint rather than internal music API", async () => {
  const { plugin } = load("kg");
  const { sdk, calls } = sdkFor((request, count) => {
    if (count === 2) {
      assert.match(request.url, /^https:\/\/gateway\.kugou\.com\/v2\/get_res_privilege\/lite\?/);
      return {
        status: 1,
        data: [
          { hash: "public-hash-1", name: "One", singername: "Singer" },
          { hash: "public-hash-2", name: "Two", singername: "Singer" },
        ],
      };
    }
    assert.equal(request.url, "http://t.kugou.com/command/");
    assert.equal(JSON.parse(request.body).data, "123456");
    return {
      status: 1,
      data: {
        info: { name: "Numeric sheet", count: 2 },
        list: [
          { hash: "public-hash-1", filename: "One" },
          { hash: "public-hash-2", filename: "Two" },
        ],
      },
    };
  });
  const result = await plugin.handlers.links.resolve({ url: "123456" }, sdk);
  assert.equal(calls.length, 2);
  assert.equal(result.title, "Numeric sheet");
  const imported = await enumerateImported(plugin, result, sdk);
  assert.deepEqual(plain(imported.map((item) => item.id)), ["public-hash-1", "public-hash-2"]);
  assert.equal(calls.length, 2);
});

test("Kuwo authenticated import URL is consumed once and native member enumeration uses its snapshot", async () => {
  const { plugin } = load("kw");
  const { sdk, calls } = sdkFor((request) => {
    const url = new URL(request.url);
    if (url.hostname === "musicpay.kuwo.cn") return { songs: [] };
    assert.equal(url.searchParams.get("token"), "private-token");
    assert.equal(url.searchParams.get("pid"), "123");
    assert.equal(url.searchParams.get("pn"), "0");
    return {
      errcode: 0,
      info: {
        total: 2,
        playlistinfo: { id: 123, name: "Protected list" },
        musiclist: [
          { id: 1, name: "One", artist: "Singer" },
          { id: 2, name: "Two", artist: "Singer" },
        ],
      },
    };
  });
  const entity = await plugin.handlers.links.resolve(
    { url: "https://nplserver.kuwo.cn/pl.svc?op=pl3_getlist&pid=123&token=private-token" },
    sdk,
  );
  const imported = await enumerateImported(plugin, entity, sdk);
  assert.deepEqual(plain(imported.map((item) => item.id)), [1, 2]);
  assert.equal(calls.length, 2);
  assert.equal(typeof entity.id, "string");
  assert.doesNotMatch(JSON.stringify(entity), /private-token/);
});

test("Migu short-link redirect imports its public metadata, HTML songs and snapshot without request globals", async () => {
  const { plugin } = load("mg");
  const { sdk, calls } = sdkFor((request, count) => {
    if (count === 2) {
      assert.equal(
        request.url,
        "https://m.music.migu.cn/migu/remoting/query_playlist_by_id_tag?onLine=1&queryChannel=0&createUserId=migu&contentCountMin=5&playListId=789",
      );
      return {
        rsp: { playList: [{ playListId: "789", playListName: "Shared list", contentCount: "2" }] },
      };
    }
    if (count === 3) {
      assert.equal(request.url, "https://music.migu.cn/v3/music/playlist/789?page=1");
      assert.equal(request.responseType, "text");
      return '<div class="row J_CopySong" data-cid="cid1"></div><div class="row J_CopySong" data-cid="cid2"></div>';
    }
    assert.equal(count, 4);
    assert.equal(
      request.url,
      "https://music.migu.cn/v3/api/music/audioPlayer/songs?type=1&copyrightId=cid1,cid2",
    );
    return {
      items: [
        { songId: 1, songName: "One", copyrightId: "cid1", singers: [], albums: [] },
        { songId: 2, songName: "Two", copyrightId: "cid2", singers: [], albums: [] },
      ],
    };
  });
  const ordinaryRequest = sdk.http.request;
  sdk.http.request = async (request) => {
    if (request.url.startsWith("https://c.migu.cn/")) {
      calls.push(request);
      assert.equal(request.url, "https://c.migu.cn/abc?from=share&x=1");
      assert.equal(request.maxRedirects, 0);
      assert.equal(request.responseType, "text");
      return {
        status: 302,
        headers: {
          Location: "https://h5.nf.migu.cn/app/v4/p/share/playlist/index.html?foo=1&id=789",
        },
        body: "",
      };
    }
    return ordinaryRequest(request);
  };
  const entity = await plugin.handlers.links.resolve(
    { url: "https://c.migu.cn/abc?from=share&x=1" },
    sdk,
  );
  assert.equal(entity.id, "789");
  assert.equal(entity.title, "Shared list");
  const tracks = await enumerateImported(plugin, entity, sdk);
  assert.deepEqual(plain(tracks.map((item) => item.id)), [1, 2]);
  assert.equal(calls.length, 4);
});

test("import snapshot rejects more than 100000 tracks before allocating a snapshot token", async () => {
  const source = fs
    .readFileSync(pluginPath("qq"), "utf8")
    .replace(
      "const imported = await importMusicSheet(url);",
      'const imported = { id: "oversized", musicList: Array(100001).fill({ id: 1 }) };',
    );
  const context = { module: { exports: {} } };
  vm.runInNewContext(source, context);
  const { sdk, calls } = sdkFor();
  sdk.crypto.randomBytes = () => {
    throw new Error("Snapshot token must not be allocated");
  };
  await assert.rejects(
    context.module.exports.handlers.links.resolve({ url: "123" }, sdk),
    /100000-track limit/,
  );
  assert.equal(calls.length, 0);
});

test("Kugou KRC and Kuwo lyric bytes use SDK decompression and decoding", () => {
  const kg = load("kg", "", ["decryptKrc"]);
  const { sdk } = sdkFor();
  kg.plugin.operations(sdk);
  const lyric = "[0,1000]<0,500,0>hello";
  const key = [
    0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
  ];
  const compressed = zlib.deflateSync(Buffer.from(lyric));
  const encrypted = Buffer.from(compressed.map((value, index) => value ^ key[index % key.length]));
  assert.equal(
    kg.context.vectors.decryptKrc(
      Buffer.concat([Buffer.from("krc1"), encrypted]).toString("base64"),
    ),
    lyric,
  );
  const kw = load("kw", "", ["buildParams", "decodeKuwoNewLyricPayload"]);
  kw.plugin.operations(sdk);
  const params = kw.context.vectors.buildParams("123", true);
  const decoded = Buffer.from(params, "base64")
    .map((value, index) => value ^ Buffer.from("yeelion")[index % 7])
    .toString();
  assert.match(decoded, /rid=MUSIC_123&lrcx=1$/);
  const payload = Buffer.concat([
    Buffer.from("HTTP/1.1 200 OK\r\n\r\n"),
    zlib.deflateSync(Buffer.from("hello")),
  ]);
  // Supply the VM's Uint8Array through the provider byte helper path.
  const data = vm.runInContext("Uint8Array.from(" + JSON.stringify([...payload]) + ")", kw.context);
  assert.equal(kw.context.vectors.decodeKuwoNewLyricPayload(data, false), "hello");
  const richLyric = "[00:01.00]hello";
  const richEncrypted = Buffer.from(richLyric).map(
    (value, index) => value ^ Buffer.from("yeelion")[index % 7],
  );
  const richPayload = Buffer.concat([
    Buffer.from("HTTP/1.1 200 OK\r\n\r\n"),
    zlib.deflateSync(Buffer.from(richEncrypted.toString("base64"))),
  ]);
  const richData = vm.runInContext(
    "Uint8Array.from(" + JSON.stringify([...richPayload]) + ")",
    kw.context,
  );
  assert.equal(kw.context.vectors.decodeKuwoNewLyricPayload(richData, true), richLyric);
  const qq = load("qq", "", ["base64EncodeBytes"]);
  qq.plugin.operations(sdk);
  assert.equal(qq.context.vectors.base64EncodeBytes([65, 66, 67]), "QUJD");
});

test("WY EAPI encryption and WEAPI RSA/AES use SDK crypto with original protocol keys", () => {
  const wy = load("wy", "", ["eapiEncrypt", "getParamsAndEnc"]);
  wy.plugin.operations(sdkFor().sdk);
  const encrypted = wy.context.vectors.eapiEncrypt("/api/test", { id: 7 });
  const decipher = crypto.createDecipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8"), null);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.params, "hex")),
    decipher.final(),
  ]).toString();
  assert.match(decrypted, /^\/api\/test-36cd479b6b5-\{"id":7\}-36cd479b6b5-[a-f0-9]{32}$/);
  const weapi = wy.context.vectors.getParamsAndEnc("{}");
  assert.match(weapi.encSecKey, /^[a-f0-9]{256}$/);
  assert.ok(Buffer.from(weapi.params, "base64").length >= 16);
});

test("provider media.prepare owns LX context and selected resolution consumes complete entity", async () => {
  for (const id of ["wy", "qq", "kg", "kw"]) {
    const { plugin } = load(
      id,
      'async function requestMusicUrl(item, quality, sdk) { return { url: "https://audio.test/" + item.id, quality, marker: sdk.settings.marker }; }',
    );
    const entity = { id: "id", songmid: "mid", hash: "hash", copyrightId: "copyright" };
    const result = await plugin.handlers.media.resolve(
      { entity, quality: "flac" },
      sdkFor(undefined, { marker: "public" }).sdk,
    );
    assert.equal(result.marker, "public");
    const prepared = await plugin.handlers.media.prepare({ entity, quality: "flac" });
    assert.equal(prepared.protocol, "lx");
    assert.equal(prepared.source, id === "qq" ? "tx" : id);
    assert.equal(prepared.musicInfo.songmid, "mid");
  }
});

test("QQ encrypted lyrics preserve the public QRC/translation/romanization response for native parsing", async () => {
  const { plugin } = load("qq");
  const { sdk } = sdkFor((request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.req.module, "music.musichallSong.PlayLyricInfo");
    assert.equal(body.req.param.crypt, 1);
    assert.equal(body.req.param.qrc, 1);
    return {
      code: 0,
      req: {
        code: 0,
        data: { lyric: "encrypted-qrc", trans: "translation", roma: "romanization" },
      },
    };
  });
  const result = await plugin.handlers.lyrics.get({ entity: { id: 123, songmid: "mid" } }, sdk);
  assert.deepEqual(plain(result), {
    rawLrc: "encrypted-qrc",
    translation: "translation",
    romanization: "romanization",
  });
});

test("Migu strategy binary decoding uses SDK bytes and preserves public encoding algorithm", () => {
  const mg = load("mg", "", ["decodeMiguStrategyResponse"]);
  mg.plugin.operations(sdkFor().sdk);
  const text = JSON.stringify({ url: "https://audio.test/song.mp3", toneFlag: "HQ" });
  const key = Buffer.from("Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP");
  const offset = 17;
  const encrypted = Buffer.from(
    Buffer.from(text).map((value, index) => (value - offset + key[index % key.length] + 256) % 256),
  );
  const payload = Buffer.concat([Buffer.from([0xab, 0xcd, 1, offset]), encrypted]);
  assert.deepEqual(
    plain(mg.context.vectors.decodeMiguStrategyResponse([...payload])),
    JSON.parse(text),
  );
});

test("Bilibili native DASH resolution signs WBI with SDK crypto and preserves cookie and quality", async () => {
  const { plugin } = load("bilibili");
  const { sdk } = sdkFor(
    (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/x/frontend/finger/spi")
        return { code: 0, data: { b_3: "fingerprint" } };
      if (url.pathname === "/x/web-interface/nav")
        return {
          code: 0,
          data: {
            wbi_img: {
              img_url: "https://i.test/7cd084941338484aae1ad9425b84077c.png",
              sub_url: "https://i.test/4932caff0ff746eab6f01bf08b70ac45.png",
            },
          },
        };
      assert.equal(url.pathname, "/x/player/wbi/playurl");
      assert.match(url.searchParams.get("w_rid"), /^[a-f0-9]{32}$/);
      assert.match(request.headers.Cookie, /SESSDATA=session/);
      return {
        code: 0,
        data: {
          timelength: 120000,
          dash: {
            audio: [{ id: 30280, bandwidth: 320000, baseUrl: "https://audio.test/lossy" }],
            flac: { audio: { id: 30251, bandwidth: 1411000, baseUrl: "https://audio.test/flac" } },
          },
        },
      };
    },
    { SESSDATA: "session" },
  );
  const result = await plugin.handlers.media.resolve(
    { entity: { id: "BV123", bvid: "BV123", cid: 123 }, quality: "flac" },
    sdk,
  );
  assert.equal(result.url, "https://audio.test/flac");
  assert.equal(result.quality, "hires");
  assert.equal(result.duration, 120);
});

test("Apple TTML and native key callbacks keep public envelopes and reject foreign key endpoints", async () => {
  const { plugin } = load(
    "am",
    `
const API_URL = "https://apple.test";
async function requestAppleMusicApi(path, body, sdk) {
  return (await sdk.http.request({ url: API_URL + path, method: "POST", body: JSON.stringify(body) })).body;
}
async function requestMusicUrl(item, quality, sdk) { return { code: 200, url: "https://audio.test/master.m3u8", adamId: item.id }; }
`,
  );
  const { sdk } = sdkFor((request) => {
    if (request.url.endsWith("/music/lyric"))
      return {
        code: 200,
        data: { ttml: "<tt>words</tt>", trans: "translated", roma: "romanized" },
      };
    assert.equal(request.url, "https://apple.test/music/key");
    assert.equal(JSON.parse(request.body).musicId, "0");
    return { code: 200, data: { ctx: "context", state: "state" } };
  });
  const lyric = await plugin.handlers.lyrics.get({ entity: { id: "123" } }, sdk);
  assert.equal(lyric.rawLrc, "<tt>words</tt>");
  assert.equal(lyric.format, "ttml");
  const media = await plugin.handlers.media.resolve(
    { entity: { id: "123" }, quality: "flac" },
    sdk,
  );
  assert.equal(media.type, "apple-hls");
  assert.equal(media.url, undefined);
  assert.equal(media.appleMusic.adamId, "123");
  const key = await plugin.handlers.media.license(
    { payload: { uri: "skd://itunes.apple.com/P000000000/s1/e1" } },
    sdk,
  );
  assert.deepEqual(plain(key), { ctx: "context", state: "state" });
  await assert.rejects(
    plugin.handlers.media.license(
      {
        payload: {
          uri: "skd://itunes.apple.com/P000000000/s1/e1",
          keyEndpoint: "https://foreign.test/music/key",
        },
      },
      sdk,
    ),
  );
});
