// @baka-provider 2
// {{REQUEST_HANDLER}}

"use strict";

// Public BakaMusic protocols, statically migrated to the QuickJS V2 SDK.
const manifest = {
  apiVersion: 2,
  kind: "provider",
  sourceId: "wy.v1",
  id: "cc.baka.wy",
  name: "网易云音乐",
  version: "1.0.2",
  srcUrl: typeof UPDATE_URL === "string" ? UPDATE_URL : "",
  author: "BakaMusic",
  cacheControl: "no-store",
  primaryKey: ["id"],
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  supportedQualities: ["128k", "320k", "flac", "hires", "atmos", "master"],
  supportedVideoQualities: ["480p", "720p", "1080p", "4k"],
  capabilities: [
    "search",
    "entities.get",
    "collections.get",
    "collections.members",
    "discovery.charts",
    "discovery.playlistTags",
    "discovery.playlists",
    "discovery.hotSearch",
    "discovery.daily",
    "media.prepare",
    "media.resolve",
    "media.video",
    "lyrics.get",
    "comments.list",
    "links.resolve",
    "links.share",
  ],
  userVariables: [
    {
      key: "wy_user_id",
      name: "网易云连接码",
      hint: "在 https://mc.vsaa.cn/connect?platform=wy 登录后，将 wy_ 开头的连接码填入此处，用于个人每日推荐。",
    },
  ],
  hints: {
    importMusicSheet: [
      "网易云：APP点击分享，然后复制链接",
      "短链接（163cn.tv）需手动访问展开为完整URL后再导入",
      "默认歌单无法导入，先新建一个空白歌单复制过去再导入新歌单即可",
    ],
  },
};

function entityKind(entity) {
  const kind = entity.type || entity.kind;
  return kind === "playlist" ? "sheet" : kind === "track" ? "music" : kind;
}
function pageState(cursor) {
  if (cursor == null) return { upstreamPage: 1, offset: 0 };
  let value;
  try {
    if (typeof cursor !== "string" || !cursor.startsWith("v2:")) throw new Error();
    value = JSON.parse(decodeURIComponent(cursor.slice(3)));
  } catch (_) {
    throw new Error("Invalid provider page cursor");
  }
  if (
    !value ||
    !Number.isSafeInteger(value.upstreamPage) ||
    value.upstreamPage < 1 ||
    value.upstreamPage > 10000 ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    value.offset > 1000000
  ) {
    throw new Error("Invalid provider page cursor");
  }
  return value;
}
function pageNumber(cursor) {
  return pageState(cursor).upstreamPage;
}
function pageCursor(upstreamPage, offset) {
  return "v2:" + encodeURIComponent(JSON.stringify({ upstreamPage, offset }));
}
function pageLimit(request) {
  return Math.max(1, Math.min(100, Math.trunc(Number(request.limit) || 30)));
}
function flattenGroups(value) {
  const result = [];
  for (const group of Array.isArray(value) ? value : []) {
    const children = Array.isArray(group.data)
      ? group.data
      : Array.isArray(group.list)
        ? group.list
        : null;
    if (children) {
      result.push(
        ...children.map((item) =>
          item && typeof item === "object" && group.title && !item.group && !item.category
            ? { ...item, group: group.title }
            : item,
        ),
      );
    } else result.push(group);
  }
  return result;
}
function pageResult(result, request) {
  result = result || {};
  const candidates = Array.isArray(result)
    ? result
    : result.data || result.musicList || result.comments || [];
  const items = Array.isArray(candidates) ? candidates : [];
  const state = pageState(request.cursor);
  if (
    (!items.length && result.isEnd === false) ||
    (state.offset > 0 && state.offset >= items.length)
  ) {
    throw Object.assign(new Error("Provider pagination did not advance; retry this collection"), {
      code: "temporary_unavailable",
    });
  }
  const end = Math.min(items.length, state.offset + pageLimit(request));
  const output = {
    items: items.slice(state.offset, end),
    nextCursor:
      end < items.length
        ? pageCursor(state.upstreamPage, end)
        : result.isEnd === false
          ? pageCursor(state.upstreamPage + 1, 0)
          : null,
  };
  const entity = result.sheetItem || result.albumItem || result.artistItem;
  if (entity) output.entity = { ...(request.entity || {}), ...entity };
  if (Number.isFinite(result.total)) output.total = result.total;
  return output;
}
function sliceResult(result, request) {
  const items = flattenGroups((result && (result.data || result.tags)) || result);
  if (result && Array.isArray(result.pinned)) {
    const existing = new Set(items.map((item) => String(item && item.id)));
    items.unshift(...result.pinned.filter((item) => !existing.has(String(item && item.id))));
  }
  return pageResult({ data: items, total: items.length, isEnd: true }, request);
}
function tagResult(result, request) {
  const items = flattenGroups((result && (result.data || result.tags)) || result);
  const page = pageResult({ data: items, total: items.length, isEnd: true }, request);
  // Pins have their own order and may not belong to a category. Keep both lists.
  if (request.cursor == null && result && Array.isArray(result.pinned)) {
    page.pinned = result.pinned.map((item) => ({ ...item }));
  }
  return page;
}
function dailyResult(result, request) {
  result = result || {};
  return {
    ...result,
    ...pageResult({ ...result, data: result.musicList || result.data || [] }, request),
    state: ["ready", "login_required", "unconfigured", "blocked", "updating"].includes(result.state)
      ? result.state
      : "blocked",
  };
}

const operationCache = new WeakMap();
function operations(sdk) {
  if (operationCache.has(sdk)) return operationCache.get(sdk);
  const result = createOperations(sdk);
  operationCache.set(sdk, result);
  return result;
}
function createOperations(sdk) {
  // SDK transport and byte operations; no package or host-global dependency.
  function formEncode(params) {
    return Object.entries(params || {})
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) =>
          encodeURIComponent(key) + "=" + encodeURIComponent(value == null ? "" : String(value)),
      )
      .join("&");
  }
  function replaceQuery(url, values) {
    const parts = String(url).split("#"),
      pair = parts[0].split("?"),
      params = {};
    for (const segment of (pair[1] || "").split("&")) {
      if (!segment) continue;
      const equals = segment.indexOf("=");
      params[decodeURIComponent(equals < 0 ? segment : segment.slice(0, equals))] =
        decodeURIComponent(equals < 0 ? "" : segment.slice(equals + 1));
    }
    return (
      pair[0] +
      "?" +
      formEncode({ ...params, ...values }) +
      (parts.length > 1 ? "#" + parts.slice(1).join("#") : "")
    );
  }
  async function http(options) {
    if (typeof options === "string") options = { url: options };
    const request = {
      url: options.params ? replaceQuery(options.url, options.params) : options.url,
      method: String(options.method || "GET").toUpperCase(),
      headers: { ...(options.headers || {}) },
      responseType:
        options.responseType === "arraybuffer" ? "bytes" : options.responseType || "text",
    };
    if (options.timeout != null) request.timeoutMs = options.timeout;
    if (options.maxRedirects != null) request.maxRedirects = options.maxRedirects;
    if (options.data != null) {
      request.body = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
      if (
        typeof options.data !== "string" &&
        !Object.keys(request.headers).some((key) => key.toLowerCase() === "content-type")
      ) {
        request.headers["Content-Type"] = "application/json";
      }
    }
    const response = await sdk.http.request(request);
    if (response.status < 200 || response.status >= 300) {
      const error = Object.assign(new Error("Provider request failed (" + response.status + ")"), {
        code:
          response.status === 429
            ? "rate_limited"
            : response.status === 401
              ? "authentication_required"
              : "temporary_unavailable",
        response: { status: response.status, headers: response.headers, data: response.body },
      });
      if (!options.validateStatus || !options.validateStatus(response.status)) throw error;
    }
    let data = response.body;
    if (request.responseType === "bytes") {
      data = sdkBytes(
        typeof data === "string" ? data : (data && (data.dataHex || data.hex)) || "",
        "hex",
      );
    } else if (typeof data === "string" && options.responseType !== "text") {
      try {
        data = JSON.parse(data);
      } catch (_) {
        /* HTML/text endpoints retain text. */
      }
    }
    return { status: response.status, headers: response.headers || {}, data };
  }
  function httpGet(url, options) {
    return http({ ...options, url, method: "GET" });
  }
  function httpPost(url, data, options) {
    return http({ ...options, url, data, method: "POST" });
  }
  function httpHead(url, options) {
    return http({ ...options, url, method: "HEAD" });
  }
  function hash(algorithm, value) {
    return sdk.crypto.hash(algorithm, sdk.bytes.encode(String(value)));
  }
  function hex(value) {
    return Array.from(value || [], (byte) => Number(byte).toString(16).padStart(2, "0")).join("");
  }
  function isBytes(value) {
    return value instanceof Uint8Array;
  }
  function sdkBytes(value, encoding) {
    let result;
    if (typeof value === "string") {
      const encoded = sdk.bytes.encode(value, encoding || "utf8");
      result = Uint8Array.from(encoded.match(/../g) || [], (byte) => parseInt(byte, 16));
    } else if (value instanceof ArrayBuffer) result = new Uint8Array(value);
    else result = Uint8Array.from(value || []);
    result.toString = function (format) {
      return sdk.bytes.decode(hex(this), format === "utf16le" ? "utf-16le" : format || "utf8");
    };
    return result;
  }
  function zeroBytes(size) {
    return sdkBytes(new Uint8Array(size));
  }
  function inflate(value, options) {
    const dataHex = sdk.bytes.decompress(hex(value), "zlib");
    return options && options.to === "string"
      ? sdk.bytes.decode(dataHex)
      : sdkBytes(dataHex, "hex");
  }
  function stripHtml(value) {
    return sdk.text.decodeHtml(String(value || "").replace(/<[^>]*>/g, ""));
  }
  function htmlAttributes(value, attribute) {
    const result = [],
      expression = new RegExp("\\b" + attribute + "\\s*=\\s*([\"'])(.*?)\\1", "gi");
    let match;
    while ((match = expression.exec(String(value)))) result.push(sdk.text.decodeHtml(match[2]));
    return result;
  }

  ("use strict");

  // eapi 加密（用于歌词接口）

  const eapiKey = "e82ckenh8dichen8";

  function eapiEncrypt(url, object) {
    const text = typeof object === "object" ? JSON.stringify(object) : object;
    const digest = hash("md5", "nobody" + url + "use" + text + "md5forencrypt");
    const data = url + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
    return {
      params: sdk.crypto
        .aesEncrypt({
          mode: "ecb",
          keyHex: sdk.bytes.encode(eapiKey),
          dataHex: sdk.bytes.encode(data),
          padding: "pkcs7",
        })
        .toUpperCase(),
    };
  }

  function create_key() {
    var d,
      e,
      b = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      c = "";
    for (d = 0; 16 > d; d += 1)
      ((e = Math.random() * b.length), (e = Math.floor(e)), (c += b.charAt(e)));
    return c;
  }

  function AES(text, key) {
    return sdk.bytes.decode(
      sdk.crypto.aesEncrypt({
        mode: "cbc",
        keyHex: sdk.bytes.encode(key),
        ivHex: sdk.bytes.encode("0102030405060708"),
        dataHex: sdk.bytes.encode(text),
        padding: "pkcs7",
      }),
      "base64",
    );
  }
  function Rsa(text) {
    const modulus = BigInt(
      "0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7",
    );
    let base = BigInt("0x" + sdk.bytes.encode(text.split("").reverse().join(""))),
      exponent = 65537n,
      result = 1n;
    while (exponent) {
      if (exponent & 1n) result = (result * base) % modulus;
      base = (base * base) % modulus;
      exponent >>= 1n;
    }
    return result.toString(16).padStart(256, "0");
  }

  function getParamsAndEnc(text) {
    const first = AES(text, "0CoJUm6Qyw8W8jud");
    const rand = create_key();
    const params = AES(first, rand);
    const encSecKey = Rsa(rand);
    return {
      params,
      encSecKey,
    };
  }

  const pageSize = 30;

  const headers = {
    authority: "music.163.com",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    "content-type": "application/x-www-form-urlencoded",
    accept: "*/*",
    origin: "https://music.163.com",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: "https://music.163.com/",
    "accept-language": "zh-CN,zh;q=0.9",
  };

  const qualityLevels = {
    "128k": "128k",
    "320k": "320k",
    flac: "flac",
    flac24bit: "flac24bit",
    hires: "hires",
    atmos: "atmos",
    master: "master",
  };

  function sizeFormate(size) {
    if (size < 1024) return size + "B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + "KB";
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + "MB";
    return (size / (1024 * 1024 * 1024)).toFixed(2) + "GB";
  }

  function applyPrivilegeQualities(qualities, privilege) {
    if (!privilege || !qualities) return;
    const maxBr = Number(privilege.maxbr || privilege.maxBr || 0);
    if (maxBr >= 128000) qualities["128k"] = qualities["128k"] || { bitrate: 128000 };
    if (maxBr >= 320000) qualities["320k"] = qualities["320k"] || { bitrate: 320000 };
    if (maxBr >= 999000) qualities["flac"] = qualities["flac"] || { bitrate: 1411000 };
    if (maxBr >= 1999000) qualities["hires"] = qualities["hires"] || { bitrate: 2304000 };

    // Newer API uses string levels: lossless / hires / jyeffect / sky / jymaster …
    const level = String(
      privilege.playMaxbr ||
        privilege.maxBrLevel ||
        privilege.maxbrLevel ||
        privilege.maxBrLevelStr ||
        "",
    ).toLowerCase();
    if (!level) return;
    if (/(standard|higher|exhigh|128|320)/.test(level)) {
      qualities["128k"] = qualities["128k"] || { bitrate: 128000 };
    }
    if (/(exhigh|320|higher)/.test(level)) {
      qualities["320k"] = qualities["320k"] || { bitrate: 320000 };
    }
    if (/(lossless|sq|flac)/.test(level)) {
      qualities["flac"] = qualities["flac"] || { bitrate: 1411000 };
    }
    if (/(hires|hr|hres)/.test(level)) {
      qualities["hires"] = qualities["hires"] || { bitrate: 2304000 };
    }
    // 沉浸环绕 / 高清臻音 等
    if (/(jyeffect|sky|effect|immers)/.test(level)) {
      qualities["atmos"] = qualities["atmos"] || { bitrate: 1411000 };
    }
    // 超清母带
    if (/(jymaster|master)/.test(level)) {
      qualities["master"] = qualities["master"] || { bitrate: 4608000 };
    }
  }

  function formatMusicItem(_) {
    var _a, _b, _c, _d;
    const album = _.al || _.album;
    const qualities = {};

    applyPrivilegeQualities(qualities, _.privilege);

    if ((_.l && _.l.size) || (_.m && _.m.size && !_.h)) {
      const audioData = _.l || _.m;
      qualities["128k"] = { size: audioData.size, bitrate: audioData.br || 128000 };
    }

    if (_.h && _.h.size) {
      qualities["320k"] = { size: _.h.size, bitrate: _.h.br || 320000 };
    }

    if (_.sq && _.sq.size) {
      qualities["flac"] = { size: _.sq.size, bitrate: _.sq.br || 1411000 };
    }
    if (_.hr && _.hr.size) {
      qualities["hires"] = { size: _.hr.size, bitrate: _.hr.br || 2304000 };
    }
    // 超清母带 / 沉浸环绕声（列表接口常缺，靠 music/detail 批量补全）
    if (_.jm && _.jm.size) {
      qualities["master"] = { size: _.jm.size, bitrate: _.jm.br || 4608000 };
    }
    if (_.je && _.je.size) {
      qualities["atmos"] = { size: _.je.size, bitrate: _.je.br || 1411000 };
    }

    if (Object.keys(qualities).length === 0) {
      qualities["128k"] = { bitrate: 128000 };
      qualities["320k"] = { bitrate: 320000 };
    }

    const artists = _.ar || _.artists || [];
    const singerList = artists.map((ar) => ({
      id: ar.id,
      name: ar.name,
      avatar: ar.img1v1Url || ar.picUrl || "",
    }));

    return {
      id: _.id,
      artwork: album?.picUrl,
      title: _.name,
      artist: artists.map((ar) => ar.name).join(", "),
      singerList: singerList,
      album: album?.name,
      albumId: album?.id,
      duration: _.dt
        ? Math.floor(_.dt / 1000)
        : _.duration
          ? Math.floor(_.duration / 1000)
          : undefined,
      url: `https://share.duanx.cn/url/wy/${_.id}/128k`,
      qualities: qualities,
      copyrightId: _?.copyrightId,
      privilege: _.privilege,
      mv: _.mv || _.mvid || undefined,
    };
  }

  async function formatMusicItemWithQuality(_, qualityInfo = {}) {
    const album = _.al || _.album;
    const qualities = qualityInfo || {};

    const artists = _.ar || _.artists || [];
    const singerList = artists.map((ar) => ({
      id: ar.id,
      name: ar.name,
      avatar: ar.img1v1Url || ar.picUrl || "",
    }));

    return {
      id: _.id,
      artwork: album?.picUrl,
      title: _.name,
      artist: artists.map((ar) => ar.name).join(", "),
      singerList: singerList,
      album: album?.name,
      albumId: album?.id,
      duration: _.dt
        ? Math.floor(_.dt / 1000)
        : _.duration
          ? Math.floor(_.duration / 1000)
          : undefined,
      url: `https://share.duanx.cn/url/wy/${_.id}/128k`,
      qualities: qualities,
      copyrightId: _?.copyrightId,
      privilege: _.privilege,
      mv: _.mv || _.mvid || undefined,
    };
  }

  function formatAlbumItem(_) {
    return {
      id: _.id,
      artist: _.artist.name,
      title: _.name,
      artwork: _.picUrl,
      description: "",
      date: new Date((_.publishTime / 1000) * 1000).toISOString().slice(0, 10),
    };
  }

  async function getMusicQualityInfo(id) {
    try {
      const res = await httpGet(`https://music.163.com/api/song/music/detail/get?songId=${id}`, {
        headers: {
          referer: "https://music.163.com/",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        },
      });

      if (res.status !== 200 || res.data.code !== 200) return {};

      const data = res.data.data;
      const qualities = {};

      if (data.l && data.l.size) {
        qualities["128k"] = { size: sizeFormate(data.l.size), bitrate: data.l.br || 128000 };
      } else if (data.m && data.m.size) {
        qualities["128k"] = { size: sizeFormate(data.m.size), bitrate: data.m.br || 128000 };
      }
      if (data.h && data.h.size) {
        qualities["320k"] = { size: sizeFormate(data.h.size), bitrate: data.h.br || 320000 };
      }
      if (data.sq && data.sq.size) {
        qualities["flac"] = { size: sizeFormate(data.sq.size), bitrate: data.sq.br || 1411000 };
      }
      if (data.hr && data.hr.size) {
        qualities["hires"] = { size: sizeFormate(data.hr.size), bitrate: data.hr.br || 2304000 };
      }
      // 超清母带
      if (data.jm && data.jm.size) {
        qualities["master"] = { size: sizeFormate(data.jm.size), bitrate: data.jm.br || 4608000 };
      }
      // 高清臻音 / 沉浸环绕
      if (data.je && data.je.size) {
        qualities["atmos"] = { size: sizeFormate(data.je.size), bitrate: data.je.br || 1411000 };
      }
      // 部分接口用 sk(sky) 表示沉浸环绕
      if (data.sk && data.sk.size && !qualities["atmos"]) {
        qualities["atmos"] = { size: sizeFormate(data.sk.size), bitrate: data.sk.br || 1411000 };
      }
      // 杜比全景声
      if (data.db && data.db.size) {
        qualities["dolby"] = { size: sizeFormate(data.db.size), bitrate: data.db.br || 1411000 };
      }

      return qualities;
    } catch (error) {
      sdk.log.error(`[网易云] 获取音质信息异常:`, error.message);
      return {};
    }
  }

  function extractWyQualityInfo(song) {
    const qualities = {};
    for (const [key, field, bitrate] of [
      ["128k", song.l?.size ? "l" : "m", 128000],
      ["320k", "h", 320000],
      ["flac", "sq", 1411000],
      ["hires", "hr", 2304000],
      ["master", "jm", 4608000],
      ["atmos", song.je?.size ? "je" : "sk", 1411000],
      ["dolby", "db", 1411000],
    ]) {
      if (Number(song[field]?.size) > 0)
        qualities[key] = {
          size: sizeFormate(song[field].size),
          bitrate: song[field].br || bitrate,
        };
    }
    return qualities;
  }

  async function getBatchMusicQualityInfo(idList, songs = []) {
    const ids = [...new Set((idList || []).filter(Boolean).map(String))].filter((id) =>
      /^\d+$/.test(id),
    );
    const qualityInfoMap = {};
    for (const song of songs) qualityInfoMap[song.id] = extractWyQualityInfo(song);
    const batches = [];
    for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
    for (let offset = 0; offset < batches.length; offset += 2) {
      await Promise.all(
        batches.slice(offset, offset + 2).map(async (batch) => {
          const base = "/api/song/music/detail/get";
          const keys = batch.map((id, index) => base + "/".repeat(index));
          const body = Object.fromEntries(
            keys.map((key, index) => [key, JSON.stringify({ songId: batch[index] })]),
          );
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await http({
                method: "post",
                url: "https://interface3.music.163.com/eapi/batch",
                headers: {
                  Referer: "https://music.163.com/",
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                data: formEncode(eapiEncrypt("/api/batch", body)),
                timeout: 10000,
              });
              if (response.data?.code !== 200) throw new Error("Invalid batch quality response");
              let incomplete = false;
              keys.forEach((key, index) => {
                const detail = response.data[key];
                if (
                  detail?.code !== 200 ||
                  !detail.data ||
                  (detail.data.songId != null && String(detail.data.songId) !== batch[index])
                ) {
                  incomplete = true;
                  return;
                }
                const id = batch[index];
                qualityInfoMap[id] = {
                  ...qualityInfoMap[id],
                  ...extractWyQualityInfo(detail.data),
                };
              });
              if (incomplete) throw new Error("Incomplete batch quality response");
              break;
            } catch (error) {
              if (attempt === 1) sdk.log.error("[WY] Batch quality lookup failed:", error.message);
            }
          }
        }),
      );
    }
    return qualityInfoMap;
  }

  /** Attach full quality map (incl. master/atmos) onto formatted songs. */
  async function withBatchQualities(songs) {
    const list = Array.isArray(songs) ? songs : [];
    if (!list.length) return [];
    const idList = list.map((s) => s && s.id).filter(Boolean);
    let qualityInfoMap = {};
    try {
      qualityInfoMap = await getBatchMusicQualityInfo(idList, list);
    } catch (e) {
      sdk.log.error("[网易云] 批量音质失败:", e && e.message);
    }
    return list.map((song) => {
      const formatted = formatMusicItem(song);
      const q = qualityInfoMap[song.id];
      if (q && Object.keys(q).length > 0) {
        // Prefer detail API sizes; keep privilege flags for missing tiers
        formatted.qualities = Object.assign({}, formatted.qualities || {}, q);
      }
      return formatted;
    });
  }

  /** Fetch song metadata and optionally enrich all quality tiers through EAPI batch. */
  async function getValidMusicItems(trackIds, options = {}) {
    const withQuality = options.withQuality !== false;
    if (!trackIds || !trackIds.length) return [];

    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    try {
      const data = {
        c: JSON.stringify(
          trackIds.map((id) => ({
            id: id,
            v: 0,
          })),
        ),
        ids: JSON.stringify(trackIds),
      };
      const pae = getParamsAndEnc(JSON.stringify(data));
      const paeData = formEncode(pae);

      const res = (
        await http({
          method: "post",
          url: "https://music.163.com/weapi/v3/song/detail",
          headers,
          data: paeData,
        })
      ).data;

      if (res.code !== 200 || !res.songs || !res.privileges) {
        sdk.log.error("[网易云] 获取歌曲详情失败:", res.code, res.msg);
        if (options.strict) throw new Error("[网易云] 歌曲详情批次失败");
        return [];
      }

      const songsWithPrivilege = res.songs.map((song, index) => {
        const privilege = res.privileges.find((p) => p.id === song.id) || res.privileges[index];
        return { ...song, privilege };
      });

      const validMusicItems = songsWithPrivilege.map(formatMusicItem);

      if (withQuality) {
        const idList = validMusicItems.map((item) => item.id);
        const qualityInfoMap = await getBatchMusicQualityInfo(idList, songsWithPrivilege);
        validMusicItems.forEach((item) => {
          const qualityInfo = qualityInfoMap[item.id];
          if (qualityInfo) item.qualities = { ...item.qualities, ...qualityInfo };
        });
      }

      return validMusicItems;
    } catch (e) {
      sdk.log.error("[网易云] 获取歌单歌曲失败:", e);
      if (options.strict) throw e;
      return [];
    }
  }

  /** 模块级缓存：宿主不会把顶层 _trackIds 回传给下一页，必须本地记住 trackIds */
  const sheetTrackIdsCache = new Map();
  const sheetTrackTotalsCache = new Map();
  const SHEET_TRACK_CACHE_MAX = 40;

  function rememberSheetTrackIds(sheetId, trackIds, total) {
    const key = String(sheetId);
    if (!key || !Array.isArray(trackIds) || !trackIds.length) return;
    if (sheetTrackIdsCache.size >= SHEET_TRACK_CACHE_MAX && !sheetTrackIdsCache.has(key)) {
      const oldest = sheetTrackIdsCache.keys().next().value;
      sheetTrackIdsCache.delete(oldest);
      sheetTrackTotalsCache.delete(oldest);
    }
    sheetTrackIdsCache.set(key, trackIds);
    sheetTrackTotalsCache.set(key, total);
  }

  async function searchBase(query, page, type) {
    const data = {
      s: query,
      limit: pageSize,
      type: type,
      offset: (page - 1) * pageSize,
      csrf_token: "",
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = formEncode(pae);
    const headers = {
      authority: "music.163.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
      "content-type": "application/x-www-form-urlencoded",
      accept: "*/*",
      origin: "https://music.163.com",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      referer: "https://music.163.com/search/",
      "accept-language": "zh-CN,zh;q=0.9",
    };
    const res = (
      await http({
        method: "post",
        url: "https://music.163.com/weapi/search/get",
        headers,
        data: paeData,
      })
    ).data;
    return res;
  }

  async function searchMusic(query, page) {
    const res = await searchBase(query, page, 1);
    const songIds = (res.result.songs || []).map((song) => song.id);

    let formattedSongs = [];
    if (songIds.length > 0) {
      try {
        formattedSongs = await getValidMusicItems(songIds);
      } catch (error) {
        sdk.log.error("[网易云] 批量获取搜索歌曲详情失败:", error);
        formattedSongs = (res.result.songs || []).map(formatMusicItem);
      }
    }

    return {
      isEnd: res.result.songCount <= page * pageSize,
      data: formattedSongs,
    };
  }

  async function searchAlbum(query, page) {
    const res = await searchBase(query, page, 10);
    return {
      isEnd: res.result.albumCount <= page * pageSize,
      data: res.result.albums.map(formatAlbumItem),
    };
  }

  async function searchArtist(query, page) {
    const res = await searchBase(query, page, 100);
    return {
      isEnd: res.result.artistCount <= page * pageSize,
      data: res.result.artists.map((_) => ({
        name: _.name,
        id: _.id,
        avatar: _.img1v1Url,
        songCount: _.musicSize,
        albumCount: _.albumSize,
      })),
    };
  }

  async function searchMusicSheet(query, page) {
    const res = await searchBase(query, page, 1000);
    return {
      isEnd: res.result.playlistCount <= page * pageSize,
      data: res.result.playlists.map((_) => ({
        title: _.name,
        id: String(_.id),
        coverImg: _.coverImgUrl,
        artist: _.creator?.nickname,
        playCount: _.playCount,
        worksNum: _.trackCount,
      })),
    };
  }

  async function searchLyric(query, page) {
    const res = await searchBase(query, page, 1);
    const songIds = (res.result.songs || []).map((song) => song.id);

    let formattedSongs = [];
    if (songIds.length > 0) {
      try {
        formattedSongs = await getValidMusicItems(songIds);
      } catch (error) {
        sdk.log.error("[网易云] 批量获取歌词搜索歌曲详情失败:", error);
        formattedSongs = (res.result.songs || []).map(formatMusicItem);
      }
    }

    return {
      isEnd: res.result.songCount <= page * pageSize,
      data: formattedSongs.map((item) => ({ ...item, platform: "网易云音乐" })),
    };
  }

  function parseYrcToQrc(yrcContent) {
    if (!yrcContent) return null;

    const lines = yrcContent.trim().split("\n");
    const qrcLines = [];
    const yrcWordPattern = /\((\d+),(\d+),\d+\)([^(]*)/g;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith('{"')) continue;

      const lineMatch = trimmedLine.match(/^\[(\d+),(\d+)\](.*)$/);
      if (!lineMatch) continue;

      const lineStartMs = lineMatch[1];
      const lineDurationMs = lineMatch[2];
      const content = lineMatch[3];

      yrcWordPattern.lastIndex = 0;
      const qrcWords = [];
      let match;
      while ((match = yrcWordPattern.exec(content)) !== null) {
        qrcWords.push(`${match[3]}(${match[1]},${match[2]})`);
      }

      if (qrcWords.length > 0) {
        qrcLines.push(`[${lineStartMs},${lineDurationMs}]${qrcWords.join("")}`);
      }
    }

    return qrcLines.length > 0 ? qrcLines.join("\n") : null;
  }

  // YRC 翻译/罗马音转 LRC 格式

  function parseYrcTrans(yrcContent) {
    if (!yrcContent) return null;

    const lines = yrcContent.trim().split("\n");
    const lrcLines = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (trimmedLine.startsWith('{"')) {
        try {
          const info = JSON.parse(trimmedLine);
          if (info.t !== undefined && info.c) {
            const text = info.c.map((word) => word.tx || "").join("");
            const timeMs = info.t;
            const ms = timeMs % 1000;
            const totalSec = Math.floor(timeMs / 1000);
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            const timeTag = `[${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}]`;
            lrcLines.push(`${timeTag}${text}`);
          }
        } catch (e) {
          continue;
        }
      } else if (/^\[[\d:.]+\]/.test(trimmedLine)) {
        lrcLines.push(trimmedLine);
      }
    }

    return lrcLines.length > 0 ? lrcLines.join("\n") : null;
  }

  function formatLyricTimeTag(timeMs) {
    const ms = timeMs % 1000;
    const totalSec = Math.floor(timeMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `[${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}]`;
  }

  function parseWyJsonLyricLine(line) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('{"') || !trimmedLine.endsWith("}")) return null;

    try {
      const info = JSON.parse(trimmedLine);
      if (typeof info.t !== "number" || !Array.isArray(info.c)) return null;

      const text = info.c
        .map((word) => word.tx || "")
        .join("")
        .trim();
      if (!text) return null;

      return {
        timeMs: info.t,
        text,
      };
    } catch (e) {
      return null;
    }
  }

  // 非标准时间戳修正 [mm:ss:cc] -> [mm:ss.ccc]

  function normalizeColonTimeTag(lrcContent) {
    if (!lrcContent) return lrcContent;

    const timeTagPattern = /\[(\d+):([0-5]?\d):(\d{1,3})\]/g;
    if (!timeTagPattern.test(lrcContent)) return lrcContent;

    return lrcContent.replace(timeTagPattern, (_, min, sec, frac) => {
      let ms = frac;
      if (ms.length === 1) ms = `${ms}00`;
      else if (ms.length === 2) ms = `${ms}0`;
      else if (ms.length > 3) ms = ms.slice(0, 3);
      return `[${min}:${sec}.${ms}]`;
    });
  }

  function normalizeWyLyricText(lrcContent) {
    if (!lrcContent) return lrcContent;

    const normalizedContent = normalizeColonTimeTag(lrcContent);
    const normalizedLines = [];

    for (const line of normalizedContent.split(/\r?\n/)) {
      const jsonLine = parseWyJsonLyricLine(line);
      if (jsonLine) {
        normalizedLines.push(`${formatLyricTimeTag(jsonLine.timeMs)}${jsonLine.text}`);
        continue;
      }

      normalizedLines.push(line);
    }

    return normalizedLines.join("\n");
  }

  function getMvId(musicItem) {
    const mv = musicItem?.mv ?? musicItem?.mvId ?? musicItem?.mvid;
    if (mv && typeof mv === "object") {
      return mv.id ?? mv.mvId ?? mv.mvid;
    }
    return mv;
  }

  function getMvResolution(videoQuality) {
    const normalized = String(videoQuality || "1080p")
      .trim()
      .toLowerCase();
    if (normalized === "4k" || normalized === "2160p") return 2160;
    const matched = normalized.match(/(240|360|480|720|1080|2160)/);
    return matched ? Number(matched[1]) : 1080;
  }

  /**
   * 解析歌曲关联的 MV 播放源。
   * musicItem.mv 与 lx-lxwalnut-music-mobile 的 meta.mv 对齐；宿主负责展示与播放。
   */
  async function getMvSource(musicItem, videoQuality = "1080p") {
    const mvId = getMvId(musicItem);
    if (!mvId) return null;

    try {
      const resolution = getMvResolution(videoQuality);
      const encrypted = getParamsAndEnc(
        JSON.stringify({
          id: mvId,
          r: resolution,
          csrf_token: "",
        }),
      );
      const response = await httpPost(
        "https://music.163.com/weapi/song/enhance/play/mv/url",
        formEncode(encrypted),
        {
          headers,
          timeout: 10000,
        },
      );
      const source = response?.data?.data;
      if (response?.status !== 200 || response?.data?.code !== 200 || !source?.url) {
        sdk.log.error(
          `[网易云] 获取 MV 播放源失败: ${source?.msg || response?.data?.message || "未知错误"}`,
        );
        return null;
      }
      const expiresInSeconds = Number(source.expi || source.expiresIn || 0);
      const actualQuality = `${Number(source.r) || resolution}p`;
      const size = Number(source.size || source.filesize || source.fileSize || 0) || undefined;
      return {
        url: source.url,
        headers: {
          Referer: "https://music.163.com/",
          Origin: "https://music.163.com",
          "User-Agent": headers["user-agent"],
        },
        userAgent: headers["user-agent"],
        videoQuality: actualQuality,
        mimeType: "video/mp4",
        size,
        width: Number(source.width) || undefined,
        height: Number(source.height) || resolution,
        availableVideoQualities: [
          {
            key: actualQuality,
            label: actualQuality,
            width: Number(source.width) || undefined,
            height: Number(source.height) || resolution,
            size,
            bitrate: Number(source.bitrate) || undefined,
            mimeType: "video/mp4",
          },
        ],
        expiresAt: expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : undefined,
      };
    } catch (error) {
      sdk.log.error(`[网易云] 获取 MV 播放源错误: ${error.message}`);
      return null;
    }
  }

  async function getMusicInfo(musicBase) {
    if (musicBase.artwork && musicBase.qualities && Object.keys(musicBase.qualities).length > 0) {
      return {
        id: musicBase.id,
        title: musicBase.title,
        artist: musicBase.artist,
        album: musicBase.album,
        albumId: musicBase.albumId,
        artwork: musicBase.artwork,
        qualities: musicBase.qualities,
        mv: musicBase.mv || musicBase.mvId || musicBase.mvid,
        platform: "网易云音乐",
      };
    }

    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const songId = musicBase.id || musicBase.songid;
    if (!songId) return null;

    try {
      const data = { id: songId, ids: `[${songId}]` };
      const result = (
        await httpGet("http://music.163.com/api/song/detail", {
          headers,
          params: data,
        })
      ).data;

      if (!result.songs || result.songs.length === 0) return null;

      const song = result.songs[0];
      const album = song.album || song.al;
      const artists = song.artists || song.ar || [];

      let qualities = {};
      try {
        qualities = await getMusicQualityInfo(songId);
      } catch (e) {
        sdk.log.error("[网易云] 获取音质信息失败:", e.message);
      }

      return {
        id: song.id,
        title: song.name,
        artist: artists.map((a) => a.name).join(", "),
        album: album ? album.name : undefined,
        albumId: album ? album.id : undefined,
        artwork: album ? album.picUrl : undefined,
        duration: song.duration ? Math.floor(song.duration / 1000) : undefined,
        qualities: Object.keys(qualities).length > 0 ? qualities : { "128k": {}, "320k": {} },
        mv: song.mv || song.mvid || undefined,
        platform: "网易云音乐",
      };
    } catch (error) {
      sdk.log.error("[网易云] getMusicInfo 错误:", error.message);
      return null;
    }
  }

  async function getLyric(musicItem) {
    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const eapiData = {
      id: musicItem.id,
      cp: false,
      tv: 0,
      lv: 0,
      rv: 0,
      kv: 0,
      yv: 0,
      ytv: 0,
      yrv: 0,
    };

    try {
      const encrypted = eapiEncrypt("/api/song/lyric/v1", eapiData);
      const result = (
        await http({
          method: "post",
          url: "https://interface3.music.163.com/eapi/song/lyric/v1",
          headers,
          data: formEncode(encrypted),
        })
      ).data;

      if (result.code !== 200) {
        throw new Error("Failed to get lyrics");
      }

      let rawLrc = null;
      let translation = null;
      let romanization = null;

      if (result.yrc?.lyric) {
        rawLrc = parseYrcToQrc(result.yrc.lyric);
      }
      if (!rawLrc && result.lrc?.lyric) {
        rawLrc = normalizeWyLyricText(result.lrc.lyric);
      }

      if (result.ytlrc?.lyric) {
        translation = parseYrcTrans(result.ytlrc.lyric);
      }
      if (!translation && result.tlyric?.lyric) {
        translation = normalizeWyLyricText(result.tlyric.lyric);
      }

      if (result.yromalrc?.lyric) {
        romanization = parseYrcTrans(result.yromalrc.lyric);
      }
      if (!romanization && result.romalrc?.lyric) {
        romanization = normalizeWyLyricText(result.romalrc.lyric);
      }

      return { rawLrc, translation, romanization };
    } catch (error) {
      sdk.log.error("[网易云] eapi获取歌词失败，尝试weapi:", error.message);

      const data = { id: musicItem.id, lv: -1, tv: -1, rv: -1, csrf_token: "" };
      const pae = getParamsAndEnc(JSON.stringify(data));
      const paeData = formEncode(pae);
      const result = (
        await http({
          method: "post",
          url: `https://interface.music.163.com/weapi/song/lyric?csrf_token=`,
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          data: paeData,
        })
      ).data;

      return {
        rawLrc: normalizeWyLyricText(result.lrc?.lyric),
        translation: normalizeWyLyricText(result.tlyric?.lyric),
        romanization: normalizeWyLyricText(result.romalrc?.lyric),
      };
    }
  }

  async function getAlbumInfo(albumItem) {
    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const data = {
      resourceType: 3,
      resourceId: albumItem.id,
      limit: 15,
      csrf_token: "",
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = formEncode(pae);
    const res = (
      await http({
        method: "post",
        url: `https://interface.music.163.com/weapi/v1/album/${albumItem.id}?csrf_token=`,
        headers,
        data: paeData,
      })
    ).data;
    // Album/artist list payloads usually stop at hr(HR); jm/je need music/detail
    const musicList = await withBatchQualities(res.songs || []);
    return {
      albumItem: { description: res.album.description },
      musicList,
    };
  }

  // Song and album totals have separate meanings; never reuse a generic worksNum.
  function artistWorksItem(artist, type, ...totals) {
    const item = { ...artist };
    delete item.songCount;
    delete item.albumCount;
    const songs = playlistSheetItem(
      {},
      artist?.songCount,
      artist?.musicSize,
      artist?.trackCount,
      artist?.musicCount,
      artist?.song_count,
      artist?.worksNums,
    ).worksNum;
    const albums = playlistSheetItem(
      {},
      artist?.albumCount,
      artist?.albumSize,
      artist?.albumNum,
      artist?.album_count,
    ).worksNum;
    if (songs != null) item.songCount = songs;
    if (albums != null) item.albumCount = albums;
    const key = type === "album" ? "albumCount" : "songCount";
    const total = playlistSheetItem({}, ...totals, item[key]).worksNum;
    if (total != null) item[key] = total;
    return item;
  }

  async function getArtistWorks(artistItem, page, type) {
    const data = {
      csrf_token: "",
      ...(type === "album" ? { limit: 50, offset: (page - 1) * 50 } : {}),
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = formEncode(pae);
    const headers = {
      authority: "music.163.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
      "content-type": "application/x-www-form-urlencoded",
      accept: "*/*",
      origin: "https://music.163.com",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      referer: "https://music.163.com/search/",
      "accept-language": "zh-CN,zh;q=0.9",
    };
    if (type === "music") {
      const res = (
        await http({
          method: "post",
          url: `https://music.163.com/weapi/v1/artist/${artistItem.id}?csrf_token=`,
          headers,
          data: paeData,
        })
      ).data;
      const hotSongs = res.hotSongs || [];
      // hotSongs file fields often only go to hr(HR); batch-fetch master/atmos
      const dataList = await withBatchQualities(hotSongs);
      return {
        isEnd: true,
        artistItem: artistWorksItem(
          {
            ...artistItem,
            songCount: res.artist?.musicSize ?? artistItem.songCount,
            albumCount: res.artist?.albumSize ?? artistItem.albumCount,
          },
          "music",
        ),
        data: dataList,
      };
    } else if (type === "album") {
      const res = (
        await http({
          method: "post",
          url: `https://music.163.com/weapi/artist/albums/${artistItem.id}?csrf_token=`,
          headers,
          data: paeData,
        })
      ).data;
      return {
        isEnd: typeof res.more === "boolean" ? !res.more : res.hotAlbums.length < 50,
        artistItem: artistWorksItem(
          {
            ...artistItem,
            songCount: res.artist?.musicSize ?? artistItem.songCount,
            albumCount: res.artist?.albumSize ?? artistItem.albumCount,
          },
          "album",
        ),
        data: res.hotAlbums.map(formatAlbumItem),
      };
    }
  }

  async function getSheetMusicById(id, withSheetInfo = false) {
    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    };
    const sheetDetail = (
      await httpGet(`https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`, {
        headers,
      })
    ).data;
    const playlist = sheetDetail.playlist;
    if (!playlist || !Array.isArray(playlist.trackIds)) {
      throw new Error("[网易云] 歌单详情数据异常");
    }
    const trackIds = (playlist?.trackIds || []).map((_) => _.id);
    let result = [];
    let idx = 0;
    while (idx * 200 < trackIds.length) {
      const res = await getValidMusicItems(trackIds.slice(idx * 200, (idx + 1) * 200), {
        strict: true,
        withQuality: true,
      });
      result = result.concat(res);
      ++idx;
    }
    if (!withSheetInfo) {
      return result;
    }

    return {
      id: String(playlist?.id || id),
      title: playlist?.name || "",
      artwork: playlist?.coverImgUrl,
      artist: playlist?.creator?.nickname || "",
      description: playlist?.description || "",
      worksNum: Number(playlist?.trackCount) || result.length,
      playCount: Number(playlist?.playCount) || 0,
      createAt: Number(playlist?.createTime) || undefined,
      musicList: result,
    };
  }

  async function importMusicSheet(urlLike) {
    if (/^wy-daily(?:-\d{4}-\d{2}-\d{2})?$/.test(String(urlLike || "").trim())) {
      const daily = await getDailyRecommendations();
      if (daily.state !== "ready") throw new Error("每日推荐暂不可用，请检查网易云连接状态");
      return daily.sheetItem;
    }

    // 改进的正则：支持多种 URL 格式（包括 # 路由）
    // 匹配: y.music.163.com, music.163.com, music.163.com/#/, music.163.com/m/, 纯数字
    const matchResult = urlLike.match(
      /(?:https?:\/\/(?:y\.)?music\.163\.com\/(?:#\/|m\/)?playlist[\/\?](?:.*[?&])?id=(\d+))|(?:^\s*(\d+)\s*$)/,
    );

    const id = matchResult?.[1] || matchResult?.[2];

    if (!id) {
      sdk.log.error("[网易云] 无法从 URL 中提取歌单 ID:", urlLike);
      return null;
    }

    return getSheetMusicById(id, true);
  }

  // Playlist metadata is independent of the number of tracks loaded on this page.
  // Ignore absent/invalid counts; zero is a valid total for an empty playlist.
  function playlistSheetItem(sheet, ...totals) {
    const item = { ...sheet };
    delete item.worksNum;
    for (const value of [...totals, sheet?.worksNum, sheet?.trackCount, sheet?.musicCount]) {
      if (typeof value !== "number" && typeof value !== "string") continue;
      if (String(value).trim() === "") continue;
      const count = Number(value);
      if (Number.isSafeInteger(count) && count >= 0) {
        item.worksNum = count;
        break;
      }
    }
    return item;
  }

  async function getMusicSheetInfo(sheet, page) {
    if (/^wy-daily(?:-\d{4}-\d{2}-\d{2})?$/.test(String(sheet?.id || sheet || ""))) {
      if (Number(page || 1) > 1) return { isEnd: true, sheetItem: sheet, musicList: [] };
      const daily = await getDailyRecommendations();
      if (daily.state !== "ready") throw new Error("每日推荐暂不可用，请检查网易云连接状态");
      return { isEnd: true, sheetItem: daily.sheetItem, musicList: daily.musicList };
    }

    const id = sheet?.id != null && sheet.id !== "" ? String(sheet.id) : "";
    if (!id) {
      return { isEnd: true, musicList: [] };
    }

    // 优先 sheet 回传 → 模块缓存（宿主只合并 result.sheetItem，顶层 _trackIds 无效）
    let trackIds =
      (Array.isArray(sheet._trackIds) && sheet._trackIds.length ? sheet._trackIds : null) ||
      sheetTrackIdsCache.get(id) ||
      null;

    let total = sheetTrackTotalsCache.get(id) ?? sheet.worksNum;
    if (!trackIds) {
      try {
        const headers = {
          Referer: "https://y.music.163.com/",
          Origin: "https://y.music.163.com/",
          authority: "music.163.com",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
        };
        const sheetDetail = (
          await httpGet(`https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`, {
            headers,
          })
        ).data;
        if (sheetDetail?.code !== 200 || !Array.isArray(sheetDetail?.playlist?.trackIds)) {
          throw new Error("Provider playlist request failed");
        }
        total = sheetDetail.playlist.trackCount;
        trackIds = (sheetDetail?.playlist?.trackIds || [])
          .map((_) => _.id)
          .filter((tid) => tid != null);
      } catch (e) {
        sdk.log.error("[网易云] 获取歌单详情失败:", e?.message || e);
        throw e;
      }
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const sheetItem = playlistSheetItem(
      { id, ...(pageNum <= 1 ? { _trackIds: trackIds } : {}) },
      total,
      trackIds.length,
    );
    if (!trackIds.length) {
      return { isEnd: true, sheetItem, musicList: [] };
    }

    rememberSheetTrackIds(id, trackIds, sheetItem.worksNum);

    const pageSize = 40;
    const start = (pageNum - 1) * pageSize;
    const currentPageIds = trackIds.slice(start, start + pageSize);
    const isEnd = start + pageSize >= trackIds.length;

    if (!currentPageIds.length) {
      return {
        isEnd: true,
        musicList: [],
        sheetItem,
      };
    }

    const res = await getValidMusicItems(currentPageIds, { withQuality: true, strict: true });

    return {
      isEnd,
      musicList: res,
      // 必须放在 sheetItem 内，宿主才会合并并写回 ref 供下一页使用
      sheetItem,
    };
  }

  async function getRecommendSheetTags() {
    const data = { csrf_token: "" };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = formEncode(pae);
    const res = (
      await http({
        method: "post",
        url: "https://music.163.com/weapi/playlist/catalogue",
        headers,
        data: paeData,
      })
    ).data;
    const cats = res.categories;
    const map = {};
    const catData = Object.entries(cats).map((_) => {
      const tagData = {
        title: _[1],
        data: [],
      };
      map[_[0]] = tagData;
      return tagData;
    });
    const pinned = [];
    res.sub.forEach((tag) => {
      const _tag = {
        id: tag.name,
        title: tag.name,
      };
      if (tag.hot) {
        pinned.push(_tag);
      }
      map[tag.category].data.push(_tag);
    });
    return {
      pinned,
      data: catData,
    };
  }

  async function getRecommendSheetsByTag(tag, page) {
    const pageSize = 20;
    const data = {
      cat: tag.id || "全部",
      order: "hot",
      limit: pageSize,
      offset: (page - 1) * pageSize,
      total: true,
      csrf_token: "",
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = formEncode(pae);
    const res = (
      await http({
        method: "post",
        url: "https://music.163.com/weapi/playlist/list",
        headers,
        data: paeData,
      })
    ).data;
    const playLists = res.playlists.map((_) => ({
      // 必须 string：URL params 是字符串，number 会导致宿主 isSameMedia 失败 → 分页整表重载抽搐
      id: String(_.id),
      artist: _.creator.nickname,
      title: _.name,
      artwork: _.coverImgUrl,
      playCount: _.playCount,
      createUserId: _.userId,
      createTime: _.createTime,
      description: _.description,
    }));
    return {
      isEnd: !(res.more === true),
      data: playLists,
    };
  }

  // The public provider discovers chart categories from this HTML page. Keep
  // that source and its h2/ul grouping; the JSON toplist API loses categories.
  function parseTopListGroups(html) {
    const opening =
      /<([a-z][\w:-]*)\b[^>]*\bclass\s*=\s*(["'])[^"']*\bn-minelst\b[^"']*\2[^>]*>/i.exec(
        String(html),
      );
    if (!opening) throw new Error("Provider chart page has no chart navigation");
    const root = { tag: opening[1].toLowerCase(), children: [] };
    const stack = [root];
    const source = String(html).slice(opening.index + opening[0].length);
    const tokens = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi;
    const voidTags = new Set(["img", "br", "hr", "input", "meta", "link", "source", "wbr"]);
    const attr = (text, name) => {
      const match = new RegExp(
        "\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
        "i",
      ).exec(text);
      return match ? sdk.text.decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : "";
    };
    let token;
    while ((token = tokens.exec(source)) && stack.length) {
      const value = token[0];
      if (value.startsWith("<!--")) continue;
      if (value.startsWith("</")) {
        const tag = value
          .slice(2)
          .match(/^[\w:-]+/)[0]
          .toLowerCase();
        const index = stack.map((node) => node.tag).lastIndexOf(tag);
        if (index >= 0) stack.length = index;
      } else if (value.startsWith("<")) {
        const tag = value
          .slice(1)
          .match(/^[\w:-]+/)[0]
          .toLowerCase();
        const node = { tag, raw: value, children: [] };
        stack[stack.length - 1].children.push(node);
        if (!voidTags.has(tag) && !value.endsWith("/>")) stack.push(node);
      } else stack[stack.length - 1].children.push({ text: value });
    }
    const text = (node) =>
      node.text != null ? sdk.text.decodeHtml(node.text) : (node.children || []).map(text).join("");
    const find = (node, predicate) => {
      for (const child of node.children || []) {
        if (predicate(child)) return child;
        const found = find(child, predicate);
        if (found) return found;
      }
      return null;
    };
    const hasClass = (node, name) =>
      attr(node.raw || "", "class")
        .split(/\s+/)
        .includes(name);
    const groups = [];
    let group;
    for (const node of root.children) {
      if (node.tag === "h2") {
        if (group?.title) groups.push(group);
        group = { title: text(node), data: [] };
      } else if (node.tag === "ul" && group) {
        group.data = node.children
          .filter((child) => child.tag)
          .map((item) => {
            const image = find(item, (child) => child.tag === "img");
            const coverImg = attr(image?.raw || "", "src").replace(
              /(\.jpg\?).*/,
              ".jpg?param=800y800",
            );
            return {
              id: attr(item.raw, "data-res-id"),
              coverImg,
              artwork: coverImg,
              title: text(
                find(item, (child) => child.tag === "p" && hasClass(child, "name")) || {},
              ),
              description: text(
                find(item, (child) => child.tag === "p" && hasClass(child, "s-fc4")) || {},
              ),
            };
          });
      }
    }
    if (group?.title) groups.push(group);
    return groups;
  }
  async function getTopLists() {
    const response = await httpGet("https://music.163.com/discover/toplist", {
      headers: {
        referer: "https://music.163.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
      },
      responseType: "text",
    });
    return parseTopListGroups(response.data);
  }

  async function getTopListDetail(topListItem, page = 1) {
    return getMusicSheetInfo(topListItem, page);
  }
  // YRC 逐字歌词转 QRC 格式

  async function getMusicComments(musicItem, page = 1) {
    const pageSize = 20;
    const id = "R_SO_4_" + musicItem.id;

    try {
      const pae = getParamsAndEnc(
        JSON.stringify({
          rid: id,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          csrf_token: "",
        }),
      );

      const res = await httpPost(
        `https://music.163.com/weapi/v1/resource/hotcomments/${id}`,
        formEncode(pae),
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
            accept: "*/*",
            origin: "https://music.163.com",
            referer: "http://music.163.com/",
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      if (res.status !== 200 || res.data?.code !== 200) {
        throw new Error("Provider comments request failed");
      }

      const hotComments = (res.data.hotComments || []).map((item) => ({
        id: item.commentId?.toString(),
        nickName: item.user?.nickname || "",
        avatar: item.user?.avatarUrl,
        comment: item.content || "",
        like: item.likedCount,
        createAt: item.time,
        location: item.ipLocation?.location,
        replies: (item.beReplied || []).map((reply) => ({
          id: reply.beRepliedCommentId?.toString(),
          nickName: reply.user?.nickname || "",
          avatar: reply.user?.avatarUrl,
          comment: reply.content || "",
          like: null,
          createAt: null,
          location: reply.ipLocation?.location,
        })),
      }));

      const hasMore = res.data.hasMore || false;

      return {
        isEnd: !hasMore,
        data: hotComments,
      };
    } catch (error) {
      sdk.log.error("[网易云] 获取热评失败:", error);
      throw error;
    }
  }

  function getMusicDetailPageUrl(musicItem) {
    const songId = musicItem.songmid || musicItem.id;
    return songId ? `https://music.163.com/#/song?id=${songId}` : "";
  }

  function pickWyArtistAvatar(artist) {
    if (!artist || typeof artist !== "object") return "";
    const candidates = [
      artist.img1v1Url,
      artist.picUrl,
      artist.cover,
      artist.avatar,
      artist.img1v1,
      artist.pic,
    ];
    for (const raw of candidates) {
      if (!raw || typeof raw !== "string") continue;
      if (raw.includes("5639395138885805")) continue;
      if (raw.includes("default")) continue;
      // Prefer larger cover when size token exists
      return raw.replace(/param=\d+y\d+/i, "param=300y300");
    }
    return "";
  }

  function formatWyArtistInfo(artist, artistItem) {
    if (!artist) return null;
    return {
      id: String(artist.id ?? artistItem.id),
      name: artist.name || artistItem.name || "",
      avatar: pickWyArtistAvatar(artist),
      description: artist.briefDesc || artist.description || artist.desc || "",
      worksNum: artist.musicSize,
      songCount: artist.musicSize,
      albumCount: artist.albumSize,
      platform: "网易云音乐",
    };
  }

  /** 补全作者头像/简介（歌曲列表里 ar 常无 pic） */
  async function getArtistInfo(artistItem) {
    if (!artistItem?.id) {
      return null;
    }
    const artistId = artistItem.id;

    // 1) Public API first (no weapi crypto; more reliable in plugin host)
    try {
      const res = (
        await http({
          method: "get",
          url: `https://music.163.com/api/artist/${artistId}`,
          headers: {
            ...headers,
            referer: "https://music.163.com/",
          },
          timeout: 10000,
        })
      ).data;
      const info = formatWyArtistInfo(res?.artist, artistItem);
      if (info && (info.avatar || info.name)) {
        return info;
      }
    } catch (e) {
      sdk.log.warn("[网易云] api/artist 失败，尝试 weapi:", e?.message || e);
    }

    // 2) weapi fallback (same as getArtistWorks)
    try {
      const data = { csrf_token: "" };
      const pae = getParamsAndEnc(JSON.stringify(data));
      const paeData = formEncode(pae);
      const res = (
        await http({
          method: "post",
          url: `https://music.163.com/weapi/v1/artist/${artistId}?csrf_token=`,
          headers,
          data: paeData,
          timeout: 10000,
        })
      ).data;
      const info = formatWyArtistInfo(res?.artist, artistItem);
      if (info) {
        return info;
      }
    } catch (e) {
      sdk.log.error("[网易云] 获取歌手详情失败:", e?.message || e);
    }
    return null;
  }

  async function getHotSearch() {
    const response = await httpPost(
      "https://interface3.music.163.com/eapi/search/chart/detail",
      formEncode(eapiEncrypt("/api/search/chart/detail", { id: "HOT_SEARCH_SONG#@#" })),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://music.163.com/",
        },
        timeout: 10000,
      },
    );
    const body = response.data;
    const list = body?.data?.itemList;
    if (body?.code !== 200 || !Array.isArray(list)) {
      throw new Error("网易云音乐热搜加载失败，请稍后重试");
    }
    return [
      ...new Set(
        list
          .map((item) => item?.searchWord)
          .filter((word) => typeof word === "string" && word.trim())
          .map((word) => word.trim()),
      ),
    ].slice(0, 30);
  }

  function getPluginSiteUrl(path, fallback) {
    const match = String((typeof UPDATE_URL === "string" ? UPDATE_URL : "") || "").match(
      /^(https?:\/\/(?:\[[^\]]+\]|[^/?#:@]+)(?::\d+)?)\/api\/plugins\/(?:source|xheaders)\//i,
    );
    return match ? match[1] + path : fallback;
  }
  function wyVariables() {
    return true ? sdk.settings || {} : {};
  }

  async function getDailyRecommendations() {
    const connectUrl = getPluginSiteUrl("/connect", "https://mc.vsaa.cn/connect") + "?platform=wy";
    const result = { title: "每日推荐", accountName: "网易云音乐", connectUrl };
    const token = String(wyVariables().wy_user_id || "").trim();
    if (!token) return { ...result, state: "unconfigured" };
    if (!/^wy_[a-f0-9]{48}$/.test(token)) return { ...result, state: "login_required" };
    try {
      const response = await httpGet(
        getPluginSiteUrl(
          "/api/wy/recommendations/daily",
          "https://mc.vsaa.cn/api/wy/recommendations/daily",
        ),
        {
          headers: { "X-User-Id": token },
          timeout: 60000,
        },
      );
      const body = response.data;
      if (body?.code !== 0)
        return {
          ...result,
          state: [-100, 401, 403, 1001, 1005, 28010].includes(body?.code)
            ? "login_required"
            : "error",
        };
      const data = body.data;
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      if (data?.date !== today || !Array.isArray(data.tracks))
        return { ...result, state: "updating" };
      if (!Number.isFinite(data.refresh_at) || data.refresh_at <= Date.now())
        return { ...result, state: "updating" };
      const image = (value) =>
        typeof value === "string" && /^(?:https?:)?\/\//.test(value)
          ? value.replace(/^http:\/\//, "https://").replace(/^\/\//, "https://")
          : "";
      const songs = data.tracks
        .filter((t) => /^[1-9]\d*$/.test(String(t?.id || "")))
        .map((t) => ({
          ...t,
          id: t.id,
          name: t.title || t.name,
          ar: t.artists || t.ar || [],
          al: {
            ...(t.album || t.al || {}),
            picUrl: image(t.cover || t.album?.picUrl || t.al?.picUrl),
          },
          dt: t.duration_ms ?? t.duration,
        }));
      const musicList = songs.map(formatMusicItem);
      const qualityMap = await getBatchMusicQualityInfo(
        songs.map((t) => t.id),
        songs,
      );
      for (const item of musicList) item.qualities = { ...item.qualities, ...qualityMap[item.id] };
      const artwork = image(data.cover) || musicList.find((t) => t.artwork)?.artwork || "";
      const description =
        typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : "根据你的音乐偏好，每天更新推荐歌曲。";
      return {
        ...result,
        title: data.title || result.title,
        state: "ready",
        date: data.date,
        refreshAt: data.refresh_at,
        sheetItem: {
          id: "wy-daily-" + data.date,
          title: data.title || result.title,
          artist: result.accountName,
          artwork,
          coverImg: artwork,
          description,
          worksNum: musicList.length,
          musicList,
        },
        musicList,
      };
    } catch (error) {
      return {
        ...result,
        state: [401, 403].includes(error?.response?.status) ? "login_required" : "error",
      };
    }
  }

  async function search(query, page, type) {
    if (type === "music") {
      return await searchMusic(query, page);
    }
    if (type === "album") {
      return await searchAlbum(query, page);
    }
    if (type === "artist") {
      return await searchArtist(query, page);
    }
    if (type === "sheet") {
      return await searchMusicSheet(query, page);
    }
    if (type === "lyric") {
      return await searchLyric(query, page);
    }
  }
  async function getMediaSource(musicItem, quality) {
    if (typeof requestMusicUrl !== "function") {
      throw Object.assign(new Error("Configure a music URL source"), {
        code: "authentication_required",
      });
    }
    if (
      musicItem.qualities &&
      Object.keys(musicItem.qualities).length &&
      !musicItem.qualities[quality]
    ) {
      throw new Error(`该歌曲不支持 ${quality} 音质`);
    }
    const result = await requestMusicUrl(musicItem, quality, sdk);
    return typeof result === "string" ? { url: result, quality } : result;
  }
  let activeImport = null;
  function importedSnapshot(entity) {
    if (!entity._bakaImportToken) return null;
    if (
      !activeImport ||
      activeImport.token !== entity._bakaImportToken ||
      activeImport.entity.id !== entity.id ||
      activeImport.expiresAt <= Date.now()
    ) {
      activeImport = null;
      throw Object.assign(new Error("Imported collection expired; import its share link again"), {
        code: "temporary_unavailable",
      });
    }
    return activeImport;
  }
  async function importCollection(url) {
    const imported = await importMusicSheet(url);
    if (!imported || !Array.isArray(imported.musicList) || imported.id == null) {
      throw Object.assign(new Error("The share link did not return a valid collection"), {
        code: "track_unavailable",
      });
    }
    if (imported.musicList.length > 100000) {
      throw Object.assign(new Error("Imported collection exceeds the 100000-track limit"), {
        code: "temporary_unavailable",
      });
    }
    const token = sdk.crypto.randomBytes(16);
    const entity = { ...imported, type: imported.type || "sheet", _bakaImportToken: token };
    delete entity.musicList;
    activeImport = {
      token,
      entity,
      items: imported.musicList,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    return entity;
  }
  return {
    search,
    entity: (entity) =>
      entityKind(entity) === "artist" ? getArtistInfo(entity) : getMusicInfo(entity),
    collection: async (entity) => {
      const snapshot = importedSnapshot(entity);
      if (snapshot) return snapshot.entity;
      if (entityKind(entity) === "artist") return getArtistInfo(entity);
      const result = await (entityKind(entity) === "chart"
        ? getTopListDetail(entity, 1)
        : entityKind(entity) === "album"
          ? getAlbumInfo(entity)
          : getMusicSheetInfo(entity, 1));
      const metadata = result.albumItem || result.sheetItem || result;
      const { musicList, data, isEnd, ...details } = metadata;
      return { ...entity, ...details };
    },
    members: (entity, page, kind) => {
      const snapshot = importedSnapshot(entity);
      if (snapshot)
        return {
          isEnd: true,
          musicList: snapshot.items,
          sheetItem: snapshot.entity,
          total: snapshot.items.length,
        };
      return entityKind(entity) === "artist"
        ? getArtistWorks(entity, page, kind)
        : entityKind(entity) === "chart"
          ? getTopListDetail(entity, page)
          : entityKind(entity) === "album"
            ? getAlbumInfo(entity, page)
            : getMusicSheetInfo(entity, page);
    },
    charts: getTopLists,
    tags: getRecommendSheetTags,
    playlists: getRecommendSheetsByTag,
    hotSearch: getHotSearch,
    daily: getDailyRecommendations,

    resolve: getMediaSource,
    video: getMvSource,
    lyric: getLyric,
    comments: getMusicComments,
    importSheet: importCollection,
    share: getMusicDetailPageUrl,
  };
}

const handlers = {
  search: async (request, sdk) =>
    pageResult(
      await operations(sdk).search(request.query, pageNumber(request.cursor), request.kind),
      request,
    ),
  entities: { get: async ({ entity }, sdk) => operations(sdk).entity(entity) },
  collections: {
    get: async ({ entity }, sdk) => operations(sdk).collection(entity),
    members: async (request, sdk) =>
      pageResult(
        await operations(sdk).members(request.entity, pageNumber(request.cursor), request.kind),
        request,
      ),
  },
  discovery: {
    charts: async (request, sdk) => sliceResult(await operations(sdk).charts(), request),
    playlistTags: async (request, sdk) => tagResult(await operations(sdk).tags(), request),
    playlists: async (request, sdk) =>
      pageResult(await operations(sdk).playlists(request.tag, pageNumber(request.cursor)), request),
    hotSearch: async (request, sdk) => sliceResult(await operations(sdk).hotSearch(), request),
    daily: async (request, sdk) => dailyResult(await operations(sdk).daily(), request),
  },
  media: {
    prepare: async ({ entity, quality }) => ({
      protocol: "lx",
      source: "wy",
      musicInfo: {
        ...entity,
        songmid: entity.songmid || entity.hash || entity.copyrightId || entity.id,
      },
      quality,
    }),
    resolve: async ({ entity, quality }, sdk) =>
      operations(sdk).resolve(entity, quality || manifest.supportedQualities[0]),
    video: async ({ entity, quality }, sdk) => operations(sdk).video(entity, quality || "1080p"),
  },
  lyrics: { get: async ({ entity }, sdk) => operations(sdk).lyric(entity) },
  comments: {
    list: async (request, sdk) =>
      pageResult(
        await operations(sdk).comments(request.entity, pageNumber(request.cursor)),
        request,
      ),
  },
  links: {
    resolve: async ({ url }, sdk) => operations(sdk).importSheet(url),
    share: async ({ entity }, sdk) => operations(sdk).share(entity),
  },
};
// Bind every public page cursor to its catalog/account request. Only digests and
// bounded paging state cross the boundary; credentials and entity metadata do not.
function bindPageHandlers() {
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value).sort()) result[key] = stable(value[key]);
      return result;
    }
    return value;
  }
  for (const capability of manifest.capabilities) {
    if (
      capability !== "search" &&
      capability !== "collections.members" &&
      capability !== "comments.list" &&
      !capability.startsWith("discovery.")
    )
      continue;
    const keys = capability.split(".");
    const key = keys.pop();
    const group = keys.reduce((value, name) => value[name], handlers);
    const handler = group[key];
    group[key] = async (request, sdk) => {
      const entity = request.entity;
      const context = {
        provider: manifest.id,
        version: manifest.version,
        source: manifest.srcUrl,
        capability,
        entity: entity
          ? { id: entity.id, type: entityKind(entity), token: entity._bakaImportToken }
          : null,
        query: request.query,
        kind: request.kind,
        tag:
          request.tag && typeof request.tag === "object" && request.tag.id != null
            ? { id: request.tag.id, digest: request.tag.digest }
            : request.tag,
        sort: request.sort,
        context: request.context,
        revision: request.revision,
        sourceRevision: request.sourceRevision,
        accountRevision: request.accountRevision,
        account: sdk.settings || {},
        day: capability === "discovery.daily" ? new Date().toISOString().slice(0, 10) : null,
      };
      const binding = sdk.crypto.hash("sha256", sdk.bytes.encode(JSON.stringify(stable(context))));
      let cursor = null;
      if (request.cursor != null) {
        let value;
        try {
          if (
            typeof request.cursor !== "string" ||
            request.cursor.length > 2048 ||
            !request.cursor.startsWith("v2c:")
          )
            throw new Error();
          value = JSON.parse(request.cursor.slice(4));
          if (!value || value.binding !== binding || typeof value.cursor !== "string")
            throw new Error();
          pageState(value.cursor);
        } catch (_) {
          throw new Error("Provider cursor does not match this request or account");
        }
        cursor = value.cursor;
      }
      const page = await handler({ ...request, cursor }, sdk);
      if (page.nextCursor != null) {
        page.nextCursor = "v2c:" + JSON.stringify({ binding, cursor: page.nextCursor });
      }
      return page;
    };
  }
}
bindPageHandlers();
module.exports = { manifest, handlers };
