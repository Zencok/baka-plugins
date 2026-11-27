// @baka-provider 2
// {{REQUEST_HANDLER}}

"use strict";

const manifest = {
  apiVersion: 2,
  kind: "provider",
  sourceId: "am.v1",
  id: "cc.baka.am",
  name: "Apple Music",
  version: "1.0.0",
  author: "BakaMusic",
  description: "Apple Music 音源",
  primaryKey: ["id"],
  supportedSearchType: ["music", "album", "artist", "lyric"],
  supportedQualities: ["320k", "flac", "hires"],
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

function operations(sdk) {
  // Generic Apple Music adapter. Provider HTTP functions are injected at distribution.
  // HLS parsing, Temari and audio decoding belong to Rust.
  const AM_PAGE_SIZE = 20;
  const AM_QUALITIES = ["320k", "flac", "hires"];
  const AM_PUBLIC_KEY = "skd://itunes.apple.com/P000000000/s1/e1";

  function amText(value) {
    return typeof value === "string" ? value : "";
  }
  function amId(item) {
    const id = String((item && item.id) || "");
    if (!/^[1-9]\d*$/.test(id)) throw new Error("Apple Music：歌曲或作品 ID 无效");
    return id;
  }
  function amPage(page) {
    const value = Number(page == null ? 1 : page);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
      throw new Error("Apple Music：页码无效");
    return value;
  }
  function amEnvelope(value) {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (_) {
        throw new Error("Apple Music：服务响应无效");
      }
    }
    if (!value || Number(value.code) !== 200)
      throw new Error("Apple Music：请求失败，请检查音源 Key 或稍后重试");
    return value;
  }
  async function amPost(path, body) {
    try {
      return amEnvelope(await requestAppleMusicApi(path, body, sdk));
    } catch (_) {
      // Never expose transport errors: config and backend messages can contain credentials.
      throw new Error("Apple Music：请求失败，请检查音源 Key 或稍后重试");
    }
  }
  function amImage(value) {
    return amText(value)
      .replace(/\{w\}|\{h\}|\{size\}/g, "600")
      .replace(/\{f\}/g, "jpg");
  }
  function amDuration(raw) {
    if (raw.durationInMillis != null) {
      const ms = Number(raw.durationInMillis);
      return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
    }
    const value = raw.duration;
    if (typeof value === "string" && value.includes(":")) {
      const parts = value.split(":").map(Number);
      return parts.every((n) => Number.isFinite(n) && n >= 0)
        ? parts.reduce((a, b) => a * 60 + b, 0)
        : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? (n > 1000 ? n / 1000 : n) : 0;
  }
  function amSong(raw) {
    const id = String(raw.songId || raw.id || "");
    const title = amText(raw.songName || raw.name || raw.title);
    if (!/^[1-9]\d*$/.test(id) || !title) return null;
    const singers = (Array.isArray(raw.artists) ? raw.artists : [])
      .filter((a) => a && a.name)
      .map((a) => ({ id: String(a.id || ""), name: a.name, avatar: amImage(a.cover) }));
    const qualities = {};
    for (const q of AM_QUALITIES) {
      if (raw.quality && Object.prototype.hasOwnProperty.call(raw.quality, q)) {
        const detail = raw.quality[q];
        qualities[q] =
          typeof detail === "object" && detail ? { ...detail } : { filesize: Number(detail) || 0 };
      }
    }
    if (!Object.keys(qualities).length) qualities["320k"] = {};
    return {
      id,
      title,
      artist: amText(raw.artistName || raw.artist) || singers.map((a) => a.name).join("、"),
      singerList: singers,
      album: amText(raw.albumName || raw.album),
      album_id: String(raw.albumId || ""),
      artwork: amImage(raw.coverUrl || raw.cover),
      duration: amDuration(raw),
      qualities,
    };
  }
  function amCollection(raw, type) {
    const id = String(raw.id || raw[type + "Id"] || "");
    const title = amText(raw.name || raw[type + "Name"] || raw.title);
    if (!/^[1-9]\d*$/.test(id) || !title) return null;
    return {
      id,
      title,
      name: title,
      artist: amText(raw.artistName || raw.artist),
      artwork: amImage(raw.coverUrl || raw.cover),
      description: amText(raw.description),
    };
  }
  function amRows(root, type) {
    return (Array.isArray(root.data) ? root.data : [])
      .filter((row) => row && typeof row === "object")
      .map((row) => (type === "music" ? amSong(row) : amCollection(row, type)))
      .filter(Boolean);
  }
  function amResult(root, type) {
    const result = { isEnd: root.hasNext !== true, data: amRows(root, type) };
    const total = Number(root.total);
    if (root.total != null && Number.isSafeInteger(total) && total >= 0) result.total = total;
    return result;
  }
  function amKeyEndpoint(value) {
    let path = amText(value) || "/music/key";
    const origin = typeof API_URL === "string" ? API_URL.replace(/\/$/, "") : "";
    if (path.startsWith(origin + "/")) path = path.slice(origin.length);
    // Credentials may only go to this source's API, never to a playlist key URI.
    if (!/^\/music\/[a-zA-Z0-9/_-]+$/.test(path) || path.includes("//")) {
      throw new Error("Apple Music：解密接口地址无效");
    }
    return path;
  }

  async function search(query, page = 1, type = "music") {
    const kinds = { music: "song", lyric: "song", album: "album", artist: "artist" };
    if (!kinds[type] || !amText(query).trim()) return { isEnd: true, data: [] };
    const root = await amPost("/music/search", {
      source: "am",
      keyword: query.trim(),
      type: kinds[type],
      page: amPage(page),
      limit: AM_PAGE_SIZE,
    });
    return amResult(root, type === "lyric" ? "music" : type);
  }

  async function getAlbumInfo(item) {
    const id = amId(item);
    const musicList = [];
    let info;
    // Host album API is unpaged. Never silently return a truncated album.
    for (let page = 1; page <= 50; page++) {
      const root = await amPost("/music/album", { source: "am", musicId: id, page, limit: 100 });
      info = info || (root.info && amCollection(root.info, "album"));
      musicList.push(...amRows(root, "music"));
      if (root.hasNext !== true) return { albumItem: info || item, musicList };
    }
    throw new Error("Apple Music：专辑曲目过多，暂时无法完整读取");
  }

  async function getArtistWorks(item, page = 1, type = "music") {
    if (type !== "music" && type !== "album") return { isEnd: true, data: [] };
    return amResult(
      await amPost("/music/artist", {
        source: "am",
        musicId: amId(item),
        view: type === "music" ? "songs" : "albums",
        page: amPage(page),
        limit: AM_PAGE_SIZE,
      }),
      type,
    );
  }

  async function getLyric(item) {
    const root = await amPost("/music/lyric", { source: "am", musicId: amId(item) });
    const data = root.data || {};
    // Keep original TTML, translations and vocal/timing metadata for native parsing.
    const ttml = amText(data.ttml);
    return {
      rawLrc: ttml || amText(data.chroma) || amText(data.chase) || amText(data.lyric),
      ...(ttml ? { format: "ttml" } : {}),
      translation: amText(data.trans),
      romanization: amText(data.roma),
      ttml,
      chroma: amText(data.chroma),
      chase: amText(data.chase),
    };
  }

  async function getMediaSource(item, quality = "320k") {
    if (!AM_QUALITIES.includes(quality)) throw new Error("Apple Music：不支持此音质");
    let root;
    try {
      root = amEnvelope(await requestMusicUrl(item, quality, sdk));
    } catch (_) {
      throw new Error("Apple Music：取流失败，请检查音源 Key 或稍后重试");
    }
    if (!/^https:\/\//i.test(amText(root.url))) throw new Error("Apple Music：播放地址无效");
    const adamId = String(root.adamId || amId(item));
    if (!/^[1-9]\d*$/.test(adamId)) throw new Error("Apple Music：返回的歌曲 ID 无效");
    // Deliberately no top-level url: older hosts must not play encrypted HLS as plaintext.
    return {
      type: "apple-hls",
      quality,
      appleMusic: {
        version: 1,
        playlistUrl: root.url,
        adamId,
        keyEndpoint: amKeyEndpoint(root.keyEndpoint),
        codec: amText(root.codec),
        audioGroup: amText(root.audioGroup),
      },
      ...(Number(root._cacheTTL) > 0
        ? { expiresAt: Math.floor(Date.now() / 1000) + Number(root._cacheTTL) }
        : {}),
    };
  }

  async function getAppleMusicKey(request) {
    if (!request || !/^skd:\/\/itunes\.apple\.com\/[^\s?#]+$/.test(amText(request.uri))) {
      throw new Error("Apple Music：分片密钥标识无效");
    }
    const musicId = request.uri === AM_PUBLIC_KEY ? "0" : amId({ id: request.adamId });
    const root = await amPost(amKeyEndpoint(request.keyEndpoint), {
      source: "am",
      musicId,
      uri: request.uri,
    });
    const data = root.data;
    if (!data || typeof data !== "object" || !amText(data.ctx) || !amText(data.state)) {
      throw new Error("Apple Music：解密模板无效");
    }
    return data;
  }

  return { search, getAlbumInfo, getArtistWorks, getLyric, getMediaSource, getAppleMusicKey };
}

const handlers = {
  search: async (request, sdk) =>
    pageResult(
      await operations(sdk).search(request.query, pageNumber(request.cursor), request.kind),
      request,
    ),
  collections: {
    get: async ({ entity }, sdk) =>
      entity.type === "artist"
        ? entity
        : { ...entity, ...(await operations(sdk).getAlbumInfo(entity)).albumItem },
    members: async (request, sdk) =>
      pageResult(
        await (request.entity.type === "artist"
          ? operations(sdk).getArtistWorks(request.entity, pageNumber(request.cursor), request.kind)
          : operations(sdk).getAlbumInfo(request.entity)),
        request,
      ),
  },
  media: {
    prepare: async ({ entity, quality }) => ({
      protocol: "lx",
      source: "am",
      musicInfo: { ...entity, songmid: entity.id },
      quality,
    }),
    resolve: async ({ entity, quality }, sdk) =>
      operations(sdk).getMediaSource(entity, quality || "320k"),
    license: async ({ payload }, sdk) => operations(sdk).getAppleMusicKey(payload),
  },
  lyrics: { get: async ({ entity }, sdk) => operations(sdk).getLyric(entity) },
};
module.exports = { manifest, handlers };
