const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateSourceHandler } = require("../functions/v2-source-handler");
const { SOURCE_CONFIG } = require("../functions/source-config");

function load(id) {
  let source = fs.readFileSync(
    path.join(__dirname, "../plugins/v2", id + ".js"),
    "utf8",
  );
  if (id === "am") {
    source = source.replace(
      "// {{REQUEST_HANDLER}}",
      generateSourceHandler(SOURCE_CONFIG.ikun, "am", "fixture-key", ""),
    );
  }
  const scope = { module: { exports: {} } };
  vm.runInNewContext(source, scope);
  return scope.module.exports.handlers;
}
function sdkFor(respond) {
  const values = new Map();
  return {
    settings: {},
    http: {
      request: async (request) => {
        const value = await respond(request);
        return { status: 200, headers: {}, ...value };
      },
    },
    storage: {
      get: async (key) => values.get(key) || null,
      set: async (key, value) => values.set(key, value),
    },
    bytes: {
      encode: (value, encoding = "utf8") =>
        Buffer.from(value, encoding).toString("hex"),
      decode: (value, encoding = "utf8") =>
        Buffer.from(value, "hex").toString(encoding),
    },
    crypto: {
      randomBytes: (count) => crypto.randomBytes(count).toString("hex"),
      hash: (algorithm, value) =>
        crypto
          .createHash(algorithm)
          .update(Buffer.from(value, "hex"))
          .digest("hex"),
      hmacSha256: (key, value) =>
        crypto
          .createHmac("sha256", Buffer.from(key, "hex"))
          .update(Buffer.from(value, "hex"))
          .digest("hex"),
      aesEncrypt: ({ keyHex, mode, ivHex, dataHex }) => {
        const key = Buffer.from(keyHex, "hex");
        const cipher = crypto.createCipheriv(
          `aes-${key.length * 8}-${mode}`,
          key,
          ivHex ? Buffer.from(ivHex, "hex") : null,
        );
        return Buffer.concat([
          cipher.update(Buffer.from(dataHex, "hex")),
          cipher.final(),
        ]).toString("hex");
      },
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
}
const request = {
  entity: { id: 123, type: "sheet" },
  kind: "music",
  query: "fixture",
  cursor: null,
  limit: 30,
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const invoke = (handlers, id, sdk) =>
  id === "am"
    ? handlers.search(request, sdk)
    : handlers.comments.list(request, sdk);

for (const id of ["am", "wy", "qq", "kg", "kw", "mg", "bilibili"]) {
  test(`${id}: HTTP and network failures cannot become successful empty pages`, async () => {
    for (const failure of [401, 429, 503, "network"]) {
      const sdk = sdkFor(() => {
        if (failure === "network")
          throw new Error("Fixture network unavailable");
        return {
          status: failure,
          body: {
            code: 0,
            data: {},
            hotComments: [],
            comments: [],
            returnCode: "000000",
          },
        };
      });
      await assert.rejects(
        invoke(load(id), id, sdk),
        undefined,
        String(failure),
      );
    }
  });
}

function commentsBody(id) {
  return {
    wy: { code: 200, hotComments: [], hasMore: false },
    qq: { code: 0, req: { code: 0, data: { CommentList: { Comments: [] } } } },
    kg: { list: [] },
    kw: { code: "200", comments: [], comments_counts: 0 },
    mg: { code: "000000", data: { comments: [], commentNums: "0" } },
    bilibili: { code: 0, data: { replies: [], cursor: { is_end: true } } },
  }[id];
}
function commentSdk(id, failure = false) {
  return sdkFor((req) => {
    if (id === "kg" && req.url.includes("/v3/album_audio/audio")) {
      return {
        body: { status: 1, data: [[{ classification: [{ res_id: "123" }] }]] },
      };
    }
    if (id === "bilibili" && req.url.includes("/nav")) {
      return {
        body: {
          code: 0,
          data: {
            wbi_img: {
              img_url: "https://fixture.test/" + "a".repeat(32) + ".png",
              sub_url: "https://fixture.test/" + "b".repeat(32) + ".png",
            },
          },
        },
      };
    }
    return {
      body: failure
        ? { code: -1, status: 0, returnCode: "FAILED" }
        : commentsBody(id),
    };
  });
}
for (const id of ["wy", "qq", "kg", "kw", "mg", "bilibili"]) {
  test(`${id}: service errors fail while confirmed empty comments remain valid`, async () => {
    await assert.rejects(invoke(load(id), id, commentSdk(id, true)));
    assert.deepEqual(plain(await invoke(load(id), id, commentSdk(id))), {
      items: [],
      nextCursor: null,
      ...(id === "mg" ? { total: 0 } : {}),
    });
  });
}
for (const id of ["wy", "kg", "mg"]) {
  test(`${id}: unavailable collection metadata cannot publish an empty snapshot`, async () => {
    await assert.rejects(
      load(id).collections.members(
        request,
        sdkFor(() => ({ status: 401, body: {} })),
      ),
    );
    await assert.rejects(
      load(id).collections.members(
        request,
        sdkFor(() => ({ body: { code: -1, status: 0 } })),
      ),
    );
  });
}
test("NetEase final song-details failure cannot become an empty final collection page", async () => {
  const sdk = sdkFor((req) =>
    req.url.includes("/playlist/detail")
      ? {
          body: {
            code: 200,
            playlist: { trackCount: 1, trackIds: [{ id: 1 }] },
          },
        }
      : { status: 503, body: {} },
  );
  await assert.rejects(load("wy").collections.members(request, sdk));
});
test("QQ song identity lookup failure cannot become empty comments", async () => {
  await assert.rejects(
    load("qq").comments.list(
      { ...request, entity: { id: "mid", songmid: "mid" } },
      sdkFor(() => ({ status: 401 })),
    ),
  );
});
test("Migu album retries fail clearly and confirmed empty albums remain valid", async () => {
  const album = {
    ...request,
    entity: { id: 123, type: "album", title: "Album", artist: "Artist" },
  };
  await assert.rejects(
    load("mg").collections.members(
      album,
      sdkFor(() => ({ status: 503 })),
    ),
  );
  const page = await load("mg").collections.members(
    album,
    sdkFor(() => ({ body: { songList: [] } })),
  );
  assert.deepEqual(plain(page.items), []);
  assert.equal(page.nextCursor, null);
});
test("Kugou discovery preserves an available fallback and rejects failure of both sources", async () => {
  await assert.rejects(
    load("kg").discovery.playlists(
      request,
      sdkFor(() => ({ status: 503 })),
    ),
  );
  const page = await load("kg").discovery.playlists(
    request,
    sdkFor((req) =>
      req.method === "POST" ? { status: 503 } : { body: { special_db: [] } },
    ),
  );
  assert.deepEqual(plain(page), { items: [], nextCursor: null });
});
test("Bilibili chart fallback rejects a total outage and retains a successful retry", async () => {
  const chart = {
    ...request,
    entity: { id: "ranking/v2?rid=3", type: "chart" },
  };
  await assert.rejects(
    load("bilibili").collections.members(
      chart,
      sdkFor(() => ({ status: 503 })),
    ),
  );
  let attempts = 0;
  const page = await load("bilibili").collections.members(
    chart,
    sdkFor((req) => {
      if (req.url.includes("/nav")) return { status: 503 };
      attempts += 1;
      return { body: { code: 0, data: { list: [] } } };
    }),
  );
  assert.ok(attempts > 0);
  assert.deepEqual(plain(page.items), []);
  assert.equal(page.nextCursor, null);
});
for (const id of ["am", "wy", "qq", "kg", "kw", "mg", "bilibili"]) {
  test(`${id}: cursors reject changed request, typed identity and account before fetching`, async () => {
    // Supply a deterministic upstream page while exercising the real public
    // handler wrapper and pager, without depending on unrelated service formats.
    let source = fs.readFileSync(
      path.join(__dirname, "../plugins/v2", id + ".js"),
      "utf8",
    );
    source = source.replace(
      "bindPageHandlers();",
      `
      handlers.search = async (request) => pageResult({ data: [{id:1},{id:2},{id:3}], isEnd:true }, request);
      handlers.collections.members = async (request) => pageResult({ data: [{id:1},{id:2},{id:3}], isEnd:true }, request);
      bindPageHandlers();`,
    );
    const scope = { module: { exports: {} } };
    vm.runInNewContext(source, scope);
    const handlers = scope.module.exports.handlers;
    const sdk = sdkFor(() => {
      throw new Error("Unexpected HTTP request");
    });
    sdk.settings = { account: "private-credential" };
    const initial = {
      ...request,
      limit: 1,
      tag: { id: "tag", digest: "10000", title: "Label" },
      sort: "newest",
    };
    const first = await handlers.search(initial, sdk);
    assert.ok(first.nextCursor.length < 2048);
    assert.doesNotMatch(first.nextCursor, /private-credential|fixture|newest/);
    const second = await handlers.search(
      { ...initial, cursor: first.nextCursor, limit: 2 },
      sdk,
    );
    assert.deepEqual(plain(second.items), [{ id: 2 }, { id: 3 }]);
    for (const changed of [
      { query: "other" },
      { kind: "album" },
      { entity: { id: "123", type: "sheet" } },
      { entity: { id: 456, type: "sheet" } },
      { tag: { id: "other" } },
      { tag: { id: "tag", digest: "other" } },
      { sort: "oldest" },
      { accountRevision: "changed" },
      { sourceRevision: "changed" },
    ]) {
      await assert.rejects(
        handlers.search(
          { ...initial, ...changed, cursor: first.nextCursor },
          sdk,
        ),
        /cursor/,
      );
    }
    await assert.rejects(
      handlers.collections.members(
        { ...initial, cursor: first.nextCursor },
        sdk,
      ),
      /cursor/,
    );
    sdk.settings.account = "different-account";
    await assert.rejects(
      handlers.search({ ...initial, cursor: first.nextCursor }, sdk),
      /cursor/,
    );
    await assert.rejects(
      handlers.search(
        {
          ...initial,
          cursor: "v2:%7B%22upstreamPage%22%3A1%2C%22offset%22%3A1%7D",
        },
        sdk,
      ),
      /cursor/,
    );
  });
}
test("Apple album browsing fetches one upstream page and reaches the exact final track", async () => {
  const calls = [];
  const sdk = sdkFor((req) => {
    const body = JSON.parse(req.body);
    calls.push(body.page);
    assert.equal(body.limit, 100);
    const begin = (body.page - 1) * 100;
    return {
      body: {
        code: 200,
        hasNext: body.page < 3,
        data: Array.from({ length: Math.min(100, 205 - begin) }, (_, i) => ({
          id: String(begin + i + 1),
          name: "Track",
        })),
      },
    };
  });
  const handlers = load("am");
  const album = { ...request, entity: { id: "123", type: "album" }, limit: 30 };
  let cursor = null;
  const ids = [];
  do {
    const before = calls.length;
    const page = await handlers.collections.members({ ...album, cursor }, sdk);
    assert.equal(calls.length, before + 1, "one source page per host call");
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    ids,
    Array.from({ length: 205 }, (_, i) => String(i + 1)),
  );
  assert.deepEqual(calls, [1, 1, 1, 1, 2, 2, 2, 2, 3]);
});
test("NetEase ordinary chart browsing fetches only one bounded song-details page", async () => {
  const details = [];
  const sdk = sdkFor((req) => {
    if (req.url.includes("/playlist/detail"))
      return {
        body: {
          code: 200,
          playlist: {
            trackCount: 205,
            trackIds: Array.from({ length: 205 }, (_, i) => ({ id: i + 1 })),
          },
        },
      };
    if (req.url.includes("/weapi/v3/song/detail")) {
      // The request is encrypted; capture the exact IDs at the encryption
      // boundary below, while returning realistic source song metadata.
      return {
        body: {
          code: 200,
          songs: details
            .at(-1)
            .map((id) => ({ id, name: "Track", ar: [], al: {} })),
          privileges: [],
        },
      };
    }
    return { body: { code: 200, data: [] } };
  });
  const originalEncrypt = sdk.crypto.aesEncrypt;
  sdk.crypto.aesEncrypt = (options) => {
    const text = Buffer.from(options.dataHex, "hex").toString("utf8");
    if (text.startsWith('{"c":'))
      details.push(JSON.parse(JSON.parse(text).ids));
    return originalEncrypt(options);
  };
  const handlers = load("wy");
  const chart = { ...request, entity: { id: "123", type: "chart" }, limit: 30 };
  const ids = [];
  let cursor = null;
  do {
    const before = details.length;
    const page = await handlers.collections.members({ ...chart, cursor }, sdk);
    assert.equal(details.length, before + 1);
    assert.ok(details.at(-1).length <= 40);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    ids,
    Array.from({ length: 205 }, (_, i) => i + 1),
  );
});
for (const identity of ["gcid_abcdef123", "collection_1_2_3_4"]) {
  test(`Kugou ordinary ${identity} browsing requests one source page at a time`, async () => {
    const calls = [];
    const sdk = sdkFor((req) => {
      if (req.url.includes("batch_decode"))
        return {
          body: {
            status: 1,
            data: { list: [{ global_collection_id: "collection_1_2_3_4" }] },
          },
        };
      if (req.url.includes("get_other_list_file_nofilt")) {
        const url = new URL(req.url);
        const begin = Number(url.searchParams.get("begin_idx"));
        assert.equal(url.searchParams.get("pagesize"), "100");
        calls.push(begin);
        return {
          body: {
            status: 1,
            data: {
              count: 205,
              list_info: { name: "Collection" },
              songs: Array.from(
                { length: Math.min(100, 205 - begin) },
                (_, i) => ({
                  hash: "hash" + (begin + i),
                  name: "Singer - Track",
                }),
              ),
            },
          },
        };
      }
      return { body: { status: 1, data: [] } };
    });
    const handlers = load("kg");
    const sheet = {
      ...request,
      entity: { id: identity, type: "sheet" },
      limit: 30,
    };
    const ids = [];
    let cursor = null;
    do {
      const before = calls.length;
      const page = await handlers.collections.members(
        { ...sheet, cursor },
        sdk,
      );
      assert.equal(calls.length, before + 1);
      assert.equal(page.total, 205);
      assert.equal(page.entity.id, identity);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(
      ids,
      Array.from({ length: 205 }, (_, i) => "hash" + i),
    );
    assert.deepEqual(calls, [0, 0, 0, 0, 100, 100, 100, 100, 200]);
  });
}
test("Kugou bounded collection pages distinguish confirmed empty, failed and truncated source pages", async () => {
  const sheet = {
    ...request,
    entity: { id: "collection_1_2_3_4", type: "sheet" },
  };
  for (const response of [
    { status: 503, body: {} },
    { body: { status: 0, data: { songs: [] } } },
    { body: { status: 1, data: { count: 10, songs: [] } } },
    {
      body: {
        status: 1,
        data: { songs: Array(101).fill({ hash: "hash", name: "Track" }) },
      },
    },
  ]) {
    await assert.rejects(
      load("kg").collections.members(
        sheet,
        sdkFor(() => response),
      ),
    );
  }
  const page = await load("kg").collections.members(
    sheet,
    sdkFor(() => ({ body: { status: 1, data: { count: 0, songs: [] } } })),
  );
  assert.deepEqual(plain(page.items), []);
  assert.equal(page.nextCursor, null);
  assert.equal(page.total, 0);
});
test("Migu artist music preserves continuation and rejects failed or malformed pages", async () => {
  const artist = {
    ...request,
    entity: { id: 123, type: "artist" },
    kind: "music",
    limit: 1,
  };
  for (const body of [
    { code: "FAILED" },
    { code: "000000", data: {} },
    { code: "000000", data: { contentItemList: [{}] } },
  ]) {
    await assert.rejects(
      load("mg").collections.members(
        artist,
        sdkFor(() => ({ body })),
      ),
    );
  }
  for (const explicit of [true, false]) {
    const calls = [];
    const sdk = sdkFor((req) => {
      const page = Number(new URL(req.url).searchParams.get("pageNumber"));
      calls.push(page);
      return {
        body: {
          code: "000000",
          data: {
            totalCount: 3,
            ...(explicit ? { hasNext: page < 2 } : {}),
            contentItemList: [
              {
                itemList: (page === 1 ? [1, 2] : page === 2 ? [3] : []).map(
                  (id) => ({ song: { songId: id, songName: "Track" } }),
                ),
              },
            ],
          },
        },
      };
    });
    const handlers = load("mg");
    let cursor = null;
    const ids = [];
    do {
      const before = calls.length;
      const page = await handlers.collections.members(
        { ...artist, cursor },
        sdk,
      );
      assert.equal(calls.length, before + 1);
      assert.equal(page.total, 3);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, [1, 2, 3]);
    assert.deepEqual(calls, explicit ? [1, 1, 2] : [1, 1, 2, 3]);
  }
});
