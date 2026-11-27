const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ids = ["am", "wy", "qq", "kg", "kw", "mg", "bilibili"];

function load(id, overrides = {}, injected = "") {
  let source = fs.readFileSync(path.join(__dirname, "../plugins/v2", id + ".js"), "utf8");
  source = source.replace("// {{REQUEST_HANDLER}}", injected);
  const assignments = Object.keys(overrides)
    .map((name) => `${name} = overrides.${name};`)
    .join("\n");
  source = source.replace(/return \{\s*search,/, `${assignments}\nreturn { search,`);
  const context = { module: { exports: {} }, overrides };
  vm.runInNewContext(source, context);
  return context.module.exports;
}
function sdk(
  respond = () => {
    throw new Error("Unexpected HTTP");
  },
) {
  return {
    settings: {},
    log: { error() {}, warn() {}, info() {}, debug() {} },
    bytes: {
      encode: (value, encoding = "utf8") => Buffer.from(value, encoding).toString("hex"),
      decode: (value, encoding = "utf8") => Buffer.from(value, "hex").toString(encoding),
    },
    crypto: {
      hash: (algorithm, value) =>
        crypto.createHash(algorithm).update(Buffer.from(value, "hex")).digest("hex"),
      randomBytes: (count) => crypto.randomBytes(count).toString("hex"),
    },
    text: { decodeHtml: (text) => String(text).replace(/&amp;/g, "&") },
    http: {
      request: async (request) => ({ status: 200, headers: {}, body: await respond(request) }),
    },
  };
}

test("public V2 dispatches native kind and legacy type to their own album/artist/chart operations", async () => {
  for (const id of ids) {
    let calls = [];
    const names =
      id === "am"
        ? ["getAlbumInfo", "getArtistWorks"]
        : ["getAlbumInfo", "getArtistWorks", "getTopListDetail", "getMusicSheetInfo"];
    const overrides = Object.fromEntries(
      names.map((name) => [
        name,
        async (...args) => {
          calls.push({ name, args });
          return { isEnd: true, musicList: [{ id: name }], title: name };
        },
      ]),
    );
    const plugin = load(id, overrides),
      host = sdk();
    for (const field of ["kind", "type"]) {
      for (const [kind, operation] of [
        ["artist", "getArtistWorks"],
        ["album", "getAlbumInfo"],
        ...(id === "am"
          ? []
          : [
              ["chart", "getTopListDetail"],
              ["playlist", "getMusicSheetInfo"],
            ]),
      ]) {
        calls = [];
        const entity = { id: "same-id", [field]: kind };
        const result = await plugin.handlers.collections.members(
          { entity, kind: "music", limit: 10 },
          host,
        );
        assert.equal(calls[0].name, operation, `${id}/${field}/${kind}`);
        assert.equal(result.items[0].id, operation);
        if (kind === "chart") {
          calls = [];
          const metadata = await plugin.handlers.collections.get({ entity }, host);
          assert.equal(calls[0].name, operation, `${id}/${field}/chart metadata`);
          assert.equal(metadata.title, operation);
          assert.equal(metadata.musicList, undefined);
        }
      }
    }
  }
});

test("public collection cursors bind normalized entity kind and reject same-ID cross-kind replay", async () => {
  for (const id of ids) {
    const rows = async () => ({ isEnd: true, musicList: [{ id: 1 }, { id: 2 }] });
    const plugin = load(id, { getAlbumInfo: rows, getArtistWorks: rows });
    const host = sdk();
    const request = { entity: { id: "same", kind: "album" }, kind: "music", limit: 1 };
    const first = await plugin.handlers.collections.members(request, host);
    assert.ok(first.nextCursor);
    await assert.rejects(
      plugin.handlers.collections.members(
        { ...request, entity: { id: "same", kind: "artist" }, cursor: first.nextCursor },
        host,
      ),
      /does not match/,
      id,
    );
    const next = await plugin.handlers.collections.members(
      { ...request, entity: { id: "same", type: "album" }, cursor: first.nextCursor },
      host,
    );
    assert.equal(next.items[0].id, 2, id);
  }
});

test("WY chart HTML retains public headings, order, artwork and descriptions", async () => {
  const html = `<div class="outside"><h2>Ignored</h2></div><div class="n-minelst n-minelst-2">
    <h2>Official &amp; rising</h2><ul><li data-res-id="1"><a><img src="https://img/one.jpg?param=40y40"></a><p class="name"><a>First &amp; best</a></p><p class="s-fc4">Daily</p></li></ul>
    <h2>Global</h2><ul><li data-res-id='2'><img src='https://img/two.jpg'><p class='name'>Second</p><p class='s-fc4'>Weekly</p></li></ul></div><h2>Ignored tail</h2>`;
  const plugin = load("wy");
  const host = sdk((request) => {
    assert.equal(request.url, "https://music.163.com/discover/toplist");
    assert.equal(request.responseType, "text");
    return html;
  });
  const page = await plugin.handlers.discovery.charts({ limit: 100 }, host);
  assert.deepEqual(JSON.parse(JSON.stringify(page.items)), [
    {
      id: "1",
      title: "First & best",
      coverImg: "https://img/one.jpg?param=800y800",
      artwork: "https://img/one.jpg?param=800y800",
      description: "Daily",
      group: "Official & rising",
    },
    {
      id: "2",
      title: "Second",
      coverImg: "https://img/two.jpg",
      artwork: "https://img/two.jpg",
      description: "Weekly",
      group: "Global",
    },
  ]);
});

test("Migu imports only public row.J_CopySong members rather than unrelated data-cid", async () => {
  const plugin = load("mg");
  let seenIds;
  const host = sdk((request) => {
    if (request.url.includes("query_playlist_by_id_tag"))
      return { rsp: { playList: [{ contentCount: "1", playListName: "Fixture" }] } };
    if (request.url.includes("/playlist/"))
      return `<div data-cid="wrong"></div><script><div class="row J_CopySong" data-cid="script"></div></script><!-- <div class="row J_CopySong" data-cid="comment"></div> --><div data-cid="right" class="J_CopySong extra row"></div>`;
    if (request.url.includes("/audioPlayer/songs")) {
      seenIds = request.url.split("copyrightId=")[1];
      return { items: [{ copyrightId: "right", name: "Song", artists: [], albums: [] }] };
    }
    throw new Error(request.url);
  });
  const entity = await plugin.handlers.links.resolve({ url: "123" }, host);
  assert.equal(seenIds, "right");
  const page = await plugin.handlers.collections.members(
    { entity, kind: "music", limit: 10 },
    host,
  );
  assert.equal(page.items.length, 1);
});

test("Bilibili track import is reachable through native entities and explicit links while default links stay collections", async () => {
  const calls = [];
  const plugin = load("bilibili", {
    importMusicItem: async (input) => {
      calls.push(["track", input]);
      return { id: "track" };
    },
    getMusicInfo: async (input) => {
      calls.push(["metadata", input]);
      return input;
    },
    importMusicSheet: async (input) => {
      calls.push(["collection", input]);
      return { id: "collection", musicList: [{ id: "track" }] };
    },
  });
  const host = sdk(),
    url = "https://www.bilibili.com/video/BV1234567890";
  await plugin.handlers.entities.get({ entity: { id: url, kind: "music" } }, host);
  assert.equal(calls.pop()[0], "track");
  const existing = { id: "BV1234567890", kind: "music", cid: 5, artwork: "retained" };
  assert.equal((await plugin.handlers.entities.get({ entity: existing }, host)).cid, 5);
  assert.equal(calls.pop()[0], "metadata");
  await plugin.handlers.links.resolve({ url, type: "music" }, host);
  assert.equal(calls.pop()[0], "track");
  await plugin.handlers.links.resolve({ url, kind: "track" }, host);
  assert.equal(calls.pop()[0], "track");
  await plugin.handlers.links.resolve({ url }, host);
  assert.equal(calls.pop()[0], "collection");
  await plugin.handlers.links.resolve({ url: "av123" }, host);
  assert.equal(calls.pop()[0], "collection");
});

test(
  "native QuickJS runs restored WY HTML groups and Bilibili URL track import",
  { skip: !process.env.BAKA_V2_PROBE },
  async () => {
    const http = require("node:http");
    const os = require("node:os");
    const { promisify } = require("node:util");
    const run = promisify(require("node:child_process").execFile);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "baka-public-parity-"));
    const server = http.createServer((request, response) => {
      if (request.url.includes("/discover/toplist")) {
        response.end(
          '<div class="n-minelst"><h2>Native group</h2><ul><li data-res-id="1"><img src="https://img/cover.jpg"><p class="name">Native chart</p></li></ul></div>',
        );
      } else {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            code: 0,
            data: request.url.includes("/view")
              ? {
                  bvid: "BV1234567890",
                  aid: 123,
                  cid: 456,
                  title: "Native track",
                  owner: { name: "Fixture" },
                  pages: [{ cid: 456 }],
                }
              : { dash: { audio: [] } },
          }),
        );
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const endpoint = `http://127.0.0.1:${server.address().port}`;
      for (const [id, operation, request] of [
        ["wy", "discovery.charts", { limit: 100 }],
        [
          "bilibili",
          "entities.get",
          { entity: { id: "https://www.bilibili.com/video/BV1234567890", kind: "music" } },
        ],
      ]) {
        const source = fs
          .readFileSync(path.join(__dirname, "../plugins/v2", id + ".js"), "utf8")
          .replaceAll("https://music.163.com", endpoint)
          .replaceAll("https://api.bilibili.com", endpoint);
        const pluginFile = path.join(directory, id + ".js");
        const requestFile = path.join(directory, "request.json"),
          resultFile = path.join(directory, "result.json");
        fs.writeFileSync(pluginFile, source);
        fs.writeFileSync(requestFile, JSON.stringify(request));
        await run(process.env.BAKA_V2_PROBE, [pluginFile, operation, requestFile], {
          env: { ...process.env, BAKA_PROVIDER_RESULT_FILE: resultFile },
        });
        const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
        if (id === "wy") assert.equal(result.items[0].group, "Native group");
        else assert.equal(result.bvid, "BV1234567890");
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("public media resolution keeps WY/QQ quality guards, KG quality hashes and KW fallback", async () => {
  const injection = `async function requestMusicUrl(item, quality) { return { url: 'https://audio/' + item.id, quality, ekey: 'retained' }; }`;
  for (const id of ["wy", "qq"]) {
    const plugin = load(id, {}, injection);
    await assert.rejects(
      plugin.handlers.media.resolve(
        { entity: { id: "song", qualities: { "128k": {} } }, quality: "flac" },
        sdk(),
      ),
      /flac/,
    );
    assert.equal(
      (await plugin.handlers.media.resolve({ entity: { id: "song" }, quality: "flac" }, sdk()))
        .ekey,
      "retained",
    );
  }
  const kg = load("kg", {}, injection);
  assert.equal(
    (
      await kg.handlers.media.resolve(
        { entity: { id: "base", sqhash: "lossless" }, quality: "flac" },
        sdk(),
      )
    ).url,
    "https://audio/lossless",
  );
  assert.equal(
    (
      await kg.handlers.media.resolve(
        { entity: { id: "base", "320hash": "high" }, quality: "320k" },
        sdk(),
      )
    ).url,
    "https://audio/high",
  );
  const kw = load("kw", {}, injection);
  assert.equal(
    (await kw.handlers.media.resolve({ entity: { id: "MUSIC_123" }, quality: "128k" }, sdk())).url,
    "https://audio/123",
  );
  const stringKw = load(
    "kw",
    {},
    'async function requestMusicUrl(item) { return "https://audio/" + item.id; }',
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await stringKw.handlers.media.resolve(
          { entity: { id: "MUSIC_456" }, quality: "320k" },
          sdk(),
        ),
      ),
    ),
    { url: "https://audio/456", quality: "320k" },
  );
  assert.equal(
    (
      await kw.handlers.media.resolve(
        { entity: { id: "song", qualities: { flac: {}, "320k": {} } }, quality: "master" },
        sdk(),
      )
    ).quality,
    "flac",
  );
});
