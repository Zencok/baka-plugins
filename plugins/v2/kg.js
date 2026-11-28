// @baka-provider 2
// {{REQUEST_HANDLER}}

"use strict";

// Public BakaMusic protocols, statically migrated to the QuickJS V2 SDK.
const manifest = {
  apiVersion: 2,
  kind: "provider",
  sourceId: "kg.v1",
  id: "cc.baka.kg",
  name: "酷狗音乐",
  version: "1.0.4",
  srcUrl: typeof UPDATE_URL === "string" ? UPDATE_URL : "",
  author: "BakaMusic",
  cacheControl: "no-cache",
  primaryKey: ["id", "album_id", "album_audio_id"],
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  supportedQualities: ["128k", "320k", "flac", "flac24bit", "hires", "atmos", "master"],
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
      key: "kg_user_id",
      name: "用户 ID",
      hint: "在 LyraMesh /connect 选择酷狗登录并复制连接码，用于个人每日推荐。",
    },
  ],
  hints: {
    importMusicSheet: [
      "支持酷狗新版 gcid 歌单分享链接，也可输入纯数字酷狗码。",
      "导入时间和歌单大小有关，请耐心等待",
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


function commentSort(value) {
  if (value == null || value === "hot") return "hot";
  if (value === "latest" || value === "new" || value === "newest") return "latest";
  throw new Error("Invalid comment sort; expected hot or latest");
}
function commentCount(value) {
  if ((typeof value !== "number" && typeof value !== "string") || !/^(0|[1-9]\d*)$/.test(String(value))) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}
function commentText(value) {
  // Keep URL and filesystem tokens intact before decoding provider line breaks.
  return String(value == null ? "" : value).split(/((?:https?:\/\/|www\.)[^\s<>]+|[A-Za-z]:[\\/][^\s<>]+|(?:^|[\s(\[])\/[A-Za-z0-9_.~-][^\s<>]*)/gi)
    .map((part, index) => index % 2 ? part : part.replace(/\\r\\n|\\n|\\r|\/r\/n|\/n|\r\n?|<br\s*\/?>|&#(?:10|13|x0?a|x0?d);/gi, "\n")).join("");
}
function normalizeComment(item) {
  const result = { ...item, comment: commentText(item.comment) };
  if (typeof result.avatar === "string" && result.avatar.startsWith("//")) result.avatar = "https:" + result.avatar;
  if (Array.isArray(item.replies)) result.replies = item.replies.map(normalizeComment);
  if (item.quote && typeof item.quote === "object") result.quote = normalizeComment(item.quote);
  return result;
}
function commentReplyContext(entity, rootId, childrenId, mixsongId) {
  return { v: 1, provider: "cc.baka.kg", entityId: entity.id, rootId: String(rootId), childrenId, mixsongId };
}
function commentRoot(entity, context) {
  if (context == null) return null;
  if (typeof context !== "object" || Array.isArray(context) || context.v !== 1 ||
      context.provider !== "cc.baka.kg" || context.entityId !== entity.id ||
      typeof context.rootId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(context.rootId) ||
      typeof context.childrenId !== "string" || !/^[1-9]\d{0,19}$/.test(context.childrenId) ||
      typeof context.mixsongId !== "string" || !/^[1-9]\d{0,19}$/.test(context.mixsongId) ||
      Object.keys(context).some(key => !["v", "provider", "entityId", "rootId", "childrenId", "mixsongId"].includes(key))) {
    throw new Error("Comment reply context does not match this provider or entity scope");
  }
  return context.rootId;
}
function commentMeta(item, entity, total, childrenId, mixsongId) {
  const count = commentCount(total);
  if (count != null) item.replyCount = count;
  if (item.id != null && (count == null || count > 0)) item.replyContext = commentReplyContext(entity, item.id, childrenId, mixsongId);
  return item;
}
function commentPageResult(result, request) {
  const state = pageState(request.cursor);
  const items = result.data;
  if (!Array.isArray(items) || items.length > 20 || (!items.length && result.isEnd === false) ||
      (state.offset > 0 && state.offset >= items.length)) throw new Error("Provider comment pagination did not advance");
  const end = Math.min(items.length, state.offset + pageLimit(request));
  let nextCursor = null;
  if (end < items.length) nextCursor = "v2:" + encodeURIComponent(JSON.stringify({ ...state, offset: end }));
  else if (result.isEnd === false) nextCursor = "v2:" + encodeURIComponent(JSON.stringify({ ...result.nextState, upstreamPage: state.upstreamPage + 1, offset: 0 }));
  return { items: items.slice(state.offset, end).map(normalizeComment), nextCursor,
    ...(Number.isSafeInteger(result.total) && result.total >= 0 ? { total: result.total } : {}) };
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

  function getPluginSiteUrl(path, fallback) {
    const source = String((typeof UPDATE_URL === "string" ? UPDATE_URL : "") || "");
    const match = source.match(
      /^(https?:\/\/(?:\[[^\]]+\]|[^/?#:@]+)(?::\d+)?)\/api\/plugins\/(?:source|xheaders)\//i,
    );
    return match ? match[1] + path : fallback;
  }
  function kgVariables() {
    return true ? sdk.settings || {} : {};
  }

  // Shared cover and artist identity normalization.
  function kgImage(...values) {
    for (const value of values) {
      if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) continue;
      return value
        .trim()
        .replace(/^http:\/\//i, "https://")
        .replace(/\{size\}/g, "400");
    }
    return "";
  }
  function kgSingerList(item) {
    const structured =
      Array.isArray(item.singers) && item.singers.length ? item.singers : item.authors;
    if (Array.isArray(structured) && structured.length) {
      return structured
        .map((s) => ({
          id: String(s.singer_id ?? s.author_id ?? s.id ?? ""),
          name: s.singer_name || s.author_name || s.name || "",
          avatar: kgImage(s.singer_img, s.avatar, s.img),
        }))
        .filter((s) => /^[1-9]\d*$/.test(s.id) && s.name);
    }
    const ids = String(item.singer_id || "")
      .split(",")
      .map((s) => s.trim());
    const names = String(item.singer_name || "")
      .split(",")
      .map((s) => s.trim());
    // Do not assign an arbitrary name to an ID when a joined field is ambiguous.
    if (ids.length !== names.length) return [];
    return ids
      .map((id, i) => ({
        id,
        name: names[i],
        avatar: ids.length === 1 ? kgImage(item.singer_img) : "",
      }))
      .filter((s) => /^[1-9]\d*$/.test(s.id) && s.name);
  }

  function dailyCover(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value)
      ? value.replace("{size}", "400")
      : "";
  }

  function formatDailyMusicItem(item) {
    const qualities = {};
    for (const [name, suffix, bitrate] of [
      ["128k", "128", 128000],
      ["320k", "320", 320000],
      ["flac", "flac", 1411000],
    ]) {
      const raw = item["filesize_" + suffix];
      const size = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
      const hash = item["hash_" + suffix];
      if (
        Number.isSafeInteger(size) &&
        size > 0 &&
        typeof hash === "string" &&
        /^[a-f0-9]{32}$/i.test(hash)
      )
        qualities[name] = { size: formatFileSize(size), bitrate, hash };
    }
    return {
      id: String(item.hash || item.hash_128 || item.FileHash || ""),
      title: item.songname || item.official_songname || item.filename || "",
      singerList: kgSingerList(item),
      artist: item.singername || item.author_name || "",
      album: item.album_name || item.remark || "",
      album_id: item.album_id || 0,
      album_audio_id: item.album_audio_id || item.audio_id || 0,
      duration: normalizeDurationSeconds(item),
      artwork: dailyCover(
        item.album_sizable_cover ||
          item.sizable_cover ||
          item.cover ||
          item.trans_param?.union_cover,
      ),
      sqhash: item.hash_flac || item.sqhash,
      "320hash": item.hash_320 || item["320hash"],
      kg_daily: true,
      qualities,
    };
  }

  async function getDailyRecommendations() {
    const connectUrl = getPluginSiteUrl("/connect", "https://mc.vsaa.cn/connect") + "?platform=kg";
    const result = { title: "每日三十首", accountName: "酷狗音乐", connectUrl };
    const token = String(kgVariables().kg_user_id || "").trim();
    if (!token) return { ...result, state: "unconfigured" };
    if (!/^kg_[a-f0-9]{48}$/.test(token)) return { ...result, state: "login_required" };
    try {
      const response = await httpGet(
        getPluginSiteUrl(
          "/api/kg/recommendations/daily",
          "https://mc.vsaa.cn/api/kg/recommendations/daily",
        ),
        { headers: { "X-User-Id": token }, timeout: 60000 },
      );
      const body = response.data;
      if (body?.code !== 0)
        return {
          ...result,
          state: [1001, 1004, 1005].includes(body?.code)
            ? "login_required"
            : [1002, 1003].includes(body?.code)
              ? "blocked"
              : "error",
        };
      const data = body.data;
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      if (data?.date !== today || !Array.isArray(data?.songs))
        return { ...result, state: "updating" };
      const ids = data.songs.map((item) =>
        String(item.hash || item.hash_128 || item.FileHash || item.song_id || ""),
      );
      const details = await getBatchMusicDetails(ids);
      const musicList = data.songs.map((song, index) => {
        const detail = details[ids[index]];
        const native = song.song_id != null;
        const hash = detail?.hash || (native ? "" : ids[index]);
        if (!/^[a-f0-9]{32}$/i.test(hash)) throw new Error("每日推荐歌曲信息暂不可用，请稍后重试");
        const item = formatDailyMusicItem(
          native
            ? {
                ...song,
                hash,
                songname: song.song_name,
                author_name: song.singer_name,
                album_audio_id: song.song_id,
                sizable_cover: song.album_img_large || song.album_img_medium || song.album_img,
              }
            : song,
        );
        item.qualities = { ...item.qualities, ...detail?.qualities };
        item.sqhash = item.qualities.flac?.hash || item.sqhash;
        item["320hash"] = item.qualities["320k"]?.hash || item["320hash"];
        return item;
      });
      await kgFillMissingImages(musicList);
      const artwork =
        dailyCover(data.cover_img_url) || musicList.find((item) => item.artwork)?.artwork || "";
      const description =
        (typeof data.sub_title === "string" && data.sub_title) ||
        (typeof data.long_cpw?.content === "string" ? data.long_cpw.content : "");
      return {
        ...result,
        state: "ready",
        date: data.date,
        refreshAt: data.refresh_at,
        sheetItem: {
          id: "kg-daily-" + data.date,
          title: result.title,
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
      const code = error?.response?.data?.code;
      return {
        ...result,
        state: [1001, 1004, 1005].includes(code)
          ? "login_required"
          : [1002, 1003].includes(code)
            ? "blocked"
            : "error",
      };
    }
  }

  ("use strict");

  const pageSize = 20;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "zh-CN,zh;q=0.9",
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

  const KRC_KEY = sdkBytes([
    0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
  ]);

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + "GB";
  }

  /** Normalize Kugou duration fields to seconds for the host player/list UI. */
  function normalizeDurationSeconds(item) {
    if (!item || typeof item !== "object") {
      return undefined;
    }
    // Prefer explicit millisecond fields.
    const msCandidates = [item.timelen, item.time_length, item.timelength];
    for (const raw of msCandidates) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        // > 10000 ≈ longer than ~2.7h if seconds → treat as ms
        return n > 10000 ? Math.floor(n / 1000) : Math.floor(n);
      }
    }
    const d = Number(item.duration);
    if (Number.isFinite(d) && d > 0) {
      return d > 10000 ? Math.floor(d / 1000) : Math.floor(d);
    }
    return undefined;
  }

  function formatMusicItem(_, qualityInfo = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;

    const fileHash = (_d = _.FileHash) !== null && _d !== void 0 ? _d : _.Grp[0].FileHash;
    let qualities = qualityInfo[fileHash] || {};

    if (Object.keys(qualities).length === 0) {
      const basicQualities = ["128k", "320k", "flac"];
      basicQualities.forEach((quality) => {
        qualities[quality] = {};
      });
    }

    const singers = _.Singers || [];
    const singerList = singers.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.img || "",
    }));
    const mvHash = _.MvHash || _.MVHash || _.mvhash || _.mvdata?.[0]?.hash;
    const mvId = _.mvdata?.[0]?.id;

    return {
      id: fileHash,
      title: (_a = _.SongName) !== null && _a !== void 0 ? _a : _.OriSongName,
      artist:
        (_b = _.SingerName) !== null && _b !== void 0 ? _b : singers.map((s) => s.name).join(", "),
      singerList: singerList,
      album: (_c = _.AlbumName) !== null && _c !== void 0 ? _c : _.Grp[0].AlbumName,
      album_id: (_e = _.AlbumID) !== null && _e !== void 0 ? _e : _.Grp[0].AlbumID,
      album_audio_id: 0,
      duration: _.Duration,
      artwork: ((_f = _.Image) !== null && _f !== void 0 ? _f : _.Grp[0].Image).replace(
        "{size}",
        "1080",
      ),
      "320hash": (_i = _.HQFileHash) !== null && _i !== void 0 ? _i : undefined,
      sqhash: (_g = _.SQFileHash) !== null && _g !== void 0 ? _g : undefined,
      ResFileHash: (_h = _.ResFileHash) !== null && _h !== void 0 ? _h : undefined,
      qualities: qualities,
      mv: mvHash || mvId || undefined,
      mvHash: mvHash || undefined,
      mvId: mvId || undefined,
    };
  }

  function formatExpandedMusicItem(_, qualityInfo = {}) {
    const fileHash = _.FileHash;
    let qualities = qualityInfo[fileHash] || {};

    if (Object.keys(qualities).length === 0) {
      const basicQualities = ["128k", "320k", "flac"];
      basicQualities.forEach((quality) => {
        qualities[quality] = {};
      });
    }

    const singers = _.Singers || [];
    let artist = _.SingerName;
    if (!artist && singers.length > 0) {
      artist = singers.map((s) => s.name).join(", ");
    }

    const singerList = singers.map((s) => ({
      id: s.id,
      name: s.name,
    }));
    const mvHash = _.MvHash || _.MVHash || _.mvhash || _.mvdata?.[0]?.hash;
    const mvId = _.mvdata?.[0]?.id;

    return {
      id: fileHash,
      title: _.SongName || _.OriSongName || "",
      artist: artist || "",
      singerList: singerList,
      album: _.AlbumName || "",
      album_id: _.AlbumID || 0,
      album_audio_id: 0,
      duration: _.Duration,
      artwork: _.Image ? _.Image.replace("{size}", "1080") : undefined,
      "320hash": _.HQFileHash || undefined,
      sqhash: _.SQFileHash || undefined,
      ResFileHash: _.ResFileHash || undefined,
      qualities: qualities,
      mv: mvHash || mvId || undefined,
      mvHash: mvHash || undefined,
      mvId: mvId || undefined,
    };
  }

  function formatMusicItem2(_) {
    var _a, _b, _c, _d, _e, _f, _g;

    const qualities = {};

    const commonQualities = ["128k", "320k", "flac"];
    commonQualities.forEach((quality) => {
      qualities[quality] = {};
    });

    const authors = _.authors || [];
    const singerList = authors.map((a) => ({
      id: a.author_id,
      name: a.author_name,
      avatar: a.avatar || "",
    }));

    return {
      id: _.hash,
      title: _.songname,
      artist:
        (_a = _.singername) !== null && _a !== void 0
          ? _a
          : ((_c =
              (_b = _.authors) === null || _b === void 0
                ? void 0
                : _b.map((_) => {
                    var _a;
                    return (_a = _ === null || _ === void 0 ? void 0 : _.author_name) !== null &&
                      _a !== void 0
                      ? _a
                      : "";
                  })) === null || _c === void 0
              ? void 0
              : _c.join(", ")) ||
            ((_f =
              (_e = (_d = _.filename) === null || _d === void 0 ? void 0 : _d.split("-")) ===
                null || _e === void 0
                ? void 0
                : _e[0]) === null || _f === void 0
              ? void 0
              : _f.trim()),
      singerList: singerList,
      album: (_g = _.album_name) !== null && _g !== void 0 ? _g : _.remark,
      album_id: _.album_id,
      album_audio_id: _.album_audio_id,
      artwork: _.album_sizable_cover ? _.album_sizable_cover.replace("{size}", "400") : undefined,
      duration: _.duration,
      "320hash": _["320hash"],
      sqhash: _.sqhash,
      origin_hash: _.origin_hash,
      qualities: qualities,
      mv: _.mvhash || _.mv_hash || _.MvHash || undefined,
      mvHash: _.mvhash || _.mv_hash || _.MvHash || undefined,
    };
  }

  function formatImportMusicItem(_) {
    var _a, _b, _c, _d, _e, _f, _g;
    let title = _.name;
    const singerName = _.singername;
    if (singerName && title) {
      const index = title.indexOf(singerName);
      if (index !== -1) {
        title =
          (_a = title.substring(index + singerName.length + 2)) === null || _a === void 0
            ? void 0
            : _a.trim();
      }
      if (!title) {
        title = singerName;
      }
    }
    const qualites = _.relate_goods;
    return {
      id: _.hash,
      title,
      artist: singerName,
      album: (_b = _.albumname) !== null && _b !== void 0 ? _b : "",
      album_id: _.album_id,
      album_audio_id: _.album_audio_id,
      artwork:
        (_d =
          (_c = _ === null || _ === void 0 ? void 0 : _.info) === null || _c === void 0
            ? void 0
            : _c.image) === null || _d === void 0
          ? void 0
          : _d.replace("{size}", "400"),
      "320hash":
        (_e = qualites === null || qualites === void 0 ? void 0 : qualites[1]) === null ||
        _e === void 0
          ? void 0
          : _e.hash,
      sqhash:
        (_f = qualites === null || qualites === void 0 ? void 0 : qualites[2]) === null ||
        _f === void 0
          ? void 0
          : _f.hash,
      origin_hash:
        (_g = qualites === null || qualites === void 0 ? void 0 : qualites[3]) === null ||
        _g === void 0
          ? void 0
          : _g.hash,
    };
  }

  function formatArtistSongItem(_) {
    var _a;

    const qualities = {};
    const basicQualities = ["128k", "320k", "flac"];
    basicQualities.forEach((quality) => {
      qualities[quality] = {};
    });

    let artist = "";
    let title = "";
    if (_.filename) {
      const parts = _.filename.split("-");
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts
          .slice(1)
          .join("-")
          .replace(/\.mp3$/i, "")
          .trim();
      } else {
        title = _.filename.replace(/\.mp3$/i, "").trim();
      }
    }

    return {
      id: _.hash,
      title: title || _.songname || "未知歌曲",
      artist: artist || _.singername || "未知歌手",
      album: (_a = _.album_name) !== null && _a !== void 0 ? _a : _.remark,
      album_id: _.album_id,
      album_audio_id: _.album_audio_id,
      artwork: _.trans_param?.union_cover
        ? _.trans_param.union_cover.replace("{size}", "400")
        : _.album_sizable_cover
          ? _.album_sizable_cover.replace("{size}", "400")
          : undefined,
      duration: normalizeDurationSeconds(_),
      "320hash": _.HQFileHash || _["320hash"],
      sqhash: _.SQFileHash || _.sqhash,
      origin_hash: _.origin_hash,
      qualities: qualities,
    };
  }

  function formatGatewayImportMusicItem(_, qualityInfo = {}) {
    const name = _.name || "";
    let artist = _.singername || "";
    let title = name;

    if (name.includes(" - ")) {
      const [rawArtist, ...titleParts] = name.split(" - ");
      artist = artist || rawArtist.trim();
      title = titleParts.join(" - ").trim();
    }

    if (!title) {
      title = _.songname || name;
    }

    const baseQualities = qualityInfo[_.hash] || {};
    const relateGoods = Array.isArray(_.relate_goods) ? _.relate_goods : [];
    const qualities = { ...baseQualities };

    relateGoods.forEach((item) => {
      if (!item || !item.hash) return;

      if (item.bitrate >= 999 || item.level >= 8) {
        qualities.master = qualities.master || {
          size: formatFileSize(item.size),
          bitrate: item.bitrate ? item.bitrate * 1000 : undefined,
          hash: item.hash,
        };
        return;
      }

      if (item.bitrate >= 500 || item.level >= 5) {
        qualities.flac = qualities.flac || {
          size: formatFileSize(item.size),
          bitrate: item.bitrate ? item.bitrate * 1000 : undefined,
          hash: item.hash,
        };
        return;
      }

      if (item.bitrate >= 320 || item.level >= 4) {
        qualities["320k"] = qualities["320k"] || {
          size: formatFileSize(item.size),
          bitrate: item.bitrate ? item.bitrate * 1000 : undefined,
          hash: item.hash,
        };
        return;
      }

      qualities["128k"] = qualities["128k"] || {
        size: formatFileSize(item.size),
        bitrate: item.bitrate ? item.bitrate * 1000 : undefined,
        hash: item.hash,
      };
    });

    if (Object.keys(qualities).length === 0) {
      qualities["128k"] = {};
      qualities["320k"] = {};
      qualities.flac = {};
    }

    return {
      id: _.hash,
      title,
      artist: artist || "未知歌手",
      album: _.albuminfo?.name || _.remark || "",
      album_id: _.album_id,
      album_audio_id: _.audio_id || _.album_audio_id || 0,
      artwork: _.trans_param?.union_cover
        ? _.trans_param.union_cover.replace("{size}", "400")
        : _.cover
          ? _.cover.replace("{size}", "400")
          : undefined,
      duration: _.timelen ? Math.floor(_.timelen / 1000) : _.duration,
      "320hash": _.trans_param?.ogg_320_hash || relateGoods[1]?.hash || undefined,
      sqhash: relateGoods.find((item) => item && item.bitrate >= 500)?.hash || undefined,
      origin_hash: _.trans_param?.hash_multitrack || _.hash,
      qualities,
    };
  }

  function formatRecommendSheetItem(_) {
    return {
      id: _.specialid || _.rankid || _.albumid || _.AuthorId,
      title: _.specialname || _.rankname || _.albumname || _.title || _.AuthorName,
      coverImg: (_.img || _.flexible_cover || _.imgurl || _.Avatar)?.replace("{size}", "480"),
      artwork: (_.img || _.flexible_cover || _.imgurl || _.Avatar)?.replace("{size}", "480"),
      description: _.intro,
      artist: _.nickname || _.username,
      worksNum: _.song_count || _.songcount || (_.extra && _.extra.resp && _.extra.resp.all_total),
      playCount: _.play_count || _.playcount,
      createAt: _.rank_id_publish_date || _.publish_time,
    };
  }

  function decryptKrc(base64Content) {
    try {
      const buf = sdkBytes(base64Content, "base64");
      const encrypted = buf.slice(4);

      for (let i = 0; i < encrypted.length; i++) {
        encrypted[i] = encrypted[i] ^ KRC_KEY[i % 16];
      }

      const decompressed = inflate(encrypted, { to: "string" });
      return decompressed;
    } catch (error) {
      sdk.log.error("[酷狗] KRC解密失败:", error);
      return null;
    }
  }

  function parseKrc(krcContent) {
    try {
      const headExp = /^.*\[id:\$\w+\]\n/;
      let content = krcContent.replace(/\r/g, "");

      if (headExp.test(content)) {
        content = content.replace(headExp, "");
      }

      let translation = "";
      let romaji = "";
      const transMatch = content.match(/\[language:([\w=\\/+]+)\]/);

      if (transMatch) {
        content = content.replace(/\[language:[\w=\\/+]+\]\n/, "");
        try {
          const langData = JSON.parse(sdkBytes(transMatch[1], "base64").toString());
          for (const item of langData.content) {
            switch (item.type) {
              case 0: // 罗马音
                romaji = item.lyricContent;
                break;
              case 1: // 译文
                translation = item.lyricContent;
                break;
            }
          }
        } catch (e) {
          sdk.log.error("[酷狗] 解析language标签失败:", e);
        }
      }

      const lines = content.split("\n");
      const lrcLines = [];
      const translationLines = [];
      const romajiLines = [];

      let lineIndex = 0;
      for (const line of lines) {
        const match = line.match(/^\[(\d+),(\d+)\](.*)/);
        if (match) {
          const lineStartMs = parseInt(match[1]);
          const lineDurMs = parseInt(match[2]);
          const body = match[3] || "";

          let ms = lineStartMs % 1000;
          let totalSeconds = Math.floor(lineStartMs / 1000);
          let m = Math.floor(totalSeconds / 60)
            .toString()
            .padStart(2, "0");
          let s = (totalSeconds % 60).toString().padStart(2, "0");
          const timeTag = `[${m}:${s}.${ms}]`;

          // 保留逐字时间轴: <relStartMs,durMs,extra>text → text(absStartMs,durMs)
          // KRC word tag 是相对行首偏移，需加上行首绝对时间转为全局绝对时间
          // 格式必须是 text(startMs,durMs)，BakaMusic 的 wordRegex 期望文字在括号前
          const richLine = body.replace(/<(\d+),(\d+),\d+>([^<]*)/g, (_, relStart, dur, text) => {
            const absStart = parseInt(relStart) + lineStartMs;
            return `${text}(${absStart},${dur})`;
          });
          lrcLines.push(`[${lineStartMs},${lineDurMs}]${richLine}`);

          if (translation && Array.isArray(translation) && translation[lineIndex]) {
            const transText = Array.isArray(translation[lineIndex])
              ? translation[lineIndex].join("")
              : translation[lineIndex];
            translationLines.push(`${timeTag}${transText}`);
          }

          if (romaji && Array.isArray(romaji) && romaji[lineIndex]) {
            const romajiText = Array.isArray(romaji[lineIndex])
              ? romaji[lineIndex].join("")
              : romaji[lineIndex];
            romajiLines.push(`${timeTag}${romajiText}`);
          }

          lineIndex++;
        }
      }

      return {
        lyric: lrcLines.join("\n"),
        translation: translationLines.length > 0 ? translationLines.join("\n") : "",
        romaji: romajiLines.length > 0 ? romajiLines.join("\n") : "",
      };
    } catch (error) {
      sdk.log.error("[酷狗] KRC解析失败:", error);
      return null;
    }
  }

  function signatureParams(params, platform = "android", body = "") {
    let keyparam = "OIlwieks28dk2k092lksi2UIkp";
    if (platform === "web") keyparam = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
    const param_list =
      typeof params === "string"
        ? params.split("&")
        : Object.entries(params).map(([key, value]) => `${key}=${value}`);
    param_list.sort();
    const sign_params = `${keyparam}${param_list.join("")}${body}${keyparam}`;
    return hash("md5", sign_params);
  }

  // Optional batch artwork fallback. Keep existing images and artist identities.
  async function kgFillArtistImage(artist) {
    if (!artist || kgImage(artist.avatar) || !/^[1-9]\d*$/.test(String(artist.id))) return artist;
    try {
      const params = {
        album_image_type: -3,
        appid: 1005,
        author_image_type: "4,5",
        clientver: 12029,
        count: 5,
        data: JSON.stringify([{ author_id: Number(artist.id) }]),
        isCdn: 1,
        publish_time: 1,
      };
      params.signature = signatureParams(params);
      const { data } = await httpGet("https://expendablekmrcdn.kugou.com/container/v2/image", {
        params,
        headers: { "User-Agent": "okhttp/5.4.0" },
        timeout: 5000,
      });
      if (data?.status === 1 && Array.isArray(data.data)) {
        const author = data.data
          .flatMap((row) => (Array.isArray(row?.author) ? row.author : []))
          .find((row) => String(row.author_id) === String(artist.id));
        const avatar = kgImage(author?.sizable_avatar);
        if (avatar) artist.avatar = avatar;
      }
    } catch (_) {
      /* Keep artist details usable when image lookup fails. */
    }
    return artist;
  }

  async function kgFillMissingImages(items) {
    const pending = items.filter((item) => !kgImage(item.artwork));
    const byHash = new Map();
    for (const item of pending) {
      const hash = String(item.hash || item.id || "").toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(hash)) continue;
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(item);
    }
    const hashes = [...byHash.keys()];
    for (let offset = 0; offset < hashes.length; offset += 20) {
      const batch = hashes.slice(offset, offset + 20);
      try {
        const params = {
          album_image_type: -3,
          appid: 1005,
          author_image_type: "4,5",
          clientver: 12029,
          count: 5,
          data: JSON.stringify(batch.map((hash) => ({ hash }))),
          isCdn: 1,
          publish_time: 1,
        };
        params.signature = signatureParams(params);
        const { data } = await httpGet("https://expendablekmrcdn.kugou.com/container/v2/image", {
          params,
          headers: { "User-Agent": "okhttp/5.4.0" },
          timeout: 5000,
        });
        // This endpoint returns positional rows without echoing the requested Hash.
        if (data?.status !== 1 || !Array.isArray(data.data) || data.data.length !== batch.length)
          continue;
        data.data.forEach((row, index) => {
          for (const item of byHash.get(batch[index])) {
            const albums = Array.isArray(row?.album) ? row.album : [];
            const album = item.album_id
              ? albums.find((a) => String(a.album_id) === String(item.album_id))
              : albums[0];
            if (!kgImage(item.artwork)) item.artwork = kgImage(album?.sizable_cover);
            if (Array.isArray(item.singerList) && Array.isArray(row?.author)) {
              item.singerList = item.singerList.map((singer) => {
                if (kgImage(singer.avatar)) return singer;
                const author = row.author.find((a) => String(a.author_id) === String(singer.id));
                const avatar = kgImage(author?.sizable_avatar);
                return avatar ? { ...singer, avatar } : singer;
              });
            }
          }
        });
      } catch (_) {
        /* Image lookup must not block search, lists or daily recommendations. */
      }
    }
    return items;
  }

  async function getBatchMusicQualityInfo(hashList) {
    const details = await getBatchMusicDetails(hashList);
    return Object.fromEntries(
      Object.entries(details).map(([id, detail]) => [id, detail.qualities]),
    );
  }

  async function getBatchMusicDetails(ids) {
    const requested = new Map(
      (ids || [])
        .map(String)
        .filter(
          (id) =>
            /^[a-f0-9]{32}$/i.test(id) ||
            (/^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))),
        )
        .map((id) => [id.toUpperCase(), id]),
    );
    if (!requested.size) return {};

    const resources = [...requested.values()].map((id) => ({
      id: 0,
      type: "audio",
      ...(/^[a-f0-9]{32}$/i.test(id) ? { hash: id } : { album_audio_id: id }),
    }));

    try {
      const res = await http({
        url: `https://gateway.kugou.com/goodsmstore/v1/get_res_privilege?appid=1005&clientver=20049&clienttime=${Date.now()}&mid=NeZha`,
        method: "post",
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        data: {
          behavior: "play",
          clientver: "20049",
          resource: resources,
          area_code: "1",
          quality: "128",
          qualities: [
            "128",
            "320",
            "flac",
            "high",
            "dolby",
            "viper_atmos",
            "viper_tape",
            "viper_clear",
          ],
        },
      });

      const detailMap = {};
      if (res.data && res.data.error_code == 0 && Array.isArray(res.data.data)) {
        res.data.data.forEach((songData) => {
          const hash =
            typeof songData?.hash === "string" && /^[a-f0-9]{32}$/i.test(songData.hash)
              ? songData.hash.toUpperCase()
              : "";
          const id = requested.get(hash) || requested.get(String(songData?.album_audio_id));
          const qualities = {};

          if (!id || !hash) return;

          for (const quality_data of Array.isArray(songData.relate_goods)
            ? songData.relate_goods
            : []) {
            const raw = quality_data?.info?.filesize;
            const size = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
            if (!Number.isSafeInteger(size) || size <= 0) continue;

            switch (quality_data.quality) {
              case "128":
                qualities["128k"] = {
                  size: formatFileSize(size),
                  bitrate: 128000,
                  hash: quality_data.hash,
                };
                break;
              case "320":
                qualities["320k"] = {
                  size: formatFileSize(size),
                  bitrate: 320000,
                  hash: quality_data.hash,
                };
                break;
              case "flac":
                qualities["flac"] = {
                  size: formatFileSize(size),
                  bitrate: 1411000,
                  hash: quality_data.hash,
                };
                break;
              case "high":
                qualities["hires"] = {
                  size: formatFileSize(size),
                  bitrate: 2304000,
                  hash: quality_data.hash,
                };
                break;
              case "viper_clear":
                qualities["master"] = {
                  size: formatFileSize(size),
                  bitrate: 2304000,
                  hash: quality_data.hash,
                };
                break;
              case "viper_atmos":
                qualities["atmos"] = {
                  size: formatFileSize(size),
                  bitrate: 1411000,
                  hash: quality_data.hash,
                };
                break;
              case "dolby":
                qualities["dolby"] = {
                  size: formatFileSize(size),
                  bitrate: 640000,
                  hash: quality_data.hash,
                };
                break;
              case "viper_tape":
                qualities["tape"] = {
                  size: formatFileSize(size),
                  bitrate: 1411000,
                  hash: quality_data.hash,
                };
                break;
            }
          }

          detailMap[id] = { hash, qualities };
        });
      }

      return detailMap;
    } catch (error) {
      sdk.log.error("Failed to fetch KuGou quality info:", error);
      return {};
    }
  }

  async function getMusicInfoRaw(hash, options = {}) {
    try {
      const data = {
        area_code: "1",
        show_privilege: 1,
        show_album_info: "1",
        is_publish: "",
        appid: 1005,
        clientver: 11451,
        mid: "1",
        dfid: "-",
        clienttime: Date.now(),
        key: "OIlwieks28dk2k092lksi2UIkp",
        fields: "album_info,author_name,audio_info,ori_audio_name,base,songname,classification",
        data: [{ hash }],
      };

      const res = await httpPost("http://gateway.kugou.com/v3/album_audio/audio", data, {
        headers: {
          "KG-THash": "13a3164",
          "KG-RC": "1",
          "KG-Fake": "0",
          "KG-RF": "00869891",
          "User-Agent": "Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi",
          "x-router": "kmr.service.kugou.com",
        },
      });

      if (options.strict && res.data?.status != null && res.data.status !== 1) {
        throw new Error("Provider song request failed");
      }
      if (res.data && res.data.data && res.data.data.length > 0) {
        return res.data.data[0][0]; // 返回第一条音乐信息
      }

      return null;
    } catch (error) {
      sdk.log.error("[酷狗] 获取音乐详细信息失败:", error);
      if (options.strict) throw error;
      return null;
    }
  }

  async function searchMusic(query, page) {
    const res = (
      await httpGet("https://songsearch.kugou.com/song_search_v2", {
        headers,
        params: {
          keyword: query,
          page,
          pagesize: pageSize,
          platform: "AndroidFilter",
          iscorrection: 1,
          hifiquality: 0,
          PrivilegeFilter: 0,
        },
      })
    ).data;

    const rawList = res.data.lists;

    let ids = new Set();
    const expandedList = [];

    rawList.forEach((item) => {
      const key = (item.Audioid || "") + item.FileHash;
      if (!ids.has(key)) {
        ids.add(key);
        expandedList.push(item);
      }

      for (const childItem of item.Grp || []) {
        const childKey = (childItem.Audioid || "") + childItem.FileHash;
        if (!ids.has(childKey)) {
          ids.add(childKey);
          expandedList.push(childItem);
        }
      }
    });

    const hashList = expandedList.map((item) => item.FileHash).filter((hash) => hash);

    let qualityInfoMap = {};
    try {
      qualityInfoMap = await getBatchMusicQualityInfo(hashList);
    } catch (error) {
      sdk.log.error("Failed to get quality info for KuGou search:", error);
    }

    const songs = await kgFillMissingImages(
      expandedList.map((song) => formatExpandedMusicItem(song, qualityInfoMap)),
    );

    return {
      isEnd: page * pageSize >= res.data.total,
      data: songs,
    };
  }

  // Anonymous mobile search; signatures cover raw values before URL encoding.
  async function kgComplexSearch(type, query, page) {
    const params = {
      appid: 1005,
      clienttime: Math.floor(Date.now() / 1000),
      clientver: 20669,
      current_mixsongid: 0,
      dfid: "-",
      iscorrection: 1,
      keyword: query,
      mid: "-",
      page,
      pagesize: pageSize,
      platform: "AndroidFilter",
      requestid: "-",
      search_source: "手动输入",
      tag: "em",
      token: "",
      userid: 0,
      uuid: "-",
      ...(type === "album" ? { category: 1, searchsong: 0, sorttype: 0 } : {}),
    };
    params.signature = signatureParams(params);
    const { data } = await httpGet(`https://complexsearch.kugou.com/v1/search/${type}`, {
      headers,
      params,
    });
    if (data?.status !== 1 || !Array.isArray(data.data?.lists)) {
      throw new Error("[酷狗] 搜索失败，请稍后重试");
    }
    return data.data;
  }

  async function searchAlbum(query, page) {
    const data = await kgComplexSearch("album", query, page);
    return {
      isEnd: page * pageSize >= data.total,
      data: data.lists.map((item) => ({
        id: item.albumid,
        artwork: kgImage(item.img),
        artist: stripHtml(item.singer || ""),
        title: stripHtml(item.albumname || ""),
        description: item.intro,
        date: item.publish_time?.slice(0, 10),
        worksNum: item.songcount,
      })),
    };
  }

  async function searchMusicSheet(query, page) {
    const res = (
      await httpGet("https://msearchretry.kugou.com/api/v3/search/special", {
        headers,
        params: {
          format: "json",
          keyword: query,
          page,
          pagesize: pageSize,
          showtype: 10,
          filter: 0,
          version: 7910,
          sver: 2,
        },
      })
    ).data;
    const sheets = res.data.info.map((item) => ({
      title: item.specialname,
      createAt: item.publishtime,
      description: item.intro,
      artist: item.nickname,
      coverImg: kgImage(item.imgurl),
      artwork: kgImage(item.imgurl),
      gid: item.gid,
      playCount: item.playcount,
      id: item.specialid,
      worksNum: item.songcount,
    }));
    return {
      isEnd: page * pageSize >= res.data.total,
      data: sheets,
    };
  }

  async function searchLyric(query, page) {
    const res = await searchMusic(query, page);
    return {
      isEnd: res.isEnd,
      data: res.data,
    };
  }

  async function searchArtist(query, page) {
    const data = await kgComplexSearch("author", query, page);
    return {
      isEnd: page * pageSize >= data.total,
      data: data.lists.map((item) => ({
        id: item.AuthorId,
        name: stripHtml(item.AuthorName || ""),
        avatar: kgImage(item.Avatar),
        songCount: item.AudioCount,
        albumCount: item.AlbumCount,
        worksNum: item.AudioCount,
      })),
    };
  }

  function pickKugouMvStream(mvdata, requestedQuality) {
    const available = getKugouMvStreams(mvdata);
    if (!available.length) return null;

    const value = String(requestedQuality || "1080p").toLowerCase();
    const target = value === "4k" ? 2160 : Number(value.replace(/p$/, "")) || 1080;
    return (
      available.find(({ level }) => level.height === target) ||
      available.filter(({ level }) => level.height <= target).pop() ||
      available[0]
    );
  }

  function getKugouMvStreams(mvdata) {
    const byQuality = new Map();
    for (const level of KUGOU_MV_LEVELS) {
      const stream = mvdata?.[level.key];
      if (!stream?.downurl) continue;
      const candidate = { level, stream };
      const previous = byQuality.get(level.quality);
      const candidateSize = Number(stream.filesize || stream.fileSize || stream.size || 0);
      const previousSize = Number(
        previous?.stream?.filesize || previous?.stream?.fileSize || previous?.stream?.size || 0,
      );
      if (!previous || candidateSize >= previousSize) byQuality.set(level.quality, candidate);
    }
    return [...byQuality.values()];
  }

  async function getMvSource(musicItem, videoQuality = "1080p") {
    const rawMv = musicItem?.mv;
    const mvHash =
      musicItem?.mvHash ||
      (rawMv && typeof rawMv === "object" ? rawMv.hash || rawMv.mvHash : rawMv);
    if (!mvHash || !/^[a-f\d]{32}$/i.test(String(mvHash))) return null;

    try {
      const response = await httpGet("https://m.kugou.com/app/i/mv.php", {
        params: {
          cmd: 100,
          ext: "mp4",
          hash: String(mvHash),
        },
        headers,
        timeout: 20000,
      });
      if (Number(response.data?.status) !== 1) return null;

      const selected = pickKugouMvStream(response.data.mvdata, videoQuality);
      if (!selected?.stream?.downurl) return null;
      // Kugou's fsmvpc CDN currently serves the signed object over HTTP. The
      // HTTPS endpoint has a certificate for a different host and is rejected
      // by Chromium/Electron, while the HTTP URL supports ranges and CORS.
      const url = String(selected.stream.downurl);
      const durationMs = Number(selected.stream.timelength || response.data.timelength);
      const available = getKugouMvStreams(response.data.mvdata);
      const size =
        Number(selected.stream.filesize || selected.stream.fileSize || selected.stream.size || 0) ||
        undefined;
      const backupValue =
        selected.stream.backupdownurl || selected.stream.backupDownUrl || selected.stream.backupurl;
      const backupUrls = (
        Array.isArray(backupValue) ? backupValue : backupValue ? [backupValue] : []
      )
        .filter(Boolean)
        .map(String);
      return {
        url,
        headers: {
          Referer: "https://www.kugou.com/",
          "User-Agent": headers["User-Agent"],
        },
        userAgent: headers["User-Agent"],
        videoQuality: selected.level.quality,
        mimeType: "video/mp4",
        size,
        bitrate: Number(selected.stream.bitrate) || undefined,
        availableVideoQualities: available.map(({ level, stream }) => ({
          key: level.quality,
          label: level.quality,
          width: Number(stream.width) || undefined,
          height: level.height,
          bitrate: Number(stream.bitrate) || undefined,
          size: Number(stream.filesize || stream.fileSize || stream.size) || undefined,
          codec: stream.codec || stream.codecs || undefined,
          mimeType: "video/mp4",
        })),
        backupUrls,
        duration:
          Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : undefined,
      };
    } catch (error) {
      sdk.log.error(`[酷狗] 获取 MV 播放源错误: ${error.message}`);
      return null;
    }
  }

  async function getMusicInfo(musicBase) {
    if (musicBase.kg_daily) return { ...musicBase, platform: "酷狗音乐" };
    if (musicBase.artwork && musicBase.qualities && Object.keys(musicBase.qualities).length > 0) {
      return {
        id: musicBase.id,
        hash: musicBase.hash || musicBase.id,
        title: musicBase.title,
        artist: musicBase.artist,
        album: musicBase.album,
        album_id: musicBase.album_id,
        artwork: musicBase.artwork,
        qualities: musicBase.qualities,
        mv: musicBase.mv,
        mvHash: musicBase.mvHash,
        mvId: musicBase.mvId,
        platform: "酷狗音乐",
      };
    }

    const hash = musicBase.hash || musicBase.id;
    if (!hash) {
      sdk.log.error("[酷狗] getMusicInfo: 缺少有效的hash");
      return null;
    }

    try {
      const [info, qualityInfoMap] = await Promise.all([
        getMusicInfoRaw(hash),
        getBatchMusicQualityInfo([hash]).catch(() => ({})),
      ]);

      if (!info) {
        sdk.log.error("[酷狗] getMusicInfo: 未找到歌曲信息");
        return null;
      }

      const albumInfo = info.album_info || {};
      const audioInfo = info.audio_info || {};
      const mvInfo = info.mv_info || info.video_info || {};
      const mvHash =
        musicBase.mvHash ||
        musicBase.mv ||
        info.mv_hash ||
        info.mvhash ||
        info.mv_hash_128 ||
        audioInfo.mv_hash ||
        audioInfo.mvhash ||
        mvInfo.hash ||
        mvInfo.mv_hash;
      const mvId = musicBase.mvId || info.mv_id || mvInfo.id;

      let qualities = qualityInfoMap[hash] || {};

      if (Object.keys(qualities).length === 0) {
        qualities = {
          "128k": {},
          "320k": {},
          flac: {},
        };
      }

      return {
        id: hash,
        hash: hash,
        title: info.songname || info.ori_audio_name,
        artist: info.author_name,
        album: albumInfo.album_name,
        album_id: albumInfo.album_id,
        artwork: (albumInfo.sizable_cover || "").replace("{size}", "480"),
        duration: audioInfo.timelength ? Math.floor(audioInfo.timelength / 1000) : undefined,
        qualities: qualities,
        mv: mvHash || mvId || undefined,
        mvHash: mvHash || undefined,
        mvId: mvId || undefined,
        platform: "酷狗音乐",
      };
    } catch (error) {
      sdk.log.error("[酷狗] getMusicInfo 错误:", error.message);
      return null;
    }
  }

  async function getLyricDownload(lyrdata) {
    try {
      const krcResult = await http({
        url: `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyrdata.id}&accesskey=${lyrdata.accessKey}&fmt=krc&charset=utf8`,
        headers: {
          "KG-RC": 1,
          "KG-THash": "expand_search_manager.cpp:852736169:451",
          "User-Agent": "KuGou2012-9020-ExpandSearchManager",
        },
        method: "get",
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      }).catch(() => null);

      if (krcResult?.data?.content) {
        const decrypted = decryptKrc(krcResult.data.content);
        if (decrypted) {
          const parsed = parseKrc(decrypted);
          if (parsed) {
            return {
              rawLrc: parsed.lyric,
              translation: parsed.translation || undefined,
              romanization: parsed.romaji || undefined,
            };
          }
        }
      }

      const lrcResult = (
        await http({
          url: `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyrdata.id}&accesskey=${lyrdata.accessKey}&fmt=lrc&charset=utf8`,
          headers: {
            "KG-RC": 1,
            "KG-THash": "expand_search_manager.cpp:852736169:451",
            "User-Agent": "KuGou2012-9020-ExpandSearchManager",
          },
          method: "get",
          xsrfCookieName: "XSRF-TOKEN",
          withCredentials: true,
        })
      ).data;

      return {
        rawLrc: sdk.text.decodeHtml(
          sdk.bytes.decode(sdk.bytes.encode(lrcResult.content, "base64")),
        ),
      };
    } catch (error) {
      sdk.log.error("[酷狗] 获取歌词失败:", error);
      return { rawLrc: "" };
    }
  }

  async function getLyric(musicItem) {
    const result = (
      await http({
        url: `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${musicItem.title}&hash=${musicItem.id}&timelength=${musicItem.duration}`,
        headers: {
          "KG-RC": 1,
          "KG-THash": "expand_search_manager.cpp:852736169:451",
          "User-Agent": "KuGou2012-9020-ExpandSearchManager",
        },
        method: "get",
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;
    const info = result.candidates[0];
    return await getLyricDownload({ id: info.id, accessKey: info.accesskey });
  }

  async function getAlbumInfo(albumItem, page = 1) {
    const res = (
      await httpGet("http://mobilecdn.kugou.com/api/v3/album/song", {
        params: {
          version: 9108,
          albumid: albumItem.id,
          plat: 0,
          pagesize: 100,
          area_code: 1,
          page,
          with_res_tag: 0,
        },
      })
    ).data;

    const songList = res.data.info;

    const hashList = songList.map((item) => item.hash).filter(Boolean);

    let qualityInfoMap = {};
    try {
      if (hashList.length > 0) {
        qualityInfoMap = await getBatchMusicQualityInfo(hashList);
      }
    } catch (error) {
      sdk.log.error("[酷狗] 专辑音质信息获取失败:", error.message);
    }

    return {
      isEnd: page * 100 >= res.data.total,
      albumItem: {
        worksNum: res.data.total,
      },
      musicList: songList.map((_) => {
        var _a;
        const [artist, songname] = _.filename.split("-");

        const qualities = qualityInfoMap[_.hash] || {
          "128k": {},
          "320k": {},
          flac: {},
        };

        return {
          id: _.hash,
          title: songname.trim(),
          artist: artist.trim(),
          album: (_a = _.album_name) !== null && _a !== void 0 ? _a : _.remark,
          album_id: _.album_id,
          album_audio_id: _.album_audio_id,
          artwork: albumItem.artwork,
          duration: normalizeDurationSeconds(_),
          "320hash": _.HQFileHash,
          sqhash: _.SQFileHash,
          origin_hash: _.id,
          qualities: qualities,
        };
      }),
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
    if (type === "music") {
      const res = (
        await httpGet("http://mobilecdn.kugou.com/api/v3/singer/song", {
          headers,
          params: {
            version: 9108,
            singerid: artistItem.id,
            page,
            pagesize: 100,
            sorttype: 1,
            area_code: 1,
          },
        })
      ).data;

      const songList = res.data.info;

      const hashList = songList.map((item) => item.hash).filter(Boolean);

      let qualityInfoMap = {};
      try {
        if (hashList.length > 0) {
          qualityInfoMap = await getBatchMusicQualityInfo(hashList);
        }
      } catch (error) {
        sdk.log.error("[酷狗] 歌手作品音质信息获取失败:", error.message);
      }

      return {
        isEnd: page * 100 >= res.data.total,
        artistItem: artistWorksItem(artistItem, "music", res.data.total),
        data: songList.map((song) => {
          const formattedItem = formatArtistSongItem(song);
          if (qualityInfoMap[song.hash]) {
            formattedItem.qualities = qualityInfoMap[song.hash];
          } else {
            formattedItem.qualities = {
              "128k": {},
              "320k": {},
              flac: {},
            };
          }
          return formattedItem;
        }),
      };
    } else if (type === "album") {
      const res = (
        await httpGet("http://mobilecdn.kugou.com/api/v3/singer/album", {
          headers,
          params: {
            version: 9108,
            singerid: artistItem.id,
            page,
            pagesize: 20,
            area_code: 1,
          },
        })
      ).data;
      return {
        isEnd: page * 20 >= res.data.total,
        artistItem: artistWorksItem(artistItem, "album", res.data.total),
        data: res.data.info.map((_) => ({
          id: _.albumid,
          title: _.albumname,
          artwork: _.imgurl ? _.imgurl.replace("{size}", "400") : undefined,
          date: _.publishtime ? _.publishtime.slice(0, 10) : undefined,
          artist: artistItem.name,
        })),
      };
    }
  }

  async function getUserListDetail2(global_collection_id, sheetInfo) {
    const id = global_collection_id;
    if (id.length > 1000) throw new Error("[酷狗] global_collection_id无效");

    try {
      const gatewayHeaders = {
        "User-Agent": "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi",
        "kg-rc": "1",
        "kg-thash": "5d816a0",
        "kg-rec": "1",
        "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F",
      };
      const fetchPageSize = 300;
      const detailBatchSize = 200;
      const songMap = new Map();
      let beginIdx = 0;
      let totalCount = null;
      let page = 0;

      while (totalCount === null || beginIdx < totalCount) {
        page += 1;
        if (page > 10000) throw new Error("[酷狗] 歌单分页超出合理范围");
        const clienttime = Math.floor(Date.now() / 1000);
        const gatewayParams =
          `area_code=1&appid=1005&begin_idx=${beginIdx}&clienttime=${clienttime}` +
          `&clientver=20489&extend_fields=abtags,hot_cmt,popularization&global_collection_id=${id}` +
          `&mode=1&pagesize=${fetchPageSize}&personal_switch=1&plat=1&type=1&uuid=-`;

        const pageRes = await httpGet(
          `https://gateway.kugou.com/pubsongs/v2/get_other_list_file_nofilt?${gatewayParams}&signature=${signatureParams(gatewayParams, "android")}`,
          { headers: gatewayHeaders },
        );

        const pageData = pageRes.data?.data;
        const songs = pageData?.songs || [];

        if (!Array.isArray(pageData?.songs)) throw new Error("[酷狗] 歌单分页数据异常");
        if (sheetInfo && page === 1) {
          Object.assign(sheetInfo, pageData.list_info, { count: pageData.count });
        }
        if (!songs.length) {
          if (totalCount !== null && beginIdx < totalCount)
            throw new Error("[酷狗] 歌单分页提前结束");
          break;
        }
        const reported = Number(pageData.count);
        if (Number.isFinite(reported) && reported > 0)
          totalCount = Math.max(totalCount || 0, reported);
        const beforeSize = songMap.size;

        songs.forEach((song) => {
          if (!song?.hash) return;
          const key = `${song.hash}|${song.audio_id || song.album_audio_id || 0}|${song.name || ""}`;
          if (!songMap.has(key)) {
            songMap.set(key, song);
          }
        });

        sdk.log.debug(
          `[酷狗] global_collection_id分页 ${page} 获取 ${songs.length} 首，去重后累计 ${songMap.size}/${totalCount}`,
        );

        const addedCount = songMap.size - beforeSize;
        if (addedCount <= 0) throw new Error("[酷狗] 歌单分页重复");
        beginIdx += songs.length;
        if (totalCount === null && songs.length < fetchPageSize) break;
      }

      const songInfos = Array.from(songMap.values());
      if (!songInfos.length) {
        return [];
      }

      let qualityInfoMap = {};
      const musicList = [];

      for (let i = 0; i < songInfos.length; i += detailBatchSize) {
        const batchSongs = songInfos.slice(i, i + detailBatchSize);
        const resource = batchSongs.map((song) => ({
          album_audio_id: 0,
          album_id: "0",
          hash: song.hash,
          id: 0,
          name: song.name || "",
          page_id: 0,
          type: "audio",
        }));

        const postData = {
          appid: 1001,
          area_code: "1",
          behavior: "play",
          clientver: "10112",
          dfid: "2O3jKa20Gdks0LWojP3ly7ck",
          mid: "70a02aad1ce4648e7dca77f2afa7b182",
          need_hash_offset: 1,
          relate: 1,
          resource,
          token: "",
          userid: "0",
          vip: 0,
        };

        const detailResult = await httpPost(
          `https://gateway.kugou.com/v2/get_res_privilege/lite?appid=1001&clienttime=1668883879&clientver=10112&dfid=2O3jKa20Gdks0LWojP3ly7ck&mid=70a02aad1ce4648e7dca77f2afa7b182&userid=0&uuid=92691C6246F86F28B149BAA1FD370DF1`,
          postData,
          {
            headers: {
              "x-router": "media.store.kugou.com",
            },
          },
        );

        if (
          detailResult.status !== 200 ||
          detailResult.data?.status !== 1 ||
          !Array.isArray(detailResult.data.data) ||
          !detailResult.data.data.length
        ) {
          throw new Error(`[酷狗] 歌曲详情批次失败：${i}-${i + batchSongs.length - 1}`);
        }

        const detailItems = detailResult.data.data;
        const hashList = detailItems.map((item) => item.hash).filter(Boolean);

        try {
          if (hashList.length > 0) {
            const batchQualityInfo = await getBatchMusicQualityInfo(hashList);
            qualityInfoMap = Object.assign(qualityInfoMap, batchQualityInfo);
          }
        } catch (err) {
          sdk.log.warn("[酷狗] 获取音质信息失败，使用默认音质:", err.message);
        }

        detailItems.forEach((item) => {
          const sourceSong = batchSongs.find((song) => song.hash === item.hash) || item;
          musicList.push(formatGatewayImportMusicItem(sourceSong, qualityInfoMap));
        });
      }

      sdk.log.debug(
        `[酷狗] 歌单导入成功（global_collection_id），最终歌曲数量: ${musicList.length}`,
      );
      return musicList;
    } catch (error) {
      sdk.log.error(`[酷狗] getUserListDetail2异常: ${error.message}`);
      throw error;
    }
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

  async function getArtistInfo(artistItem) {
    if (!artistItem?.id) {
      return null;
    }
    try {
      const res = (
        await httpGet("http://mobilecdn.kugou.com/api/v3/singer/info", {
          headers,
          params: {
            version: 9108,
            singerid: artistItem.id,
            area_code: 1,
          },
          timeout: 8000,
        })
      ).data;
      if (!res || res.status !== 1 || !res.data) {
        return null;
      }
      const d = res.data;
      const avatar = kgImage(d.imgurl, d.sizable_avatar, artistItem.avatar);
      return kgFillArtistImage({
        id: String(artistItem.id),
        name: d.singername || artistItem.name || "",
        avatar: avatar || "",
        description: d.profile || d.intro || "",
        worksNum: d.songcount ?? d.song_count,
        songCount: d.songcount ?? d.song_count,
        albumCount: d.albumcount ?? d.album_count,
        platform: "酷狗音乐",
      });
    } catch (e) {
      sdk.log.error("[酷狗] 获取歌手详情失败:", e?.message || e);
      return null;
    }
  }

  async function getMusicSheetInfo(sheet, page) {
    if (String(sheet?.id || "").startsWith("kg-daily-")) {
      if (Number(page || 1) > 1) return { isEnd: true, sheetItem: sheet, musicList: [] };
      const daily = await getDailyRecommendations();
      if (daily.state !== "ready") throw new Error("每日推荐暂不可用，请检查酷狗连接状态");
      return { isEnd: true, sheetItem: daily.sheetItem, musicList: daily.musicList };
    }

    try {
      let sheetId = sheet.id || sheet;

      if (typeof sheetId === "string" && sheetId.startsWith("id_")) {
        sheetId = sheetId.replace("id_", "");
      }

      sdk.log.debug(`[酷狗] 开始获取歌单详情，ID: ${sheetId}, 页码: ${page}`);

      if (sheetId && /^\d+$/.test(sheetId.toString())) {
        return await getSpecialMusicList(sheetId, page);
      }

      const input = String(sheetId).trim();
      const gcid = input.match(/\bgcid_[a-z0-9]+\b/i)?.[0];
      const globalId = gcid ? await decodeKugouGcid(gcid) : input;
      if (!/^(?:collection_\d+_\d+_\d+_\d+|\d+)$/.test(globalId)) {
        throw new Error("Unsupported collection identity; resolve its share link first");
      }
      return await getKugouCollectionPage(globalId, sheet, page);
    } catch (error) {
      sdk.log.error("[酷狗] 获取歌单详情失败:", error);
      throw error;
    }
  }

  // Ordinary browsing reads one bounded source page. Explicit link imports keep
  // their complete traversal and validated snapshot in importMusicSheet.
  async function getKugouCollectionPage(globalId, sheet, page = 1) {
    const pageSize = 100;
    const begin = (page - 1) * pageSize;
    const timestamp = Math.floor(Date.now() / 1000);
    const params =
      `area_code=1&appid=1005&begin_idx=${begin}&clienttime=${timestamp}` +
      `&clientver=20489&extend_fields=abtags,hot_cmt,popularization&global_collection_id=${globalId}` +
      `&mode=1&pagesize=${pageSize}&personal_switch=1&plat=1&type=1&uuid=-`;
    const response = await httpGet(
      `https://gateway.kugou.com/pubsongs/v2/get_other_list_file_nofilt?${params}&signature=${signatureParams(params, "android")}`,
      {
        headers: {
          "User-Agent": "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi",
          "kg-rc": "1",
          "kg-thash": "5d816a0",
          "kg-rec": "1",
          "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F",
        },
      },
    );
    const data = response.data?.data;
    if (
      response.data?.status !== 1 ||
      !Array.isArray(data?.songs) ||
      data.songs.length > pageSize
    ) {
      throw new Error("Provider playlist page request failed");
    }
    const count = data.count == null || data.count === "" ? null : Number(data.count);
    const total = Number.isSafeInteger(count) && count >= 0 ? count : null;
    if (!data.songs.length && total !== null && begin < total) {
      throw new Error("Provider playlist page ended before its reported total");
    }
    let qualities = {};
    if (data.songs.length) {
      // Optional quality enrichment stays bounded to this page; its existing
      // helper retains source metadata when the enrichment service is down.
      qualities = await getBatchMusicQualityInfo(
        data.songs.map((song) => song.hash).filter(Boolean),
      );
    }
    const metadata = buildImportedKugouSheet(sheet.id, data.list_info, []);
    delete metadata.musicList;
    delete metadata.worksNum;
    return {
      isEnd: total === null ? data.songs.length < pageSize : begin + data.songs.length >= total,
      sheetItem: playlistSheetItem({ ...sheet, ...metadata, id: sheet.id }, total),
      ...(total === null ? {} : { total }),
      musicList: data.songs.map((song) => formatGatewayImportMusicItem(song, qualities)),
    };
  }

  async function getSpecialMusicList(specialId, page) {
    try {
      const pageSize = 100;

      const infoRes = await httpGet(`http://mobilecdn.kugou.com/api/v3/special/song`, {
        headers: headers,
        params: {
          version: 9108,
          specialid: specialId,
          page,
          pagesize: pageSize,
          plat: 0,
          area_code: 1,
          with_res_tag: 0,
        },
      });

      if (!infoRes.data || infoRes.data.status !== 1 || !infoRes.data.data) {
        sdk.log.error("[酷狗] 获取歌单信息失败");
        throw new Error("Provider playlist request failed");
      }

      const data = infoRes.data.data;
      const songs = data.info || [];

      const hashList = songs.map((item) => item.hash).filter(Boolean);

      let qualityInfoMap = {};
      try {
        if (hashList.length > 0) {
          qualityInfoMap = await getBatchMusicQualityInfo(hashList);
        }
      } catch (error) {
        sdk.log.error("[酷狗] 获取音质信息失败，使用默认音质:", error.message);
      }

      const musicList = songs.map((song) => {
        let artist = "";
        let title = "";
        if (song.filename) {
          const parts = song.filename.split("-");
          if (parts.length >= 2) {
            artist = parts[0].trim();
            title = parts
              .slice(1)
              .join("-")
              .replace(/\.mp3$/i, "")
              .trim();
          } else {
            title = song.filename.replace(/\.mp3$/i, "").trim();
          }
        }

        const qualities = qualityInfoMap[song.hash] || {
          "128k": {},
          "320k": {},
          flac: {},
        };

        return {
          id: song.hash,
          title: title || song.songname || "未知歌曲",
          artist: artist || song.singername || "未知歌手",
          album: song.album_name || "",
          album_id: song.album_id,
          album_audio_id: song.album_audio_id,
          artwork: song.trans_param?.union_cover
            ? song.trans_param.union_cover.replace("{size}", "400")
            : undefined,
          duration: normalizeDurationSeconds(song),
          "320hash": song["320hash"],
          sqhash: song.sqhash,
          origin_hash: song.origin_hash,
          qualities: qualities,
        };
      });

      sdk.log.debug(`[酷狗] 获取歌单成功，歌曲数量: ${musicList.length}`);

      return {
        isEnd: page * pageSize >= data.total,
        sheetItem: playlistSheetItem({ id: specialId }, data.total),
        musicList: musicList,
      };
    } catch (error) {
      sdk.log.error("[酷狗] 获取歌单详情异常:", error.message);
      throw error;
    }
  }

  function buildImportedKugouSheet(id, info, musicList) {
    const sheetInfo = info || {};
    return {
      id: String(sheetInfo.listid || sheetInfo.id || sheetInfo.global_collection_id || id),
      title: sheetInfo.name || sheetInfo.title || sheetInfo.listname || "",
      artwork: sheetInfo.pic || sheetInfo.image || sheetInfo.img || sheetInfo.cover,
      artist: sheetInfo.nickname || sheetInfo.username || sheetInfo.userName || "",
      description: sheetInfo.intro || sheetInfo.description || "",
      worksNum: Number(sheetInfo.count || sheetInfo.total) || musicList.length,
      playCount: Number(sheetInfo.play_count || sheetInfo.playCount) || 0,
      musicList,
    };
  }

  // The command response can contain only a preview. Fetch every shared-list page.
  async function getKugouSharedSongs(info) {
    const pageSize = 100;
    const total = Number(info.count) || null;
    const songs = [];
    const signatures = new Set();
    for (let page = 1; ; page++) {
      if (page > 10000) throw new Error("[酷狗] 歌单分页超出合理范围");
      const response = await httpPost("http://www2.kugou.kugou.com/apps/kucodeAndShare/app/", {
        appid: 1001,
        clientver: 10112,
        mid: "70a02aad1ce4648e7dca77f2afa7b182",
        clienttime: 722219501,
        key: "381d7062030e8a5a94cfbe50bfe65433",
        data: {
          id: info.id,
          type: 3,
          userid: info.userid,
          collect_type: info.collect_type || 0,
          page,
          pagesize: pageSize,
        },
      });
      const data = response.data?.status === 1 ? response.data.data : response.data;
      if (response.status !== 200 || !Array.isArray(data))
        throw new Error("[酷狗] 歌单分页数据异常");
      const signature = JSON.stringify(data.map((song) => song.hash));
      if (data.length && signatures.has(signature)) throw new Error("[酷狗] 歌单分页重复");
      signatures.add(signature);
      if (!data.length && total !== null && songs.length < total)
        throw new Error("[酷狗] 歌单分页提前结束");
      songs.push(...data);
      if (total !== null ? page * pageSize >= total : data.length < pageSize) return songs;
    }
  }

  async function getKugouImportDetails(postData) {
    const data = [];
    for (let offset = 0; offset < postData.resource.length; offset += 200) {
      const response = await httpPost(
        "https://gateway.kugou.com/v2/get_res_privilege/lite?appid=1001&clienttime=1668883879&clientver=10112&dfid=2O3jKa20Gdks0LWojP3ly7ck&mid=70a02aad1ce4648e7dca77f2afa7b182&userid=0&uuid=92691C6246F86F28B149BAA1FD370DF1",
        { ...postData, resource: postData.resource.slice(offset, offset + 200) },
        { headers: { "x-router": "media.store.kugou.com" } },
      );
      if (
        response.status !== 200 ||
        response.data?.status !== 1 ||
        !Array.isArray(response.data.data) ||
        !response.data.data.length
      ) {
        throw new Error("[酷狗] 歌曲详情批次异常");
      }
      data.push(...response.data.data);
    }
    return { status: 200, data: { status: 1, data } };
  }

  // Protocol reference: lyswhut/lx-music-desktop, musicSdk/kg/songList.js (decodeGcid).
  async function decodeKugouGcid(gcid) {
    const params = "dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-";
    const body = { ret_info: 1, data: [{ id: gcid, id_type: 2 }] };
    const response = await httpPost(
      `https://t.kugou.com/v1/songlist/batch_decode?${params}&signature=${signatureParams(params, "android", JSON.stringify(body))}`,
      body,
      { headers: { ...headers, Referer: "https://m.kugou.com/" }, timeout: 15000 },
    );
    const entry = response.data?.data?.list?.[0];
    const globalId = entry?.global_collection_id;
    if (
      response.status !== 200 ||
      response.data?.status !== 1 ||
      typeof globalId !== "string" ||
      !/^(?:collection_\d+_\d+_\d+_\d+|\d+)$/.test(globalId)
    ) {
      throw new Error("[酷狗] 新版歌单链接解析失败，请检查链接或稍后重试");
    }
    return globalId;
  }

  async function importMusicSheet(urlLike) {
    const input = String(urlLike ?? "").trim();
    const gcid = input.match(/\bgcid_[a-z0-9]+\b/i)?.[0];
    if (gcid) {
      const globalId = await decodeKugouGcid(gcid);
      const info = {};
      const musicList = await getUserListDetail2(globalId, info);
      return {
        ...buildImportedKugouSheet(gcid, info, musicList),
        id: gcid,
        artwork: info.pic?.replace("{size}", "400"),
        artist: info.list_create_username || "",
      };
    }
    // Never interpret digits in an unsupported share URL as a numeric command code.
    if (/https?:\/\//i.test(input) || /\bgcid_/i.test(input)) {
      throw new Error("[酷狗] 不支持的歌单链接，请使用 gcid 分享链接或纯数字酷狗码");
    }
    var _a;
    let id = (_a = input.match(/^(?:.*?)(\d+)(?:.*?)$/)) === null || _a === void 0 ? void 0 : _a[1];
    let musicList = [];
    let sheetInfo = null;

    if (!id) {
      sdk.log.error("[酷狗] 无法解析酷狗码，请输入纯数字酷狗码");
      return musicList;
    }

    sdk.log.debug(`[酷狗] 开始导入歌单，酷狗码: ${id}`);

    try {
      let res = await httpPost(`http://t.kugou.com/command/`, {
        appid: 1001,
        clientver: 9020,
        mid: "21511157a05844bd085308bc76ef3343",
        clienttime: 640612895,
        key: "36164c4015e704673c588ee202b9ecb8",
        data: id,
      });

      if (res.status !== 200 || !res.data || res.data.status !== 1 || !res.data.data) {
        sdk.log.error(
          `[酷狗] 获取歌单基本信息失败: ${res.data ? res.data.message || res.data.error || "未知错误" : "无返回数据"}`,
        );
        return musicList;
      }

      let data = res.data.data;
      let info = data.info;
      sheetInfo = info;

      if (!info) {
        sdk.log.error("[酷狗] 歌单信息为空");
        return musicList;
      }

      sdk.log.debug(`[酷狗] 歌单基本信息获取成功，类型: ${info.type}, 歌曲数量: ${info.count}`);

      if (info.global_collection_id) {
        sdk.log.debug(
          `[酷狗] 检测到global_collection_id: ${info.global_collection_id}，使用特殊接口获取歌单`,
        );
        musicList = await getUserListDetail2(info.global_collection_id);
        return buildImportedKugouSheet(id, info, musicList);
      }

      if (
        res.data.data.list &&
        res.data.data.list.length > 0 &&
        (!Number(info.count) || res.data.data.list.length >= Number(info.count))
      ) {
        sdk.log.debug(`[酷狗] 直接获取到歌曲列表，数量: ${res.data.data.list.length}`);
        let resource = res.data.data.list.map((song) => ({
          album_audio_id: 0,
          album_id: "0",
          hash: song.hash,
          id: 0,
          name: song.filename ? song.filename.replace(".mp3", "") : "",
          page_id: 0,
          type: "audio",
        }));

        let postData = {
          appid: 1001,
          area_code: "1",
          behavior: "play",
          clientver: "10112",
          dfid: "2O3jKa20Gdks0LWojP3ly7ck",
          mid: "70a02aad1ce4648e7dca77f2afa7b182",
          need_hash_offset: 1,
          relate: 1,
          resource,
          token: "",
          userid: "0",
          vip: 0,
        };

        let detailResult = await getKugouImportDetails(postData);

        if (
          detailResult.status === 200 &&
          detailResult.data &&
          detailResult.data.status === 1 &&
          detailResult.data.data
        ) {
          sdk.log.debug(`[酷狗] 获取歌曲详情成功，数量: ${detailResult.data.data.length}`);

          const hashList = detailResult.data.data.map((item) => item.hash).filter(Boolean);

          let qualityInfoMap = {};
          try {
            if (hashList.length > 0) {
              qualityInfoMap = await getBatchMusicQualityInfo(hashList);
            }
          } catch (err) {
            sdk.log.warn("[酷狗] 获取音质信息失败，使用默认音质:", err.message);
          }

          musicList = detailResult.data.data.map((item) => {
            const formattedItem = formatImportMusicItem(item);
            if (qualityInfoMap[item.hash]) {
              formattedItem.qualities = qualityInfoMap[item.hash];
            } else {
              formattedItem.qualities = {
                "128k": {},
                "320k": {},
                flac: {},
              };
            }
            return formattedItem;
          });

          sdk.log.debug(`[酷狗] 歌单导入成功（从list字段），最终歌曲数量: ${musicList.length}`);
          return buildImportedKugouSheet(id, info, musicList);
        }
      }

      if (info.userid != null && info.id) {
        sdk.log.debug(`[酷狗] 使用userid方式获取歌单，userid: ${info.userid}, id: ${info.id}`);

        const response = { status: 200, data: await getKugouSharedSongs(info) };

        if (response.status === 200 && response.data) {
          let songData = response.data;

          if (songData.status === 1 && songData.data) {
            songData = songData.data;
          }

          if (Array.isArray(songData) && songData.length > 0) {
            sdk.log.debug(`[酷狗] 获取到歌单歌曲列表，数量: ${songData.length}`);

            let resource = [];
            songData.forEach((song) => {
              resource.push({
                album_audio_id: 0,
                album_id: "0",
                hash: song.hash,
                id: 0,
                name: song.filename ? song.filename.replace(".mp3", "") : "",
                page_id: 0,
                type: "audio",
              });
            });

            let postData = {
              appid: 1001,
              area_code: "1",
              behavior: "play",
              clientver: "10112",
              dfid: "2O3jKa20Gdks0LWojP3ly7ck",
              mid: "70a02aad1ce4648e7dca77f2afa7b182",
              need_hash_offset: 1,
              relate: 1,
              resource,
              token: "",
              userid: "0",
              vip: 0,
            };

            var result = await getKugouImportDetails(postData);

            if (
              result.status === 200 &&
              result.data &&
              result.data.status === 1 &&
              result.data.data
            ) {
              sdk.log.debug(`[酷狗] 获取歌曲详情成功，数量: ${result.data.data.length}`);

              const hashList = result.data.data.map((item) => item.hash).filter(Boolean);

              let qualityInfoMap = {};
              try {
                if (hashList.length > 0) {
                  qualityInfoMap = await getBatchMusicQualityInfo(hashList);
                }
              } catch (err) {
                sdk.log.warn("[酷狗] 获取音质信息失败，使用默认音质:", err.message);
              }

              musicList = result.data.data.map((item) => {
                const formattedItem = formatImportMusicItem(item);
                if (qualityInfoMap[item.hash]) {
                  formattedItem.qualities = qualityInfoMap[item.hash];
                } else {
                  formattedItem.qualities = {
                    "128k": {},
                    "320k": {},
                    flac: {},
                  };
                }
                return formattedItem;
              });

              sdk.log.debug(`[酷狗] 歌单导入成功，最终歌曲数量: ${musicList.length}`);
            } else {
              sdk.log.error(
                `[酷狗] 获取歌曲详情失败: ${result.data ? result.data.message || result.data.error || "未知错误" : "无返回数据"}`,
              );
            }
          } else {
            sdk.log.error(`[酷狗] 歌单歌曲列表为空或格式错误`);
          }
        } else {
          sdk.log.error(
            `[酷狗] 获取歌单列表失败: ${response.data ? response.data.message || response.data.error || "未知错误" : "无返回数据"}`,
          );
        }
      } else {
        sdk.log.error(`[酷狗] 无法获取歌单，缺少必要信息: userid=${info.userid}, id=${info.id}`);
      }
    } catch (error) {
      sdk.log.error(`[酷狗] 导入歌单异常: ${error.message}`);
      throw error;
    }

    return buildImportedKugouSheet(id, sheetInfo, musicList);
  }

  async function getRecommendSheetTags() {
    let pinned = [
      { title: "推荐", id: "5" },
      { title: "最热", id: "6" },
      { title: "最新", id: "7" },
      { title: "热藏", id: "3" },
      { title: "飙升", id: "8" },
    ];
    let group = [];

    try {
      let res = (
        await httpGet("http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1")
      ).data;

      let tagids = res.data.tagids;
      let index = 0;
      for (let name in tagids) {
        group[index] = {
          title: name,
          data: [],
        };
        tagids[name].data.forEach((tag) => {
          group[index].data.push({
            title: tag.name,
            id: tag.id + "",
          });
        });
        index++;
      }
    } catch (error) {
      sdk.log.error("[酷狗] 获取歌单标签失败:", error);
      throw error;
    }

    return {
      pinned: pinned,
      data: group,
    };
  }

  async function getRecommendSheetsByTag(tag, page) {
    let list = [];
    let tagId = tag?.id || "";

    let sortId = "5"; // 默认推荐
    let categoryId = "";

    if (["3", "5", "6", "7", "8"].includes(tagId)) {
      sortId = tagId;
      categoryId = "";
    } else if (tagId) {
      categoryId = tagId;
    }

    try {
      if (sortId === "5" && !categoryId && page === 1) {
        const responses = await Promise.allSettled([
          http({
            url: "http://everydayrec.service.kugou.com/guess_special_recommend",
            method: "POST",
            data: {
              appid: 1001,
              clienttime: Date.now(),
              clientver: 8275,
              key: "f1f93580115bb106680d2375f8032d96",
              mid: "21511157a05844bd085308bc76ef3343",
              platform: "pc",
              userid: "0",
              return_min: 6,
              return_max: 15,
            },
            headers: {
              "User-Agent": "KuGou2012-8275-web_browser_event_handler",
            },
          }),
          httpGet(
            `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&t=${sortId}&c=${categoryId}&p=${page}&pagesize=${pageSize}`,
          ),
        ]);

        if (responses.every((result) => result.status === "rejected")) {
          throw responses[1].reason;
        }
        const [recRes, listRes] = responses.map((result) =>
          result.status === "fulfilled" ? result.value : { data: {} },
        );
        let recList = recRes.data?.data?.special_list || [];
        let normalList = listRes.data?.special_db || [];
        list = [...recList, ...normalList];
      } else {
        let res = (
          await httpGet(
            `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&t=${sortId}&c=${categoryId}&p=${page}&pagesize=${pageSize}`,
          )
        ).data;
        list = res.special_db || [];
      }
    } catch (error) {
      sdk.log.error("[酷狗] 获取推荐歌单失败:", error);
      throw error;
    }

    return {
      isEnd: list.length < pageSize,
      data: list.map(formatRecommendSheetItem),
    };
  }

  async function getTopLists() {
    const lists = (
      await httpGet(
        "http://mobilecdnbj.kugou.com/api/v3/rank/list?version=9108&plat=0&showtype=2&parentid=0&apiver=6&area_code=1&withsong=0&with_res_tag=0",
        {
          headers: headers,
        },
      )
    ).data.data.info;
    const res = [
      {
        title: "热门榜单",
        data: [],
      },
      {
        title: "特色音乐榜",
        data: [],
      },
      {
        title: "全球榜",
        data: [],
      },
    ];
    const extra = {
      title: "其他",
      data: [],
    };
    lists.forEach((item) => {
      var _a, _b, _c, _d;
      if (item.classify === 1 || item.classify === 2) {
        res[0].data.push({
          id: item.rankid,
          description: item.intro,
          coverImg:
            (_a = item.imgurl) === null || _a === void 0 ? void 0 : _a.replace("{size}", "400"),
          title: item.rankname,
        });
      } else if (item.classify === 3 || item.classify === 5) {
        res[1].data.push({
          id: item.rankid,
          description: item.intro,
          coverImg:
            (_b = item.imgurl) === null || _b === void 0 ? void 0 : _b.replace("{size}", "400"),
          title: item.rankname,
        });
      } else if (item.classify === 4) {
        res[2].data.push({
          id: item.rankid,
          description: item.intro,
          coverImg:
            (_c = item.imgurl) === null || _c === void 0 ? void 0 : _c.replace("{size}", "400"),
          title: item.rankname,
        });
      } else {
        extra.data.push({
          id: item.rankid,
          description: item.intro,
          coverImg:
            (_d = item.imgurl) === null || _d === void 0 ? void 0 : _d.replace("{size}", "400"),
          title: item.rankname,
        });
      }
    });
    if (extra.data.length !== 0) {
      res.push(extra);
    }
    return res;
  }

  async function getTopListDetail(topListItem, page) {
    const paged = page != null;
    if (paged && (!Number.isSafeInteger(page) || page < 1)) throw new Error("榜单页码无效");
    const firstPage = paged ? page : 1;
    const songList = [];
    const seenPages = new Set();
    let isEnd = false;
    let total = NaN;
    for (let offset = 0; offset < (paged ? 1 : 100); offset++) {
      const upstreamPage = firstPage + offset;
      const res = await httpGet(
        `http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&ranktype=0&plat=0&pagesize=100&area_code=1&page=${upstreamPage}&volid=35050&rankid=${encodeURIComponent(topListItem.id)}&with_res_tag=0`,
        { headers, timeout: 15000 },
      );
      const data = res.data?.data;
      if (res.data?.status !== 1 || !Array.isArray(data?.info))
        throw new Error("酷狗榜单歌曲加载失败，请稍后重试");
      const signature = JSON.stringify(
        data.info.map((item) => [item.hash, item.album_id, item.album_audio_id]),
      );
      if (data.info.length && seenPages.has(signature))
        throw new Error("酷狗榜单分页异常，请稍后重试");
      seenPages.add(signature);
      songList.push(...data.info);
      const reportedTotal = data.total == null || data.total === "" ? NaN : Number(data.total);
      if (Number.isSafeInteger(reportedTotal) && reportedTotal >= 0) total = reportedTotal;
      const hasTotal = Number.isSafeInteger(total) && total >= 0;
      if (
        hasTotal &&
        data.info.length < Math.min(100, Math.max(0, total - (upstreamPage - 1) * 100))
      ) {
        throw new Error("酷狗榜单歌曲不完整，请稍后重试");
      }
      isEnd =
        data.info.length === 0 || (hasTotal ? upstreamPage * 100 >= total : data.info.length < 100);
      if (isEnd) break;
    }
    if (!paged && !isEnd) throw new Error("酷狗榜单分页异常，请稍后重试");

    const hashList = songList.map((item) => item.hash).filter(Boolean);

    let qualityInfoMap = {};
    try {
      if (hashList.length > 0) {
        qualityInfoMap = await getBatchMusicQualityInfo(hashList);
      }
    } catch (error) {
      sdk.log.error("[酷狗] 榜单音质信息获取失败:", error.message);
    }

    const musicList = songList.map((song) => {
      const formattedItem = formatMusicItem2(song);
      if (qualityInfoMap[song.hash]) {
        formattedItem.qualities = qualityInfoMap[song.hash];
      } else {
        formattedItem.qualities = {
          "128k": {},
          "320k": {},
          flac: {},
        };
      }
      return formattedItem;
    });

    return Object.assign(Object.assign({}, topListItem), {
      isEnd,
      musicList: musicList,
    });
  }

  async function getMusicComments(musicItem, page = 1, request = {}) {
    if (typeof request === "string") request = { sort: request };
    const sort = commentSort(request.sort);
    const root = commentRoot(musicItem, request.replyContext);
    const pageSize = 20;
    const state = pageState(request.cursor);
    const finish = result => result;

    const hash = musicItem.hash || musicItem.id;
    const musicInfo = root ? null : await getMusicInfoRaw(hash, { strict: true });
    const resId = root ? request.replyContext.mixsongId : musicInfo?.classification?.[0]?.res_id;
    if (!resId) throw new Error("Provider comment song identity is unavailable");
    let url;
    if (root) {
      url = "https://gateway.kugou.com/index.php?r=commentsv2/getReplyWithLike&code=fc4be23b4e972707f36b8a828a93ba8a&ver=1.01&clientver=8373&appid=1001&kugouid=0&need_show_image=1&childrenid=" + encodeURIComponent(request.replyContext.childrenId) + "&mixsongid=" + encodeURIComponent(resId) + "&tid=" + encodeURIComponent(root) + "&p=" + page + "&pagesize=" + pageSize;
    } else {
      const params = "appid=1005&clienttime=" + Date.now() + "&clienttoken=0&clientver=11409&code=fc4be23b4e972707f36b8a828a93ba8a&dfid=0&extdata=" + encodeURIComponent(hash) + "&kugouid=0&mid=16249512204336365674023395779019&mixsongid=" + encodeURIComponent(resId) + "&p=" + page + "&pagesize=" + pageSize + "&uuid=0&ver=10";
      url = "https://gateway.kugou.com/mcomment/r/v1/rank/" + (sort === "hot" ? "topliked" : "newest") + "?" + params + "&signature=" + signatureParams(params, "android");
    }
    const res = await httpGet(url, { headers: { "User-Agent": root ? "Android712-AndroidPhone-8983-18-0-COMMENT-wifi" : "Mozilla/5.0", "x-router": "m.comment.service.kugou.com" }, timeout: 15000 });
    if ((res.data?.err_code != null && res.data.err_code !== 0) || !Array.isArray(res.data?.list)) throw new Error("Provider comments request failed");
    const childrenId = root ? request.replyContext.childrenId : String(res.data.childrenid || "");
    if (!root && res.data.list.length && !/^[1-9]\d{0,19}$/.test(childrenId)) throw new Error("Provider comment thread identity is unavailable");
    function format(item, main = false) {
      const time = item.addtime ? Date.parse(String(item.addtime).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, "$1T$2+08:00")) : NaN;
      const result = { id: String(item.id), nickName: item.user_name || "", avatar: item.user_pic, comment: item.content || "",
        like: item.like?.likenum || 0, createAt: Number.isFinite(time) ? time : null, location: item.location,
        replies: (item.replys || []).map(value => format(value)) };
      if (item.pcontent) result.quote = { nickName: item.puser || "", avatar: item.puser_pic, comment: item.pcontent };
      return main ? commentMeta(result, musicItem, item.reply_num, childrenId, String(resId)) : result;
    }
    const total = commentCount(root ? res.data.comments_num : res.data.count);
    return finish({ data: res.data.list.map(item => format(item, !root)), total,
      isEnd: res.data.list.length < pageSize || (total != null && page * pageSize >= total) });

  }

  function getMusicDetailPageUrl(musicItem) {
    const hash = musicItem.hash || musicItem.id;
    if (!hash) {
      return "";
    }

    const albumId = musicItem.albumId || musicItem.album_id || musicItem.albumid || 0;
    return `https://www.kugou.com/song/#hash=${hash}&album_id=${albumId}`;
  }

  async function getHotSearch() {
    const response = await httpGet("https://gateway.kugou.com/api/v3/search/hot_tab", {
      params: {
        signature: "ee44edb9d7155821412d220bcaf509dd",
        appid: 1005,
        clientver: 10026,
        plat: 0,
      },
      headers: {
        dfid: "1ssiv93oVqMp27cirf2CvoF1",
        mid: "156798703528610303473757548878786007104",
        clienttime: "1584257267",
        "x-router": "msearch.kugou.com",
        "kg-rc": "1",
        "User-Agent": "Android9-AndroidPhone-10020-130-0-searchrecommendprotocol-wifi",
      },
      timeout: 10000,
    });
    const body = response.data;
    if (body?.errcode !== 0 || !Array.isArray(body.data?.list)) {
      throw new Error("酷狗音乐热搜加载失败，请稍后重试");
    }
    const list = body.data.list.flatMap((group) =>
      Array.isArray(group?.keywords) ? group.keywords : [],
    );
    return [
      ...new Set(
        list
          .map((item) => item?.keyword)
          .filter((word) => typeof word === "string" && word.trim())
          .map((word) => sdk.text.decodeHtml(word).trim())
          .filter(Boolean),
      ),
    ].slice(0, 30);
  }

  async function search(query, page, type) {
    if (type === "music") {
      return await searchMusic(query, page);
    } else if (type === "album") {
      return await searchAlbum(query, page);
    } else if (type === "sheet") {
      return await searchMusicSheet(query, page);
    } else if (type === "artist") {
      return await searchArtist(query, page);
    } else if (type === "lyric") {
      return await searchLyric(query, page);
    }
  }
  async function getMediaSource(musicItem, quality) {
    if (typeof requestMusicUrl !== "function") {
      throw Object.assign(new Error("Configure a music URL source"), {
        code: "authentication_required",
      });
    }
    const songId =
      quality === "flac"
        ? musicItem.sqhash || musicItem.id
        : quality === "320k"
          ? musicItem["320hash"] || musicItem.id
          : musicItem.id;
    musicItem = { ...musicItem, id: songId, hash: songId };
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
      source: "kg",
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
      commentPageResult(
        await operations(sdk).comments(request.entity, pageNumber(request.cursor), request),
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
        sort: capability === "comments.list" ? commentSort(request.sort) : request.sort,
        commentLimit: capability === "comments.list" ? pageLimit(request) : undefined,
        replyContext: capability === "comments.list" ? request.replyContext : undefined,
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
