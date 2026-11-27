const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const os = require("node:os");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

// Exact public implementation immediately before the independent V2 port.
const baseline = "20bfcc9a6cc6e2709a6256a7ced53a599e35fa34";
const root = path.join(__dirname, "..");
const ids = ["wy", "qq", "kg", "kw", "mg", "bilibili"];
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixtures = {
  wy: {
    categories: { 0: "Language", 1: "Mood" },
    sub: [
      { name: "Chinese", hot: true, category: 0 },
      { name: "English", category: 0 },
      { name: "Quiet", hot: true, category: 1 },
    ],
  },
  qq: { data: { categories: [
    { categoryGroupName: "Ignored", items: [] },
    { categoryGroupName: "Language", items: [
      { categoryId: 42, categoryName: "Chinese" },
      { categoryId: "42", categoryName: "English" },
    ] },
    { categoryGroupName: "Mood", items: [{ categoryId: 9, categoryName: "Quiet" }] },
  ] } },
  kg: { data: { tagids: {
    Style: { data: [{ id: 42, name: "Rock" }, { id: 43, name: "Jazz" }] },
    Mood: { data: [{ id: 9, name: "Quiet" }] },
  } } },
  kw: { data: [
    { name: "Style", data: [
      { id: "1848", name: "Featured", digest: "10000" },
      { id: 42, name: "Jazz", digest: "13" },
    ] },
    { name: "Mood", data: [{ id: "007", name: "Quiet", digest: "13" }] },
  ] },
  mg: { code: "000000", data: [
    { content: [{ texts: ["Hot", "hot"] }, { texts: ["Quiet", "007"] }] },
    { header: { title: "Style" }, content: [
      { texts: ["Hot", "hot"] }, { texts: ["Jazz", "jazz"] },
    ] },
    { header: { title: "Mood" }, content: [{ texts: ["Quiet", "007"] }] },
  ] },
  bilibili: {},
};

function legacyTags(id) {
  const source = execFileSync("git", ["show", `${baseline}:plugins/${id}.js`], {
    cwd: root, encoding: "utf8",
  });
  const request = async () => ({ data: fixtures[id] });
  request.get = request;
  request.post = request;
  request.default = request;
  const context = {
    module: { exports: {} }, exports: {}, UPDATE_URL: "", Buffer,
    console: { log() {}, error() {}, warn() {} },
    require(name) {
      if (name === "axios") return request;
      if (name === "buffer") return { Buffer };
      if (name === "qs") return { stringify: JSON.stringify };
      if (name === "crypto-js") return { MD5: (value) => ({ toString: () => crypto.createHash("md5").update(value).digest("hex") }) };
      return {};
    },
  };
  vm.runInNewContext(source + (id === "wy" ? "\ngetParamsAndEnc = () => ({});" : ""), context);
  return context.module.exports.getRecommendSheetTags();
}

function provider(id, overrides = {}) {
  let source = fs.readFileSync(path.join(root, "plugins/v2", id + ".js"), "utf8");
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join("\n");
  source = source.replace(/return \{\s*search,/, assignments + "\nreturn { search,");
  if (id === "wy") source = source.replace(/return \{\s*search,/, "getParamsAndEnc = () => ({});\nreturn { search,");
  const context = { module: { exports: {} }, overrides };
  vm.runInNewContext(source + "\nmodule.exports.tagResult = tagResult;", context);
  return context.module.exports;
}

const sdkFor = (id) => ({
  settings: {},
  bytes: {
    encode: (value, encoding = "utf8") => Buffer.from(value, encoding).toString("hex"),
    decode: (value, encoding = "utf8") => Buffer.from(value, "hex").toString(encoding),
  },
  crypto: { hash: (algorithm, value) => crypto.createHash(algorithm).update(Buffer.from(value, "hex")).digest("hex") },
  log: { debug() {}, info() {}, warn() {}, error() {} },
  http: { request: async () => ({ status: 200, headers: {}, body: fixtures[id] }) },
});

async function allTags(plugin, sdk, limit) {
  const items = [];
  let pinned;
  const seen = new Set();
  let cursor = null;
  do {
    const page = await plugin.handlers.discovery.playlistTags({ cursor, limit }, sdk);
    assert.ok(page.items.length <= limit);
    if (cursor === null) pinned = plain(page.pinned);
    else assert.equal(page.pinned, undefined);
    items.push(...plain(page.items));
    cursor = page.nextCursor;
    if (cursor !== null) {
      assert.ok(page.items.length > 0);
      assert.ok(!seen.has(cursor));
      seen.add(cursor);
    }
  } while (cursor !== null);
  return { items, pinned };
}

for (const id of ids) {
  test(`${id} V2 retains every pre-V2 group, pinned selection and tag metadata across pages`, async () => {
    const legacy = plain(await legacyTags(id));
    const { items, pinned } = await allTags(provider(id), sdkFor(id), 1);
    assert.deepEqual(pinned, legacy.pinned);
    assert.deepEqual(items, legacy.data.flatMap((group) =>
      group.data.map((tag) => ({ ...tag, group: group.title })),
    ));
  });

  test(`${id} category selection passes its opaque filter unchanged to playlist loading`, async () => {
    const tag = { id: "007", title: "Quiet", digest: "10000", group: "Mood", pinned: true, custom: { token: 9 } };
    let received;
    const plugin = provider(id, {
      getRecommendSheetsByTag: async (...args) => {
        received = args;
        return { isEnd: true, data: [] };
      },
    });
    await plugin.handlers.discovery.playlists({ tag, limit: 3, cursor: null }, sdkFor(id));
    assert.deepEqual(plain(received), [tag, 1]);
  });
}

test("playlist tags preserve independent pin and category orders, typed IDs and opaque metadata", () => {
  const input = {
    pinned: [
      { id: "007", title: "Quiet", custom: { token: 7 } },
      { id: "42", title: "String" }, { id: "outside", title: "Outside" },
      { id: 42, title: "Numeric" },
    ],
    data: [
      { title: "Language", data: [{ id: 42, title: "Numeric", digest: "13", custom: { token: 42 } }, { id: "42", title: "String" }] },
      { title: "Mood", data: [{ id: "007", title: "Quiet", custom: true }] },
    ],
  };
  const snapshot = plain(input);
  for (const id of ids) {
    const plugin = provider(id);
    const tags = [];
    let cursor = null;
    do {
      const page = plugin.tagResult(input, { cursor, limit: 1 });
      if (cursor === null) assert.deepEqual(plain(page.pinned), input.pinned, id);
      else assert.equal(page.pinned, undefined, id);
      tags.push(...plain(page.items));
      cursor = page.nextCursor;
    } while (cursor !== null);
    assert.deepEqual(tags, [
      { id: 42, title: "Numeric", digest: "13", custom: { token: 42 }, group: "Language" },
      { id: "42", title: "String", group: "Language" },
      { id: "007", title: "Quiet", custom: true, group: "Mood" },
    ], id);
  }
  assert.deepEqual(input, snapshot);
});

test("pin-only and empty categories terminate in one page without losing pin metadata", () => {
  for (const id of ids) {
    const plugin = provider(id);
    for (const pinned of [[], [{ id: "outside", title: "Outside", digest: "10000" }]]) {
      const result = plain(plugin.tagResult({ data: [], pinned }, { limit: 1 }));
      assert.deepEqual(result, { items: [], nextCursor: null, total: 0, pinned }, id);
    }
    assert.deepEqual(plain(plugin.tagResult([{ id: 42 }], { limit: 1 })), {
      items: [{ id: 42 }], nextCursor: null, total: 1,
    }, id);
  }
});

test("draft paging helper and maintained providers share the tag adapter without changing chart flattening", () => {
  const template = fs.readFileSync(path.join(root, "plugins/v2/paging.txt"), "utf8");
  const helper = template.slice(template.indexOf("function tagResult("), template.indexOf("function dailyResult("));
  for (const id of ids) {
    const source = fs.readFileSync(path.join(root, "plugins/v2", id + ".js"), "utf8");
    assert.ok(source.includes(helper), id);
    assert.match(source, /charts: async \(request, sdk\) => sliceResult/);
    assert.match(source, /playlistTags: async \(request, sdk\) => tagResult/);
  }
});

test("native QuickJS preserves tag pins, typed IDs and filters through the V2 host", {
  skip: !process.env.BAKA_V2_PROBE,
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "baka-v2-tag-metadata-"));
  const input = {
    pinned: [{ id: "42", title: "String" }, { id: 42, title: "Numeric" }, { id: "outside", title: "Outside" }],
    data: [{ title: "Style", data: [{ id: 42, title: "Numeric", digest: "13" }, { id: "42", title: "String" }, { id: "007", title: "Quiet" }] }],
  };
  try {
    for (const id of ids) {
      const file = path.join(directory, id + ".js");
      let source = fs.readFileSync(path.join(root, "plugins/v2", id + ".js"), "utf8");
      source = source.replace(/return \{\s*search,/, `getRecommendSheetTags = async () => (${JSON.stringify(input)});\ngetRecommendSheetsByTag = async (tag) => ({isEnd:true,data:[tag]});\nreturn { search,`);
      fs.writeFileSync(file, source);
      const requestFile = path.join(directory, "request.json");
      const resultFile = path.join(directory, "result.json");
      const items = [];
      let pinned;
      let cursor = null;
      do {
        fs.writeFileSync(requestFile, JSON.stringify({ cursor, limit: 1 }));
        await run(process.env.BAKA_V2_PROBE, [file, "discovery.playlistTags", requestFile], {
          env: { ...process.env, BAKA_PROVIDER_RESULT_FILE: resultFile },
        });
        const page = JSON.parse(fs.readFileSync(resultFile, "utf8"));
        assert.equal(page.items.length, 1);
        if (cursor === null) pinned = page.pinned;
        else assert.equal(page.pinned, undefined, id);
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null);
      assert.deepEqual(items.map((item) => item.id), [42, "42", "007"], id);
      assert.deepEqual(pinned, input.pinned, id);
      assert.equal(items[0].digest, "13");
      assert.equal(items[0].group, "Style");
      fs.writeFileSync(requestFile, JSON.stringify({ tag: items[0], cursor: null, limit: 1 }));
      await run(process.env.BAKA_V2_PROBE, [file, "discovery.playlists", requestFile], {
        env: { ...process.env, BAKA_PROVIDER_RESULT_FILE: resultFile },
      });
      assert.deepEqual(JSON.parse(fs.readFileSync(resultFile, "utf8")).items, [items[0]]);
    }
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
