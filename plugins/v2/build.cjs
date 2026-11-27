/* Development-only static port of the public V1 protocol implementations.
 * Distributed files contain direct V2 handlers and SDK calls, never a V1 module.
 * Draft migration only. Maintained V2 providers are the source of truth.
 * Set BAKA_V2_DRAFT_DIR to a separate directory; never overwrite live templates.
 */
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const fakeCrypto = { MD5: () => ({ toString: () => "0".repeat(32) }) };
function exportsOf(source) {
  const context = {
    module: { exports: {} },
    exports: {},
    UPDATE_URL: "",
    Buffer,
    require: (name) => (name === "crypto-js" ? fakeCrypto : name === "buffer" ? { Buffer } : {}),
    console,
  };
  vm.runInNewContext(source, context);
  return context.module.exports;
}
function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const declaration = start >= 6 && source.slice(start - 6, start) === "async " ? start - 6 : start;
  // Function source from the original module is used below where available.
  const fn = currentExports[name] || vmFunctions[name];
  if (!fn) throw new Error(`Cannot extract ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  const nextAsync = source.indexOf("\nasync function ", start + 1);
  const end = Math.min(...[next, nextAsync].filter((n) => n >= 0));
  return source.slice(0, declaration) + replacement + "\n" + source.slice(end);
}
let currentExports, vmFunctions;
const primitiveSource = fs.readFileSync(path.join(__dirname, "sdk-primitives.txt"), "utf8");
// Set BAKA_PRETTIER_MODULE to an existing Prettier package entry when rebuilding.
// No package installation or runtime dependency is introduced by the static port.
async function writeProvider(filename, source) {
  if (process.env.BAKA_PRETTIER_MODULE) {
    const prettier = require(process.env.BAKA_PRETTIER_MODULE);
    source = await prettier.format(source, {
      parser: "babel",
      tabWidth: 2,
      printWidth: 100,
      singleQuote: false,
      endOfLine: "lf",
    });
  }
  fs.writeFileSync(filename, source);
}
async function build() {
  const draftDir = process.env.BAKA_V2_DRAFT_DIR;
  if (!draftDir)
    throw new Error(
      "Set BAKA_V2_DRAFT_DIR: V1 migration emits drafts only; maintained V2 providers must not be overwritten",
    );
  const outputDir = path.resolve(draftDir);
  if (outputDir.toLowerCase() === __dirname.toLowerCase())
    throw new Error("Draft output must not overwrite maintained V2 providers");
  fs.mkdirSync(outputDir, { recursive: true });
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["am", "wy", "qq", "kg", "kw", "mg", "bilibili"];
  for (const id of ids) {
    let source = fs.readFileSync(path.join(root, `${id}.js`), "utf8").replace(/\r\n/g, "\n");
    const original = source;
    currentExports = exportsOf(source);
    if (id === "am") {
      const metadata = {
        apiVersion: 2,
        kind: "provider",
        sourceId: "am.v1",
        id: "cc.baka.am",
        name: currentExports.platform,
        version: "1.0.0",
        author: currentExports.author,
        description: currentExports.description,
        primaryKey: currentExports.primaryKey,
        supportedSearchType: currentExports.supportedSearchType,
        supportedQualities: currentExports.supportedQualities,
        capabilities: [
          "search",
          "collections.get",
          "collections.members",
          "media.prepare",
          "media.resolve",
          "media.license",
          "lyrics.get",
        ],
      };
      let body = source
        .slice(0, source.lastIndexOf("module.exports ="))
        .replace(/\/\/ \{\{REQUEST_HANDLER\}\}\s*/, "")
        .replace(/^const .*require\(.*\);\n/gm, "");
      for (const [name, value] of Object.entries(currentExports)) {
        if (typeof value === "function")
          body += "\n" + value.toString().replace(/^async (\w+)\(/, "async function $1(") + "\n";
      }
      body = body
        .replace("requestAppleMusicApi(path, body)", "requestAppleMusicApi(path, body, sdk)")
        .replace("Never expose axios errors", "Never expose transport errors")
        .replace(
          'requestMusicUrl("am", amId(item), quality)',
          "requestMusicUrl(item, quality, sdk)",
        )
        .replace(
          'const origin = API_URL.replace(/\\/$/, "");',
          'const origin = typeof API_URL === "string" ? API_URL.replace(/\\/$/, "") : "";',
        );
      const output =
        '// @baka-provider 2\n// {{REQUEST_HANDLER}}\n\n"use strict";\n\nconst manifest = ' +
        JSON.stringify(metadata, null, 2) +
        ";\n" +
        fs.readFileSync(path.join(__dirname, "paging.txt"), "utf8") +
        "\nfunction operations(sdk) {\n" +
        body +
        "\nreturn { search, getAlbumInfo, getArtistWorks, getLyric, getMediaSource, getAppleMusicKey };\n}\n" +
        `
const handlers = {
  search: async (request, sdk) => pageResult(await operations(sdk).search(request.query, pageNumber(request.cursor), request.kind), request),
  collections: {
    get: async ({ entity }, sdk) => entity.type === "artist" ? entity : { ...entity, ...(await operations(sdk).getAlbumInfo(entity)).albumItem },
    members: async (request, sdk) => pageResult(await (request.entity.type === "artist"
      ? operations(sdk).getArtistWorks(request.entity, pageNumber(request.cursor), request.kind)
      : operations(sdk).getAlbumInfo(request.entity)), request)
  },
  media: {
    prepare: async ({ entity, quality }) => ({ protocol: "lx", source: "am", musicInfo: { ...entity, songmid: entity.id }, quality }),
    resolve: async ({ entity, quality }, sdk) => operations(sdk).getMediaSource(entity, quality || "320k"),
    license: async ({ payload }, sdk) => operations(sdk).getAppleMusicKey(payload)
  },
  lyrics: { get: async ({ entity }, sdk) => operations(sdk).getLyric(entity) }
};
module.exports = { manifest, handlers };
`;
      new vm.Script(output);
      await writeProvider(path.join(outputDir, "am.js"), output);
      continue;
    }
    vmFunctions = {};
    // Capture declarations without executing any provider requests.
    const functionNames = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]);
    const scope = {
      module: { exports: {} },
      exports: {},
      UPDATE_URL: "",
      Buffer,
      require: (name) => (name === "crypto-js" ? fakeCrypto : name === "buffer" ? { Buffer } : {}),
      console,
    };
    vm.runInNewContext(
      source + "\n;module.exports.__functions = {" + functionNames.join(",") + "};",
      scope,
    );
    vmFunctions = scope.module.exports.__functions;
    delete currentExports.__functions;
    source = source.slice(0, source.lastIndexOf("module.exports ="));
    for (const name of ["search", "getAlbumInfo"]) {
      const fn = currentExports[name];
      if (fn && !source.includes(`function ${name}(`)) {
        source += "\n" + fn.toString().replace(/^async (\w+)\(/, "async function $1(") + "\n";
      }
    }
    source = source
      .replace(/\/\/ \{\{REQUEST_HANDLER\}\}\s*/, "")
      .replace(/Object\.defineProperty\(exports,[^\n]+\n/g, "")
      .replace(/^const [^\n]+require\([^\n]+\);\s*\n/gm, "")
      .replace(/^  const CryptoJS = require\('crypto-js'\);\n/gm, "")
      .replace(/let pako;\s*try \{\s*pako = require\("pako"\);\s*\} catch \(e\) \{\s*\}/, "")
      .replace(
        /let CryptoJs = null;\s*let nodeCrypto = null;\s*try \{ CryptoJs = require\("crypto-js"\); \} catch \(_\) \{\}\s*try \{ nodeCrypto = require\("crypto"\); \} catch \(_\) \{\}/,
        "",
      )
      .replace(/^const axios = axiosModule.default \|\| axiosModule;\n/m, "");
    source = source
      .replace(/\(axios_1\.default \|\| axios_1\)/g, "http")
      .replace(
        /Only axios and Node built-ins are required\./,
        "Uses the QuickJS SDK transport, bytes and cryptography primitives.",
      )
      .replace(/\(0, axios_1\.default\)/g, "http")
      .replace(/axios_1\.default|axios_1|\baxios\b/g, "http")
      .replace(/\bhttp\.get\(/g, "httpGet(")
      .replace(/\bhttp\.post\(/g, "httpPost(")
      .replace(/\bhttp\.head\(/g, "httpHead(")
      .replace(/\bhe\.decode\(/g, "sdk.text.decodeHtml(")
      .replace(/qs\.stringify\(/g, "formEncode(")
      .replace(/(?:CryptoJs|CryptoJS)\.MD5\(([^\n]+?)\)\.toString\(\)/g, 'hash("md5", $1)')
      .replace(/CryptoJs\.SHA1\(([^\n]+?)\)\.toString\(\)/g, 'hash("sha1", $1)')
      .replace(
        /CryptoJs\.enc\.Base64\.parse\(([^\n]+?)\)\.toString\(CryptoJs\.enc\.Utf8\)/g,
        'sdk.bytes.decode(sdk.bytes.encode($1, "base64"))',
      )
      .replace(/\bBuffer\.from\(/g, "bytes(")
      .replace(/\bBuffer\.alloc\(/g, "zeroBytes(")
      .replace(/Buffer\.isBuffer\(/g, "isBytes(")
      .replace(/typeof Buffer !== ["']undefined["']/g, "true")
      .replace(/pako\.inflate\(/g, "inflate(")
      .replace(/if \(!pako\) \{[^}]+\}/g, "")
      .replace(/new TextDecoder\(([^)]+)\)\.decode\(([^)]+)\)/g, "sdk.bytes.decode(hex($2), $1)")
      .replace(/\(0, cheerio_1\.load\)\((item\.[^)]*)\)\.text\(\)/g, "stripHtml($1)")
      .replace(
        /dayjs\.unix\((.*?)\)\.format\("YYYY-MM-DD"\)/g,
        "new Date(($1) * 1000).toISOString().slice(0, 10)",
      )
      .replace(
        /typeof env !== ["']undefined["'] && (?:env && )?typeof env\.getUserVariables === ["']function["']/g,
        "true",
      )
      .replace(/env\.getUserVariables\(\)/g, "sdk.settings")
      .replace(/module\.exports\.srcUrl/g, '(typeof UPDATE_URL === "string" ? UPDATE_URL : "")')
      .replace(/module\.exports\.supportedQualities/g, "manifest.supportedQualities")
      .replace(/module\.exports && /g, "")
      .replace(/console\.(log|debug)/g, "sdk.log.debug")
      .replace(/console\.(error|warn|info)/g, "sdk.log.$1");
    if (id === "wy") {
      source = replaceFunction(
        source,
        "eapiEncrypt",
        `function eapiEncrypt(url, object) {
  const text = typeof object === "object" ? JSON.stringify(object) : object;
  const digest = hash("md5", "nobody" + url + "use" + text + "md5forencrypt");
  const data = url + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
  return { params: sdk.crypto.aesEncrypt({ mode: "ecb", keyHex: sdk.bytes.encode(eapiKey),
    dataHex: sdk.bytes.encode(data), padding: "pkcs7" }).toUpperCase() };
}`,
      );
      // Replacements refer to original function text, so replace before lexical transforms below.
      const start = source.indexOf("function AES("),
        end = source.indexOf("\nfunction getParamsAndEnc(", start);
      source =
        source.slice(0, start) +
        `function AES(text, key) {
  return sdk.bytes.decode(sdk.crypto.aesEncrypt({ mode: "cbc", keyHex: sdk.bytes.encode(key),
    ivHex: sdk.bytes.encode("0102030405060708"), dataHex: sdk.bytes.encode(text), padding: "pkcs7" }), "base64");
}
function Rsa(text) {
  const modulus = BigInt("0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7");
  let base = BigInt("0x" + sdk.bytes.encode(text.split("").reverse().join(""))), exponent = 65537n, result = 1n;
  while (exponent) { if (exponent & 1n) result = result * base % modulus; base = base * base % modulus; exponent >>= 1n; }
  return result.toString(16).padStart(256, "0");
}
` +
        source.slice(end);
      const topStart = source.indexOf("async function getTopLists("),
        topEnd = source.indexOf("\nasync function getTopListDetail(", topStart);
      source =
        source.slice(0, topStart) +
        `async function getTopLists() {
  const response = await httpGet("https://music.163.com/api/toplist", { headers });
  return [{ title: "排行榜", data: (response.data.list || []).map(item => ({
    id: item.id, title: item.name, artwork: item.coverImgUrl, description: item.description
  })) }];
}
` +
        source.slice(topEnd);
    }
    if (id === "mg") source = source.replace(/requestMusicUrl\(/g, "miguMusicUrl(");
    if (id === "kw") {
      source = source
        .replace(
          "const bytes = normalizeBinaryData(buffer);",
          "const payloadBytes = normalizeBinaryData(buffer);",
        )
        .replace(
          "const headerEnd = findKuwoHeaderEnd(bytes);",
          "const headerEnd = findKuwoHeaderEnd(payloadBytes);",
        )
        .replace("inflate(bytes.subarray(headerEnd))", "inflate(payloadBytes.subarray(headerEnd))");
      source = source.replace(
        /const encoder = new TextEncoder\(\);\s*const keyBytes = encoder.encode\(key\);\s*const paramsBytes = encoder.encode\(params\);/,
        "const keyBytes = bytes(key);\n    const paramsBytes = bytes(params);",
      );
      source = source.replace(
        /await new Promise\(\(resolve\) => \{\s*setTimeout\(\(\) => \{\s*resolve\(\);\s*\}, 200 \+ Math\.random\(\) \* 100\);\s*\}\);/g,
        "",
      );
      source = source.replace(
        /const url = new URL\(userProvidedUrl.startsWith\('http'\) \? userProvidedUrl : 'http:\/\/' \+ userProvidedUrl\);\s*url.searchParams.set\('pn', String\(page - 1\)\);\s*url.searchParams.set\('rn', '80'\);/,
        'const url = replaceQuery(userProvidedUrl.startsWith("http") ? userProvidedUrl : "http://" + userProvidedUrl, { pn: page - 1, rn: 80 });',
      );
    }
    if (id === "bilibili") {
      for (const [name, replacement] of Object.entries({
        md5Hex: 'function md5Hex(value) { return hash("md5", String(value)); }',
        hmacSha256Hex:
          "function hmacSha256Hex(key, value) { return sdk.crypto.hmacSha256(sdk.bytes.encode(String(key)), sdk.bytes.encode(String(value))); }",
        stripBilibiliImageTransform: `function stripBilibiliImageTransform(value) {
  return /^https?:\\/\\/(?:[^/]+\\.)?(?:hdslb|biliimg)\\.com\\/bfs\\//i.test(value) ? value.replace(/@[^/?#]*(?=[?#]|$)/, "") : value;
}`,
      })) {
        // original function text is unchanged except SDK substitution; range by next declaration.
        const start = source.indexOf("function " + name + "("),
          next = source.indexOf("\nfunction ", start + 1);
        source = source.slice(0, start) + replacement + "\n" + source.slice(next);
      }
    }
    if (id === "mg") {
      const importStart = source.indexOf("async function importMusicSheet(");
      const redirectStart = source.indexOf("  if (!id) {\n    const tempUrl =", importStart);
      const redirectEnd = source.indexOf("  if (!id) {\n    return;", redirectStart);
      if (redirectStart < 0 || redirectEnd < 0)
        throw new Error("Missing public Migu short-link import flow");
      source =
        source.slice(0, redirectStart) +
        `  if (!id) {
    const shortLink = String(urlLike).match(/https?:\\/\\/c\\.migu\\.cn\\/[^\\s"'<>]+/);
    if (shortLink) {
      const response = await sdk.http.request({ url: shortLink[0], method: "GET", maxRedirects: 0,
        responseType: "text", headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/109.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml", host: "c.migu.cn"
        } });
      const redirect = Object.entries(response.headers || {}).find(([name]) => name.toLowerCase() === "location");
      if (response.status >= 300 && response.status < 400 && redirect) {
        const location = String(redirect[1]);
        const match = location.match(/[?&]id=(\\d+)(?:[&#]|$)/) || location.match(/\\/playlist\\/(\\d+)(?:[/?#]|$)/);
        if (match) id = match[1];
      }
    }
  }
` +
        source.slice(redirectEnd);
      source = source
        .replace(
          "const $ = (0, cheerio_1.load)(listPage);",
          'const pageRows = htmlAttributes(listPage, "data-cid");',
        )
        .replace(
          /\$\("\.row\.J_CopySong"\)\.each\(\(i, v\) => \{\s*const cid = \$\(v\)\.attr\("data-cid"\);\s*if \(cid\) pageIds.push\(cid\);\s*\}\);/,
          "pageIds.push(...pageRows);",
        );
    }
    // Native providers that depend exclusively on the selected URL source do not retain V1 getMediaSource.
    if (!["mg", "bilibili"].includes(id)) {
      const start = source.indexOf("async function getMediaSource(");
      if (start >= 0) {
        const next = source.indexOf("\nfunction ", start + 1);
        const nextAsync = source.indexOf("\nasync function ", start + 1);
        const end = Math.min(...[next, nextAsync].filter((n) => n >= 0));
        source = source.slice(0, start) + source.slice(end);
      }
    }
    const metadata = {
      apiVersion: 2,
      kind: "provider",
      sourceId: id + ".v1",
      id: `cc.baka.${id}`,
      name: currentExports.platform,
      version: "1.0.0",
      author: currentExports.author,
    };
    for (const field of [
      "description",
      "primaryKey",
      "supportedSearchType",
      "supportedQualities",
      "supportedVideoQualities",
    ]) {
      if (currentExports[field] !== undefined) metadata[field] = currentExports[field];
    }
    const capabilities = [
      "search",
      "entities.get",
      "collections.get",
      "collections.members",
      "discovery.charts",
      "discovery.playlistTags",
      "discovery.playlists",
      "discovery.hotSearch",
      ...(currentExports.getDailyRecommendations ? ["discovery.daily"] : []),
      "media.prepare",
      "media.resolve",
      "media.video",
      "lyrics.get",
      "comments.list",
      "links.resolve",
      "links.share",
    ];
    metadata.capabilities = capabilities;
    for (const field of ["userVariables", "hints"]) {
      if (currentExports[field] !== undefined) metadata[field] = currentExports[field];
    }
    const native = ["mg", "bilibili"].includes(id);
    const handlers = `const handlers = {
  search: async (request, sdk) => pageResult(await operations(sdk).search(request.query, pageNumber(request.cursor), request.kind), request),
  entities: { get: async ({ entity }, sdk) => operations(sdk).entity(entity) },
  collections: {
    get: async ({ entity }, sdk) => operations(sdk).collection(entity),
    members: async (request, sdk) => pageResult(await operations(sdk).members(request.entity, pageNumber(request.cursor), request.kind), request)
  },
  discovery: {
    charts: async (request, sdk) => sliceResult(await operations(sdk).charts(), request),
    playlistTags: async (request, sdk) => sliceResult(await operations(sdk).tags(), request),
    playlists: async (request, sdk) => pageResult(await operations(sdk).playlists(request.tag, pageNumber(request.cursor)), request),
    hotSearch: async (request, sdk) => sliceResult(await operations(sdk).hotSearch(), request),
    ${currentExports.getDailyRecommendations ? "daily: async (request, sdk) => dailyResult(await operations(sdk).daily(), request)," : ""}
  },
  media: {
    prepare: async ({ entity, quality }) => ({ protocol: "lx", source: ${JSON.stringify({ qq: "tx", kg: "kg", kw: "kw", wy: "wy", mg: "mg", bilibili: "bilibili" }[id])},
      musicInfo: { ...entity, songmid: entity.songmid || entity.hash || entity.copyrightId || entity.id }, quality }),
    resolve: async ({ entity, quality }, sdk) => {
      if (typeof requestMusicUrl === "function") {
        const result = await requestMusicUrl(entity, quality || manifest.supportedQualities[0], sdk);
        return typeof result === "string" ? { url: result, quality } : result;
      }
      ${native ? "return operations(sdk).resolve(entity, quality || manifest.supportedQualities[0]);" : 'throw Object.assign(new Error("Configure a music URL source"), { code: "authentication_required" });'}
    },
    video: async ({ entity, quality }, sdk) => operations(sdk).video(entity, quality || "1080p")
  },
  lyrics: { get: async ({ entity }, sdk) => operations(sdk).lyric(entity) },
  comments: { list: async (request, sdk) => pageResult(await operations(sdk).comments(request.entity, pageNumber(request.cursor)), request) },
  links: {
    resolve: async ({ url }, sdk) => operations(sdk).importSheet(url),
    share: async ({ entity }, sdk) => operations(sdk).share(entity)
  }
};
module.exports = { manifest, handlers };
`;
    source = source.replace(/\bbytes\(/g, "sdkBytes(");
    const operationReturn = `let activeImport = null;
function importedSnapshot(entity) {
  if (!entity._bakaImportToken) return null;
  if (!activeImport || activeImport.token !== entity._bakaImportToken ||
      activeImport.entity.id !== entity.id || activeImport.expiresAt <= Date.now()) {
    activeImport = null;
    throw Object.assign(new Error("Imported collection expired; import its share link again"), { code: "temporary_unavailable" });
  }
  return activeImport;
}
async function importCollection(url) {
  const imported = await importMusicSheet(url);
  if (!imported || !Array.isArray(imported.musicList) || imported.id == null) {
    throw Object.assign(new Error("The share link did not return a valid collection"), { code: "track_unavailable" });
  }
  if (imported.musicList.length > 100000) {
    throw Object.assign(new Error("Imported collection exceeds the 100000-track limit"), { code: "temporary_unavailable" });
  }
  const token = sdk.crypto.randomBytes(16);
  const entity = { ...imported, type: imported.type || "sheet", _bakaImportToken: token };
  delete entity.musicList;
  activeImport = { token, entity, items: imported.musicList, expiresAt: Date.now() + 10 * 60 * 1000 };
  return entity;
}
return {
  search,
  entity: entity => ${currentExports.getArtistInfo ? 'entity.type === "artist" ? getArtistInfo(entity) : ' : ""}getMusicInfo(entity),
  collection: async entity => {
    const snapshot = importedSnapshot(entity);
    if (snapshot) return snapshot.entity;
    if (entity.type === "artist") return ${currentExports.getArtistInfo ? "getArtistInfo(entity)" : "entity"};
    const result = await (entity.type === "album" ? getAlbumInfo(entity) : getMusicSheetInfo(entity, 1));
    return { ...entity, ...(result.albumItem || result.sheetItem || {}) };
  },
  members: (entity, page, kind) => {
    const snapshot = importedSnapshot(entity);
    if (snapshot) return { isEnd: true, musicList: snapshot.items, sheetItem: snapshot.entity, total: snapshot.items.length };
    return entity.type === "artist" ? getArtistWorks(entity, page, kind)
    : entity.type === "chart" ? getTopListDetail(entity, page)
    : entity.type === "album" ? getAlbumInfo(entity, page) : getMusicSheetInfo(entity, page);
  },
  charts: getTopLists,
  tags: getRecommendSheetTags,
  playlists: getRecommendSheetsByTag,
  hotSearch: getHotSearch,
  ${currentExports.getDailyRecommendations ? "daily: getDailyRecommendations," : ""}
  ${native ? "resolve: getMediaSource," : ""}
  video: getMvSource,
  lyric: getLyric,
  comments: getMusicComments,
  importSheet: importCollection,
  share: getMusicDetailPageUrl
};`;
    const output =
      '// @baka-provider 2\n// {{REQUEST_HANDLER}}\n\n"use strict";\n\n' +
      "// Public BakaMusic protocols, statically migrated to the QuickJS V2 SDK.\n" +
      "const manifest = " +
      JSON.stringify(metadata, null, 2) +
      ";\n\n" +
      fs.readFileSync(path.join(__dirname, "paging.txt"), "utf8") +
      "\nconst operationCache = new WeakMap();\nfunction operations(sdk) {\n" +
      "  if (operationCache.has(sdk)) return operationCache.get(sdk);\n" +
      "  const result = createOperations(sdk);\n  operationCache.set(sdk, result);\n  return result;\n}\n" +
      "function createOperations(sdk) {\n" +
      primitiveSource +
      "\n" +
      source.trim() +
      "\n" +
      operationReturn +
      "\n}\n\n" +
      handlers;
    new vm.Script(output, { filename: id + ".js" });
    if (
      /require\(|CryptoJs|CryptoJS|\bBuffer\b|cheerio|\baxios\b|\bpako\b|\bbigInt\b|\bdayjs\b|\bqs\./.test(
        output,
      )
    ) {
      const leftovers = output
        .split("\n")
        .filter((line) =>
          /require\(|CryptoJs|CryptoJS|\bBuffer\b|cheerio|\baxios\b|\bpako\b|\bbigInt\b|\bdayjs\b|\bqs\./.test(
            line,
          ),
        );
      throw new Error(id + " unported dependencies: " + leftovers.join("\n"));
    }
    await writeProvider(path.join(outputDir, id + ".js"), output);
  }
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
