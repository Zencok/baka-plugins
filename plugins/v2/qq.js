// @baka-provider 2
// {{REQUEST_HANDLER}}

"use strict";

// Public BakaMusic protocols, statically migrated to the QuickJS V2 SDK.
const manifest = {
  apiVersion: 2,
  kind: "provider",
  sourceId: "qq.v1",
  id: "cc.baka.qq",
  name: "QQ音乐",
  version: "1.0.0",
  srcUrl: typeof UPDATE_URL === "string" ? UPDATE_URL : "",
  author: "Toskysun",
  primaryKey: ["id", "songmid"],
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  supportedQualities: [
    "128k",
    "320k",
    "flac",
    "flac24bit",
    "hires",
    "atmos",
    "atmos_plus",
    "master",
  ],
  supportedVideoQualities: ["360p", "480p", "720p", "1080p", "4k"],
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
      key: "qq_user_id",
      name: "用户 ID",
      hint: "前往 https://mc.vsaa.cn/connect 扫码连接 QQ 音乐，复制用户 ID 后填入。此 ID 由本站生成，不是 QQ 号。每日推荐无需审核。",
    },
  ],
  hints: {
    importMusicSheet: [
      "QQ音乐APP：自建歌单-分享-分享到微信好友/QQ好友；然后点开并复制链接，直接粘贴即可",
      "H5：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待",
    ],
  },
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

  const pageSize = 20;

  const searchTypeMap = {
    0: "song",
    2: "album",
    1: "singer",
    3: "songlist",
    7: "song",
    12: "mv",
  };

  const headers = {
    referer: "https://y.qq.com",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
    Cookie: "uin=",
  };

  const mobileSearchHeaders = {
    "User-Agent": "QQMusic 14090508(android 12)",
  };

  const SIGN_PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19];
  const SIGN_PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
  const SIGN_SCRAMBLE_VALUES = [
    89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179,
  ];

  const typeMap = {
    m4a: {
      s: "C400",
      e: ".m4a",
    },
    128: {
      s: "M500",
      e: ".mp3",
    },
    320: {
      s: "M800",
      e: ".mp3",
    },
    ape: {
      s: "A000",
      e: ".ape",
    },
    flac: {
      s: "F000",
      e: ".flac",
    },
  };

  const qualityLevels = {
    "128k": "128k",
    "320k": "320k",
    flac: "flac",
    flac24bit: "flac24bit",
    hires: "hires",
    atmos: "atmos",
    atmos_plus: "atmos_plus",
    master: "master",
  };

  const videoQualityLevels = [
    { filetype: 10, quality: "360p", height: 360 },
    { filetype: 20, quality: "480p", height: 480 },
    { filetype: 30, quality: "720p", height: 720 },
    { filetype: 40, quality: "1080p", height: 1080 },
    { filetype: 50, quality: "4k", height: 2160 },
  ];

  function parseQualities(file) {
    if (!file) return {};

    const qualities = {};
    if (file.size_128mp3 && file.size_128mp3 !== 0) {
      qualities["128k"] = { size: file.size_128mp3, bitrate: 128000 };
    }
    if (file.size_320mp3 && file.size_320mp3 !== 0) {
      qualities["320k"] = { size: file.size_320mp3, bitrate: 320000 };
    }
    if (file.size_flac && file.size_flac !== 0) {
      qualities["flac"] = { size: file.size_flac, bitrate: 1411000 };
    }
    if (file.size_hires && file.size_hires !== 0) {
      qualities["hires"] = { size: file.size_hires, bitrate: 1536000 };
    }
    if (file.size_dolby && file.size_dolby !== 0) {
      qualities["dolby"] = { size: file.size_dolby, bitrate: 1411000 };
    }
    // size_new: master / atmos / atmos_plus / vinyl / …
    if (file.size_new && file.size_new[0] !== 0) {
      qualities["master"] = { size: file.size_new[0], bitrate: 2304000 };
    }
    if (file.size_new && file.size_new[1] !== 0) {
      qualities["atmos"] = { size: file.size_new[1], bitrate: 1411000 };
    }
    if (file.size_new && file.size_new[2] !== 0) {
      qualities["atmos_plus"] = { size: file.size_new[2], bitrate: 1411000 };
    }
    if (file.size_new && file.size_new[4] !== 0) {
      qualities["vinyl"] = { size: file.size_new[4], bitrate: 2500000 };
    }
    return qualities;
  }

  function normalizeQqPmid(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function getQqCoverUrl(prefix, pmid, size = 800) {
    const id = normalizeQqPmid(pmid);
    if (!id) return undefined;
    const sizePart = size ? `R${size}x${size}` : "";
    return `https://y.gtimg.cn/music/photo_new/${prefix}${sizePart}M000${id}.jpg`;
  }

  function getQqSongCoverPmid(track) {
    if (!track) return "";

    // QQ 音乐客户端将单曲独立封面 pmid 用 T062 前缀拼图。
    // musicu.fcg/search 返回中这个值通常落在 vs[1]；为空时才回退专辑封面。
    if (Array.isArray(track.vs)) {
      const vsPmid = normalizeQqPmid(track.vs[1]);
      if (vsPmid) return vsPmid;
    }

    return (
      normalizeQqPmid(track.radio_pmid) ||
      normalizeQqPmid(track.radioPmid) ||
      normalizeQqPmid(track.album_mv_pic_mid) ||
      normalizeQqPmid(track.albumMvPicMid) ||
      normalizeQqPmid(track.albumMVPicMid) ||
      normalizeQqPmid(track.album_mv_pmid)
    );
  }

  function buildQqArtwork(track, size = 800) {
    const songCoverPmid = getQqSongCoverPmid(track);
    if (songCoverPmid) return getQqCoverUrl("T062", songCoverPmid, size);

    const album = (track && track.album) || {};
    const albumPmid =
      normalizeQqPmid(album.pmid) ||
      normalizeQqPmid(album.pMid) ||
      normalizeQqPmid(album.picMid) ||
      normalizeQqPmid(track && track.albumpmid) ||
      normalizeQqPmid(track && track.albumPmid) ||
      normalizeQqPmid(album.mid) ||
      normalizeQqPmid(track && track.albummid) ||
      normalizeQqPmid(track && track.albumMid);
    if (albumPmid) return getQqCoverUrl("T002", albumPmid, size);

    const singers = (track && (track.singer || track.singers)) || [];
    const singer = singers[0] || {};
    const singerPmid =
      normalizeQqPmid(singer.pmid) ||
      normalizeQqPmid(singer.pMid) ||
      normalizeQqPmid(singer.picMid) ||
      normalizeQqPmid(singer.mid) ||
      normalizeQqPmid(track && track.singermid);
    return singerPmid ? getQqCoverUrl("T001", singerPmid, 300) : undefined;
  }

  // 备注：QQ 的 musicu.fcg 接口中，comm.ct 决定 file（音质）字段的完整度。
  // ct 19 = QQ 客户端，会下发完整的 size_hires / hires_sample / hires_bitdepth；
  // ct 24 = web 端，同一接口会把 hires 抹成 0（size_flac 等不受影响）。
  // 因此所有需要逐曲音质的接口（专辑、歌手歌曲、歌单、排行榜）都必须用 ct 19。
  const TRACK_QUALITY_COMM = { ct: 19, cv: 1859 };

  function formatMusicItem(_) {
    var _a, _b, _c;
    const albumid = _.albumid || ((_a = _.album) === null || _a === void 0 ? void 0 : _a.id);
    const albummid = _.albummid || ((_b = _.album) === null || _b === void 0 ? void 0 : _b.mid);
    const albumname = _.albumname || ((_c = _.album) === null || _c === void 0 ? void 0 : _c.title);

    const qualities = parseQualities(_.file);

    const singerList = (_.singer || []).map((s) => ({
      id: s.id,
      mid: s.mid,
      name: s.name,
      avatar:
        s.pmid || s.mid
          ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${s.pmid || s.mid}.jpg`
          : "",
    }));

    const artwork = buildQqArtwork(_);
    const mv = _.mv || {};
    const mvId = typeof mv === "object" ? mv.id : undefined;
    const mvVid = typeof mv === "object" ? mv.vid : typeof mv === "string" ? mv : undefined;

    return {
      id: _.id || _.songid,
      songmid: _.mid || _.songmid,
      title: _.title || _.songname,
      artist: _.singer.map((s) => s.name).join(", "),
      singerList: singerList,
      artwork,
      album: albumname,
      duration: _.interval,
      lrc: _.lyric || undefined,
      albumid: albumid,
      albummid: albummid,
      qualities: qualities,
      mv: mvVid || mvId || undefined,
      mvId: mvId || undefined,
      mvVid: mvVid || undefined,
    };
  }

  function formatAlbumItem(_) {
    return {
      id: _.albumID || _.albumid,
      albumMID: _.albumMID || _.album_mid,
      title: _.albumName || _.album_name,
      artwork:
        _.albumPic ||
        `https://y.gtimg.cn/music/photo_new/T002R800x800M000${_.albumMID || _.album_mid}.jpg`,
      date: _.publicTime || _.pub_time,
      singerID: _.singerID || _.singer_id,
      artist: _.singerName || _.singer_name,
      singerMID: _.singerMID || _.singer_mid,
      description: _.desc,
    };
  }

  function formatArtistItem(_) {
    return {
      name: _.singerName,
      id: _.singerID,
      singerMID: _.singerMID,
      avatar: _.singerPic,
      worksNum: _.songNum,
      songCount: _.songNum,
    };
  }

  function getQueryFromUrl(key, search) {
    try {
      const sArr = search.split("?");
      let s = "";
      if (sArr.length > 1) {
        s = sArr[1];
      } else {
        return key ? undefined : {};
      }
      const querys = s.split("&");
      const result = {};
      querys.forEach((item) => {
        const temp = item.split("=");
        result[temp[0]] = decodeURIComponent(temp[1]);
      });
      return key ? result[key] : result;
    } catch (err) {
      return key ? "" : {};
    }
  }

  function changeUrlQuery(obj, baseUrl) {
    const query = getQueryFromUrl(null, baseUrl);
    let url = baseUrl.split("?")[0];
    const newQuery = { ...query, ...obj };
    let queryArr = [];
    Object.keys(newQuery).forEach((key) => {
      if (newQuery[key] !== undefined && newQuery[key] !== "") {
        queryArr.push(`${key}=${encodeURIComponent(newQuery[key])}`);
      }
    });
    return `${url}?${queryArr.join("&")}`.replace(/\?$/, "");
  }

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

  function pickHashByIndexes(hash, indexes) {
    return indexes.map((idx) => hash[idx]).join("");
  }

  function hashSHA1(text) {
    return hash("sha1", text).toUpperCase();
  }

  function base64EncodeBytes(bytes) {
    return sdkBytes(bytes)
      .toString("base64")
      .replace(/[\/+=]/g, "");
  }

  function zzcSign(text) {
    const hash = hashSHA1(text);
    const part1 = pickHashByIndexes(hash, SIGN_PART_1_INDEXES);
    const part2 = pickHashByIndexes(hash, SIGN_PART_2_INDEXES);
    const part3 = SIGN_SCRAMBLE_VALUES.map(
      (value, index) => value ^ parseInt(hash.slice(index * 2, index * 2 + 2), 16),
    );
    return `zzc${part1}${base64EncodeBytes(part3)}${part2}`.toLowerCase();
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getSearchId() {
    let guid = "";
    for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16);
    return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  }

  async function searchBase(query, page, type) {
    const res = (
      await http({
        url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
        method: "POST",
        data: {
          req_1: {
            method: "DoSearchForQQMusicDesktop",
            module: "music.search.SearchCgiService",
            param: {
              num_per_page: pageSize,
              page_num: page,
              query: query,
              search_type: type,
            },
          },
        },
        headers: headers,
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;
    return {
      isEnd: res.req_1.data.meta.sum <= page * pageSize,
      data: res.req_1.data.body[searchTypeMap[type]].list,
    };
  }

  async function searchMusicDesktop(query, page) {
    const body = {
      comm: {
        _channelid: "0",
        _os_version: "6.2.9200-2",
        ct: "19",
        cv: "2151",
        guid: "1F70E520B2EAA7D25E11760783C53CA9",
        patch: "118",
        psrf_access_token_expiresAt: 0,
        psrf_qqaccess_token: "",
        psrf_qqopenid: "",
        psrf_qqunionid: "",
        tmeAppID: "qqmusic",
        tmeLoginType: 0,
        uin: "0",
        wid: "7223299733393904640",
      },
      "music.search.SearchCgiService": {
        module: "music.search.SearchCgiService",
        method: "DoSearchForQQMusicDesktop",
        param: {
          grp: 1,
          num_per_page: pageSize,
          page_num: page,
          query,
          remoteplace: "txt.newclient.top",
          search_type: 0,
          searchid: getSearchId(),
        },
      },
    };
    const sign = zzcSign(JSON.stringify(body));
    const res = (
      await http({
        url: `https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`,
        method: "POST",
        data: body,
        headers: mobileSearchHeaders,
        timeout: 20000,
      })
    ).data;
    const req = res?.["music.search.SearchCgiService"] ?? res?.req;
    const data = req.data;
    const meta = data.meta ?? {};
    return {
      isEnd: (meta.sum ?? meta.estimate_sum ?? 0) <= page * pageSize,
      data: data.body?.song?.list ?? data.body?.item_song ?? [],
    };
  }

  async function searchMusic(query, page) {
    const songs = await searchMusicDesktop(query, page);
    return {
      isEnd: songs.isEnd,
      data: songs.data.map(formatMusicItem),
    };
  }

  async function searchAlbum(query, page) {
    const albums = await searchBase(query, page, 2);
    return {
      isEnd: albums.isEnd,
      data: albums.data.map(formatAlbumItem),
    };
  }

  async function searchArtist(query, page) {
    const artists = await searchBase(query, page, 1);
    return {
      isEnd: artists.isEnd,
      data: artists.data.map(formatArtistItem),
    };
  }

  async function searchMusicSheet(query, page) {
    const musicSheet = await searchBase(query, page, 3);
    return {
      isEnd: musicSheet.isEnd,
      data: musicSheet.data.map((item) => ({
        title: item.dissname,
        createAt: item.createtime,
        description: item.introduction,
        playCount: item.listennum,
        worksNums: item.song_count,
        artwork: item.imgurl,
        id: item.dissid,
        artist: item.creator.name,
      })),
    };
  }

  async function searchLyric(query, page) {
    const songs = await searchBase(query, page, 7);
    return {
      isEnd: songs.isEnd,
      data: songs.data.map((it) => ({ ...formatMusicItem(it), rawLrcTxt: it.content })),
    };
  }

  function normalizeRequestedVideoHeight(videoQuality) {
    const value = String(videoQuality || "1080p")
      .toLowerCase()
      .trim();
    if (value === "4k" || value === "uhd") return 2160;
    const height = Number(value.replace(/p$/, ""));
    return Number.isFinite(height) && height > 0 ? height : 1080;
  }

  function pickQqMvStream(streams, requestedQuality) {
    const available = getQqMvStreams(streams);

    if (!available.length) return null;
    const targetHeight = normalizeRequestedVideoHeight(requestedQuality);
    return (
      available.find(({ level }) => level.height === targetHeight) ||
      available.filter(({ level }) => level.height <= targetHeight).pop() ||
      available[0]
    );
  }

  function getQqMvStreams(streams) {
    const list = Array.isArray(streams) ? streams : Object.values(streams || {});
    return videoQualityLevels
      .map((level) => ({
        level,
        stream: list.find((item) => Number(item?.filetype) === level.filetype),
      }))
      .filter(
        ({ stream }) =>
          Number(stream?.code || 0) === 0 &&
          Array.isArray(stream?.freeflow_url) &&
          stream.freeflow_url.length > 0,
      );
  }

  async function getMvSource(musicItem, videoQuality = "1080p") {
    const rawMv = musicItem?.mv;
    const vid =
      musicItem?.mvVid ||
      musicItem?.vid ||
      (rawMv && typeof rawMv === "object" ? rawMv.vid : rawMv);
    if (!vid || /^\d+$/.test(String(vid))) return null;

    try {
      const data = {
        comm: { ct: 24, cv: 4747474 },
        getMVUrl: {
          module: "gosrf.Stream.MvUrlProxy",
          method: "GetMvUrls",
          param: {
            vids: [String(vid)],
            request_typet: 10001,
          },
        },
      };
      const response = await httpGet("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        params: {
          format: "json",
          data: JSON.stringify(data),
        },
        headers,
        timeout: 20000,
      });
      const streams = response.data?.getMVUrl?.data?.[vid]?.mp4;
      const selected = pickQqMvStream(streams, videoQuality);
      if (!selected) return null;

      const urls = selected.stream.freeflow_url.filter(Boolean);
      const url = urls.find((item) => /^https:\/\//i.test(item)) || urls[0];
      if (!url) return null;

      const expire = Number(selected.stream.expire);
      const available = getQqMvStreams(streams);
      const size =
        Number(selected.stream.fileSize || selected.stream.filesize || selected.stream.size || 0) ||
        undefined;
      const backupUrls = urls.filter((item) => item !== url);
      return {
        url: /^http:\/\//i.test(url) ? url.replace(/^http:/i, "https:") : url,
        headers: {
          Referer: "https://y.qq.com/",
          "User-Agent": headers["user-agent"],
        },
        userAgent: headers["user-agent"],
        videoQuality: selected.level.quality,
        mimeType: "video/mp4",
        size,
        width: Number(selected.stream.width) || undefined,
        height: Number(selected.stream.height) || selected.level.height,
        bitrate: Number(selected.stream.bitrate) || undefined,
        availableVideoQualities: available.map(({ level, stream }) => ({
          key: level.quality,
          label: level.quality,
          width: Number(stream.width) || undefined,
          height: Number(stream.height) || level.height,
          bitrate: Number(stream.bitrate) || undefined,
          size: Number(stream.fileSize || stream.filesize || stream.size || 0) || undefined,
          codec: stream.codec || stream.codecs || undefined,
          mimeType: "video/mp4",
        })),
        backupUrls,
        expiresAt: Number.isFinite(expire) && expire > 0 ? Date.now() + expire * 1000 : undefined,
      };
    } catch (error) {
      sdk.log.error(`[QQ音乐] 获取 MV 播放源错误: ${error.message}`);
      return null;
    }
  }

  async function getMusicInfoForComment(musicItem) {
    try {
      if (musicItem.id && typeof musicItem.id === "number") {
        return musicItem.id;
      }
      const res = await httpPost(
        "https://u.y.qq.com/cgi-bin/musicu.fcg",
        {
          comm: {
            ct: "19",
            cv: "1859",
            uin: "0",
          },
          req: {
            module: "music.trackInfo.UniformRuleCtrl",
            method: "CgiGetTrackInfo",
            param: {
              types: [1],
              ids: [musicItem.id || 0],
              mids: [musicItem.songmid],
              ctx: 0,
            },
          },
        },
        {
          headers: {
            referer: "https://y.qq.com",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
            Cookie: "uin=",
          },
        },
      );

      if (res.data?.code !== 0 || res.data?.req?.code !== 0) {
        throw new Error("Provider song request failed");
      }
      if (
        res.data &&
        res.data.req &&
        res.data.req.data &&
        res.data.req.data.tracks &&
        res.data.req.data.tracks[0]
      ) {
        return res.data.req.data.tracks[0].id;
      }

      return null;
    } catch (error) {
      sdk.log.error("[QQ音乐] 获取歌曲信息失败:", error);
      throw error;
    }
  }

  // 通过ID/songmid获取歌曲详细信息

  async function getMusicInfo(musicBase) {
    if (
      typeof musicBase.artwork === "string" &&
      musicBase.artwork &&
      musicBase.qualities &&
      Object.keys(musicBase.qualities).length > 0
    ) {
      return {
        id: musicBase.id,
        songid: musicBase.songid || musicBase.id,
        songmid: musicBase.songmid || musicBase.mid,
        mid: musicBase.mid || musicBase.songmid,
        title: musicBase.title,
        artist: musicBase.artist,
        album: musicBase.album,
        albumid: musicBase.albumid,
        albummid: musicBase.albummid,
        artwork: musicBase.artwork,
        qualities: musicBase.qualities,
        mv: musicBase.mv,
        mvId: musicBase.mvId,
        mvVid: musicBase.mvVid,
        platform: "QQ音乐",
      };
    }

    try {
      // 智能识别：纯数字是 songid，包含字母是 songmid
      let songmid = null;
      let songid = null;

      // 优先检查 songmid 字段（如果包含字母，则是有效的 songmid）
      const midCandidate = musicBase.songmid || musicBase.mid;
      if (midCandidate && /[a-zA-Z]/.test(String(midCandidate))) {
        songmid = String(midCandidate);
      }

      // 检查 id/songid 字段（纯数字）
      const idCandidate = musicBase.id || musicBase.songid;
      if (idCandidate && /^\d+$/.test(String(idCandidate))) {
        songid = Number(idCandidate);
      }

      // 如果 songmid 字段是纯数字，说明是误传的 songid
      if (!songid && midCandidate && /^\d+$/.test(String(midCandidate))) {
        songid = Number(midCandidate);
      }

      if (!songmid && !songid) {
        sdk.log.error("[QQ音乐] getMusicInfo: 缺少有效的歌曲标识");
        return null;
      }

      const res = await httpPost(
        "https://u.y.qq.com/cgi-bin/musicu.fcg",
        {
          comm: {
            ct: "19",
            cv: "1859",
            uin: "0",
          },
          req: {
            module: "music.trackInfo.UniformRuleCtrl",
            method: "CgiGetTrackInfo",
            param: {
              types: [1],
              ids: songid ? [songid] : [0],
              mids: songmid ? [songmid] : [],
              ctx: 0,
            },
          },
        },
        {
          headers: {
            referer: "https://y.qq.com",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
            Cookie: "uin=",
          },
        },
      );

      if (
        res.data &&
        res.data.req &&
        res.data.req.data &&
        res.data.req.data.tracks &&
        res.data.req.data.tracks[0]
      ) {
        const track = res.data.req.data.tracks[0];
        const album = track.album || {};
        const singers = track.singer || [];

        const singerList = singers.map((s) => ({
          id: s.id,
          mid: s.mid,
          name: s.name,
        }));

        return {
          id: track.id,
          songid: track.id,
          songmid: track.mid,
          mid: track.mid,
          title: track.title || track.name,
          artist: singers.map((s) => s.name).join(", "),
          singerList: singerList,
          album: album.title || album.name,
          albumid: album.id,
          albummid: album.mid,
          artwork: buildQqArtwork(track),
          duration: track.interval,
          qualities: parseQualities(track.file),
          mv: track.mv?.vid || track.mv?.id || undefined,
          mvId: track.mv?.id || undefined,
          mvVid: track.mv?.vid || undefined,
          platform: "QQ音乐",
        };
      }

      sdk.log.error("[QQ音乐] getMusicInfo: 未找到歌曲信息");
      return null;
    } catch (error) {
      sdk.log.error("[QQ音乐] getMusicInfo 错误:", error.message);
      return null;
    }
  }

  async function getLyric(musicItem) {
    try {
      const res = await http({
        url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
        method: "POST",
        data: {
          comm: {
            ct: "19",
            cv: "1859",
            uin: "0",
          },
          req: {
            method: "GetPlayLyricInfo",
            module: "music.musichallSong.PlayLyricInfo",
            param: {
              format: "json",
              crypt: 1,
              qrc: 1,
              qrc_t: 0,
              roma: 1,
              roma_t: 0,
              trans: 1,
              trans_t: 0,
              songID: musicItem.id || musicItem.songid,
              type: -1,
            },
          },
        },
        headers: {
          referer: "https://y.qq.com",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
        },
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      });

      if (res.data?.code === 0 && res.data?.req?.code === 0) {
        const data = res.data.req.data;
        const lyricResult = {
          rawLrc: data.lyric || undefined,
          translation: data.trans || undefined,
          romanization: data.roma || undefined,
        };

        if (!lyricResult.rawLrc && !lyricResult.translation && !lyricResult.romanization) {
          return getLyricLegacy(musicItem);
        }

        return lyricResult;
      }

      throw new Error("新 API 返回错误");
    } catch (error) {
      return getLyricLegacy(musicItem);
    }
  }

  async function getLyricLegacy(musicItem) {
    const result = (
      await http({
        url: `http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${
          musicItem.songmid
        }&pcachetime=${new Date().getTime()}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`,
        headers: { Referer: "https://y.qq.com", Cookie: "uin=" },
        method: "get",
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;
    const res = JSON.parse(
      result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ""),
    );
    let translation;
    if (res.trans) {
      translation = sdk.text.decodeHtml(sdk.bytes.decode(sdk.bytes.encode(res.trans, "base64")));
    }
    return {
      rawLrc: normalizeColonTimeTag(
        sdk.text.decodeHtml(sdk.bytes.decode(sdk.bytes.encode(res.lyric, "base64"))),
      ),
      translation: normalizeColonTimeTag(translation),
    };
  }

  // 上游单次最多稳定返回 999 首，专辑需要按 begin 继续取全
  const ALBUM_PAGE_SIZE = 999;
  // 异常保护：超过该数量视为上游返回异常，报错而不是交付被截断的专辑
  const ALBUM_MAX_SONGS = 100000;

  async function getAlbumSongPage(albumItem, begin, num) {
    const url = changeUrlQuery(
      {
        data: JSON.stringify({
          comm: { ...TRACK_QUALITY_COMM },
          albumSonglist: {
            method: "GetAlbumSongList",
            param: {
              albumMid: albumItem.albumMID,
              albumID: 0,
              begin: begin,
              num: num,
              order: 2,
            },
            module: "music.musichallAlbum.AlbumSongList",
          },
        }),
      },
      "https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8",
    );
    const res = (
      await http({
        url: url,
        headers: headers,
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;

    const data = res?.albumSonglist?.data;
    const code = res?.albumSonglist?.code;
    if (!data || !Array.isArray(data.songList) || (code != null && code !== 0)) {
      throw new Error("[QQ音乐] 获取专辑歌曲失败，请稍后重试");
    }
    return data;
  }

  async function getAlbumInfo(albumItem) {
    const songList = [];
    const pageSignatures = new Set();
    let total = null;

    for (let begin = 0; ; begin += ALBUM_PAGE_SIZE) {
      if (begin >= ALBUM_MAX_SONGS) {
        throw new Error("[QQ音乐] 专辑分页超出合理范围，请重试");
      }
      const page = await getAlbumSongPage(albumItem, begin, ALBUM_PAGE_SIZE);
      const reported = Number(page.totalNum ?? page.songNum);
      if (Number.isFinite(reported) && reported > 0) {
        total = Math.max(total || 0, reported);
      }
      const entries = page.songList;
      const signature = JSON.stringify(
        entries.map((item) => item?.songInfo?.id ?? item?.songInfo?.mid),
      );
      if (entries.length && pageSignatures.has(signature)) {
        throw new Error("[QQ音乐] 专辑接口重复返回同一页，请重试");
      }
      pageSignatures.add(signature);
      // 总数已知时，空页意味着上游提前结束，不能当作完整专辑交付
      if (!entries.length && total !== null && begin < total) {
        throw new Error("[QQ音乐] 专辑分页提前结束，请重试");
      }
      for (const entry of entries) {
        const song = entry?.songInfo;
        if (!song || song.id == null) continue;
        if (!Array.isArray(song.singer)) song.singer = [];
        songList.push(song);
      }
      // 上限固定、顺序固定的专辑列表：按总数判断结束，短页不代表取完
      if (total !== null ? begin + ALBUM_PAGE_SIZE >= total : entries.length < ALBUM_PAGE_SIZE)
        break;
    }

    // ct 19 的专辑接口已直接下发完整 file（128k/320k/flac/hires/master/atmos…），
    // 与 CgiGetTrackInfo 逐字段一致，因此无需再额外请求批量音质。
    return {
      musicList: songList.map((song) => formatMusicItem(song)),
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

  async function getArtistSongs(artistItem, page) {
    // 改用 musichall.song_list_server/GetSingerSongList：
    // 旧接口 music.web_singer_info_svr/get_singer_detail_info 即使 ct:19 也不下发
    // size_new（master/atmos/atmos_plus/vinyl），file 只到 flac/hires；
    // GetSingerSongList 在 ct:19 下返回完整 file（size_new + size_hires），与批量接口一致。
    const url = changeUrlQuery(
      {
        data: JSON.stringify({
          comm: { ...TRACK_QUALITY_COMM },
          singerSongList: {
            method: "GetSingerSongList",
            param: {
              order: 1,
              singerMid: artistItem.singerMID,
              begin: (page - 1) * pageSize,
              num: pageSize,
            },
            module: "musichall.song_list_server",
          },
        }),
      },
      "http://u.y.qq.com/cgi-bin/musicu.fcg",
    );
    const res = (
      await http({
        url: url,
        method: "get",
        headers: headers,
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;

    const songList = (res.singerSongList.data.songList || []).map((item) => item.songInfo);

    return {
      isEnd: res.singerSongList.data.totalNum <= page * pageSize,
      artistItem: artistWorksItem(artistItem, "music", res.singerSongList.data.totalNum),
      data: songList.map((song) => formatMusicItem(song)),
    };
  }

  async function getArtistAlbums(artistItem, page) {
    const url = changeUrlQuery(
      {
        data: JSON.stringify({
          comm: {
            ct: 24,
            cv: 0,
          },
          singerAlbum: {
            method: "get_singer_album",
            param: {
              singermid: artistItem.singerMID,
              order: "time",
              begin: (page - 1) * pageSize,
              num: pageSize / 1,
              exstatus: 1,
            },
            module: "music.web_singer_info_svr",
          },
        }),
      },
      "http://u.y.qq.com/cgi-bin/musicu.fcg",
    );
    const res = (
      await http({
        url,
        method: "get",
        headers: headers,
        xsrfCookieName: "XSRF-TOKEN",
        withCredentials: true,
      })
    ).data;
    return {
      isEnd: res.singerAlbum.data.total <= page * pageSize,
      artistItem: artistWorksItem(artistItem, "album", res.singerAlbum.data.total),
      data: res.singerAlbum.data.list.map(formatAlbumItem),
    };
  }

  async function getArtistWorks(artistItem, page, type) {
    if (type === "music") {
      return getArtistSongs(artistItem, page);
    }
    if (type === "album") {
      return getArtistAlbums(artistItem, page);
    }
  }
  // 非标准时间戳格式修正 [mm:ss:cc] -> [mm:ss.ccc]

  async function importMusicSheet(urlLike) {
    let id;

    // 匹配 i.y.qq.com/n2/m/share/details/taoge.html?...id=数字
    if (!id) {
      id = (urlLike.match(
        /https?:\/\/i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html\?.*id=([0-9]+)/,
      ) || [])[1];
    }

    // 匹配 i2.y.qq.com/n3/other/pages/details/playlist.html?...&id=数字
    if (!id) {
      id = (urlLike.match(
        /https?:\/\/i\d*\.y\.qq\.com\/n\d+\/.*\/playlist\.html\?.*[?&]id=([0-9]+)/,
      ) || [])[1];
    }

    // 匹配 y.qq.com/n/ryqq/playlist/数字
    if (!id) {
      id = (urlLike.match(/https?:\/\/y\.qq\.com\/n\/ryqq\/playlist\/([0-9]+)/) || [])[1];
    }

    // 匹配纯数字
    if (!id) {
      id = (urlLike.match(/^(\d+)$/) || [])[1];
    }

    if (!id) {
      sdk.log.error("[QQ音乐] 无法从 URL 中提取歌单 ID:", urlLike);
      return;
    }

    const pageSize = 500;
    const musicList = [];
    const seen = new Set();
    const pageSignatures = new Set();
    let sheetData = null;
    let total = null;
    for (let begin = 0; ; begin += pageSize) {
      // A runaway/changing provider must fail rather than report a partial import.
      if (begin >= 1000000) throw new Error("[QQ音乐] 歌单分页超出合理范围，请重试");
      const page = await getQQPlaylistPage(id, begin, pageSize);
      sheetData = sheetData || page.dirinfo;
      const reported = Number(page.dirinfo.songnum ?? page.dirinfo.song_num);
      if (Number.isFinite(reported) && reported > 0) total = Math.max(total || 0, reported);
      const songs = page.songlist;
      const signature = JSON.stringify(songs.map((song) => song.id ?? song.mid));
      if (songs.length && pageSignatures.has(signature)) {
        throw new Error("[QQ音乐] 歌单接口重复返回同一页，请重试");
      }
      pageSignatures.add(signature);
      if (!songs.length && total !== null && begin < total) {
        throw new Error("[QQ音乐] 歌单分页提前结束，请重试");
      }
      for (const song of songs) {
        const item = formatMusicItem(song);
        if (item.id == null || seen.has(String(item.id))) continue;
        seen.add(String(item.id));
        musicList.push(item);
      }
      // QQ offsets count source slots, including entries omitted by the API.
      // A short page is NOT the end while dirinfo still advertises more slots.
      if (total !== null ? begin + pageSize >= total : songs.length < pageSize) break;
    }
    return buildQQImportedSheet(id, sheetData, musicList, total);
  }

  async function getQQPlaylistPage(id, begin, count) {
    const result = (
      await http({
        url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
        method: "POST",
        data: {
          loginUin: 0,
          comm: { ...TRACK_QUALITY_COMM, uin: 0 },
          req: {
            module: "music.srfDissInfo.aiDissInfo",
            method: "uniform_get_Dissinfo",
            param: {
              disstid: Number(id),
              userinfo: 1,
              tag: 1,
              orderlist: 1,
              song_begin: begin,
              song_num: count,
              onlysonglist: 0,
              enc_host_uin: "",
            },
          },
        },
        headers: {
          Referer: "https://y.qq.com/",
          Origin: "https://y.qq.com",
          "User-Agent": headers["user-agent"],
          "Content-Type": "application/json;charset=UTF-8",
        },
        timeout: 20000,
      })
    ).data;
    const page = result?.req?.data;
    if (
      result?.code !== 0 ||
      result?.req?.code !== 0 ||
      page?.code !== 0 ||
      !page.dirinfo ||
      !Array.isArray(page.songlist)
    ) {
      throw new Error("[QQ音乐] 获取歌单分页失败，请检查链接或稍后重试");
    }
    return page;
  }

  function buildQQImportedSheet(id, sheetData, musicList, total) {
    return {
      id: String(sheetData.disstid || sheetData.id || id),
      title: sdk.text.decodeHtml(sheetData.dissname || sheetData.dirname || sheetData.title || ""),
      artwork: sheetData.logo || sheetData.logo1 || sheetData.picurl || sheetData.picurl2,
      artist:
        sheetData.nickname ||
        sheetData.nick ||
        sheetData.host_nick ||
        sheetData.creator?.nick ||
        "",
      description: sdk.text.decodeHtml(sheetData.desc || sheetData.desc2 || ""),
      worksNum: total ?? (Number(sheetData.songnum || sheetData.song_num) || musicList.length),
      playCount: Number(sheetData.visitnum || sheetData.listennum) || 0,
      createAt: Number(sheetData.ctime) > 0 ? Number(sheetData.ctime) * 1000 : undefined,
      musicList,
    };
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

  async function getMusicSheetInfo(sheet, page = 1) {
    const size = 100;
    const begin = (Math.max(1, Number(page) || 1) - 1) * size;
    const result = await getQQPlaylistPage(sheet.id, begin, size);
    const musicList = result.songlist.map((song) => formatMusicItem(song));
    const total = playlistSheetItem({}, result.dirinfo.songnum, result.dirinfo.song_num).worksNum;
    const knownTotal = total != null;
    return {
      isEnd: knownTotal ? begin + size >= total : musicList.length < size,
      sheetItem: playlistSheetItem(
        {
          ...sheet,
          ...buildQQImportedSheet(sheet.id, result.dirinfo, [], knownTotal ? total : null),
          // An omitted upstream total must not become zero from an empty metadata list.
          worksNum: knownTotal ? total : sheet.worksNum,
        },
        knownTotal ? total : undefined,
      ),
      musicList,
    };
  }

  async function getRecommendSheetTags() {
    const res = (
      await httpGet(
        "https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg?format=json&inCharset=utf8&outCharset=utf-8",
        {
          headers: {
            referer: "https://y.qq.com/",
          },
        },
      )
    ).data.data.categories;
    const data = res.slice(1).map((_) => ({
      title: _.categoryGroupName,
      data: _.items.map((tag) => ({
        id: tag.categoryId,
        title: tag.categoryName,
      })),
    }));
    const pinned = [];
    for (let d of data) {
      if (d.data.length) {
        pinned.push(d.data[0]);
      }
    }
    return {
      pinned,
      data,
    };
  }

  async function getRecommendSheetsByTag(tag, page) {
    const pageSize = 20;
    const rawRes = (
      await httpGet("https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg", {
        headers: {
          referer: "https://y.qq.com/",
        },
        params: {
          inCharset: "utf8",
          outCharset: "utf-8",
          sortId: 5,
          categoryId: (tag === null || tag === void 0 ? void 0 : tag.id) || "10000000",
          sin: pageSize * (page - 1),
          ein: page * pageSize - 1,
        },
      })
    ).data;
    const res = JSON.parse(
      rawRes.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ""),
    ).data;
    const isEnd = res.sum <= page * pageSize;
    const data = res.list.map((item) => {
      var _a, _b;
      return {
        id: item.dissid,
        createTime: item.createTime,
        title: item.dissname,
        artwork: item.imgurl,
        description: item.introduction,
        playCount: item.listennum,
        artist:
          (_b = (_a = item.creator) === null || _a === void 0 ? void 0 : _a.name) !== null &&
          _b !== void 0
            ? _b
            : "",
      };
    });
    return {
      isEnd,
      data,
    };
  }

  async function getTopLists() {
    const list = await http({
      url: "https://u.y.qq.com/cgi-bin/musicu.fcg?_=1577086820633&data=%7B%22comm%22%3A%7B%22g_tk%22%3A5381%2C%22uin%22%3A123456%2C%22format%22%3A%22json%22%2C%22inCharset%22%3A%22utf-8%22%2C%22outCharset%22%3A%22utf-8%22%2C%22notice%22%3A0%2C%22platform%22%3A%22h5%22%2C%22needNewCode%22%3A1%2C%22ct%22%3A23%2C%22cv%22%3A0%7D%2C%22topList%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetAll%22%2C%22param%22%3A%7B%7D%7D%7D",
      method: "get",
      headers: {
        Cookie: "uin=",
      },
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    });
    return list.data.topList.data.group.map((e) => ({
      title: e.groupName,
      data: e.toplist.map((_) => ({
        id: _.topId,
        description: _.intro,
        title: _.title,
        period: _.period,
        coverImg: _.headPicUrl || _.frontPicUrl,
      })),
    }));
  }

  async function getTopListDetail(topListItem) {
    var _a;
    const res = await http({
      url: `https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&data=%7B%22detail%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetDetail%22%2C%22param%22%3A%7B%22topId%22%3A${
        topListItem.id
      }%2C%22offset%22%3A0%2C%22num%22%3A100%2C%22period%22%3A%22${
        (_a = topListItem.period) !== null && _a !== void 0 ? _a : ""
      }%22%7D%7D%2C%22comm%22%3A%7B%22ct%22%3A19%2C%22cv%22%3A1859%7D%7D`,
      method: "get",
      headers: {
        Cookie: "uin=",
      },
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    });

    const songList = res.data.detail.data.songInfoList;

    return { ...topListItem, musicList: songList.map((song) => formatMusicItem(song)) };
  }

  async function getMusicComments(musicItem, page = 1) {
    const pageSize = 20;

    try {
      const songId = await getMusicInfoForComment(musicItem);

      if (!songId || typeof songId !== "number") {
        return { isEnd: true, data: [] };
      }

      const res = await httpPost(
        "https://u.y.qq.com/cgi-bin/musicu.fcg",
        {
          comm: {
            cv: 4747474,
            ct: 24,
            format: "json",
            inCharset: "utf-8",
            outCharset: "utf-8",
            notice: 0,
            platform: "yqq.json",
            needNewCode: 1,
            uin: 0,
          },
          req: {
            module: "music.globalComment.CommentRead",
            method: "GetHotCommentList",
            param: {
              BizType: 1,
              BizId: String(songId),
              LastCommentSeqNo: "",
              PageSize: pageSize,
              PageNum: page - 1,
              HotType: 1,
              WithAirborne: 0,
              PicEnable: 1,
            },
          },
        },
        {
          headers: {
            accept: "application/json",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
            referer: "https://y.qq.com/",
            origin: "https://y.qq.com",
            "content-type": "application/json; charset=utf-8",
          },
        },
      );

      if (res.data.code !== 0 || !res.data.req || res.data.req.code !== 0) {
        throw new Error("Provider comments request failed");
      }

      const commentList = res.data.req.data?.CommentList?.Comments || [];
      const comments = commentList.map((item) => {
        const comment = {
          id: item.CmId,
          nickName: item.Nick || "",
          avatar: item.Avatar,
          comment: item.Content || "",
          like: item.PraiseNum || 0,
          createAt: item.PubTime ? parseInt(item.PubTime + "000") : null,
          replies: [],
        };

        if (item.SubComments && Array.isArray(item.SubComments)) {
          comment.replies = item.SubComments.map((c) => ({
            id: c.CmId,
            nickName: c.Nick || "",
            avatar: c.Avatar || "",
            comment: c.Content || "",
            like: c.PraiseNum || 0,
            createAt: c.PubTime ? parseInt(c.PubTime + "000") : null,
          }));
        }

        return comment;
      });

      return {
        isEnd: commentList.length < pageSize,
        data: comments,
      };
    } catch (error) {
      sdk.log.error("[QQ音乐] 获取热评论失败:", error);
      throw error;
    }
  }

  function getMusicDetailPageUrl(musicItem) {
    const songmid = musicItem.songmid || musicItem.mid;
    return songmid ? `https://y.qq.com/n/yqq/song/${songmid}.html` : "";
  }

  async function getHotSearch() {
    const response = await httpPost(
      "https://u.y.qq.com/cgi-bin/musicu.fcg",
      {
        comm: {
          ct: "19",
          cv: "1803",
          uin: "0",
          guid: "0",
          patch: "118",
          tmeAppID: "qqmusic",
          tmeLoginType: 0,
        },
        hotkey: {
          module: "tencent_musicsoso_hotkey.HotkeyService",
          method: "GetHotkeyForQQMusicPC",
          param: { search_id: "", uin: 0 },
        },
      },
      { headers: { Referer: "https://y.qq.com/portal/player.html" }, timeout: 10000 },
    );
    const body = response.data;
    const list = body?.hotkey?.data?.vec_hotkey;
    if (
      body?.code !== 0 ||
      (body.hotkey?.code != null && body.hotkey.code !== 0) ||
      !Array.isArray(list)
    ) {
      throw new Error("QQ音乐热搜加载失败，请稍后重试");
    }
    return [
      ...new Set(
        list
          .map((item) => item?.query)
          .filter((word) => typeof word === "string" && word.trim())
          .map((word) => word.trim()),
      ),
    ].slice(0, 30);
  }

  const DAILY_CONNECT_URL = "https://mc.vsaa.cn/connect";
  const DAILY_API_URL = "https://mc.vsaa.cn/api/qq/recommendations/daily";

  // User credentials are independent of the subscription's playback API key.
  async function loadDailyRecommendations() {
    const variables = true ? sdk.settings || {} : {};
    const key = String(variables.qq_user_id || "").trim();
    if (!key) return { state: "unconfigured", connectUrl: DAILY_CONNECT_URL };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(key))
      return { state: "login_required", connectUrl: DAILY_CONNECT_URL };
    let body;
    try {
      const response = await httpGet(DAILY_API_URL, {
        headers: { "X-User-Id": key },
        timeout: 40000,
      });
      body = response.data;
    } catch (error) {
      body = error && error.response && error.response.data;
      if (!body || typeof body !== "object")
        return { state: "error", connectUrl: DAILY_CONNECT_URL };
    }
    if (body?.code !== 0) {
      const state = [1001, 1005].includes(body?.code)
        ? "login_required"
        : body?.code === 1003
          ? "blocked"
          : body?.code === 2002
            ? "updating"
            : "error";
      return { state, connectUrl: DAILY_CONNECT_URL };
    }
    const data = body.data;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (data?.date !== today) return { state: "updating", connectUrl: DAILY_CONNECT_URL };
    if (
      !/^\d{1,20}$/.test(String(data?.tid || "")) ||
      !Number.isFinite(data.refresh_at) ||
      data.refresh_at <= Date.now()
    ) {
      return { state: "error", connectUrl: DAILY_CONNECT_URL };
    }
    const { sheetItem } = await getMusicSheetInfo({ id: String(data.tid) }, 1);
    return { state: "ready", date: data.date, refreshAt: data.refresh_at, sheetItem };
  }

  // Shared discovery contract: platform rules, destinations and refresh times are plugin-owned.
  async function getDailyRecommendations() {
    return {
      title: "每日三十首",
      accountName: "QQ 音乐",
      connectUrl: DAILY_CONNECT_URL,
      ...(await loadDailyRecommendations()),
    };
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
    entity: (entity) => getMusicInfo(entity),
    collection: async (entity) => {
      const snapshot = importedSnapshot(entity);
      if (snapshot) return snapshot.entity;
      if (entity.type === "artist") return entity;
      const result = await (entity.type === "album"
        ? getAlbumInfo(entity)
        : getMusicSheetInfo(entity, 1));
      return { ...entity, ...(result.albumItem || result.sheetItem || {}) };
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
      return entity.type === "artist"
        ? getArtistWorks(entity, page, kind)
        : entity.type === "chart"
          ? getTopListDetail(entity, page)
          : entity.type === "album"
            ? getAlbumInfo(entity, page)
            : getMusicSheetInfo(entity, page);
    },
    charts: getTopLists,
    tags: getRecommendSheetTags,
    playlists: getRecommendSheetsByTag,
    hotSearch: getHotSearch,
    daily: getDailyRecommendations,

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
    playlistTags: async (request, sdk) => sliceResult(await operations(sdk).tags(), request),
    playlists: async (request, sdk) =>
      pageResult(await operations(sdk).playlists(request.tag, pageNumber(request.cursor)), request),
    hotSearch: async (request, sdk) => sliceResult(await operations(sdk).hotSearch(), request),
    daily: async (request, sdk) => dailyResult(await operations(sdk).daily(), request),
  },
  media: {
    prepare: async ({ entity, quality }) => ({
      protocol: "lx",
      source: "tx",
      musicInfo: {
        ...entity,
        songmid: entity.songmid || entity.hash || entity.copyrightId || entity.id,
      },
      quality,
    }),
    resolve: async ({ entity, quality }, sdk) => {
      if (typeof requestMusicUrl === "function") {
        const result = await requestMusicUrl(
          entity,
          quality || manifest.supportedQualities[0],
          sdk,
        );
        return typeof result === "string" ? { url: result, quality } : result;
      }
      throw Object.assign(new Error("Configure a music URL source"), {
        code: "authentication_required",
      });
    },
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
          ? { id: entity.id, type: entity.type, token: entity._bakaImportToken }
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
