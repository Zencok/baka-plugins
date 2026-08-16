"use strict";

/**
 * BakaMusic Bilibili plugin
 * WBI/player flow based on bilibili-video-downloader.
 * Only axios and Node built-ins are required.
 */
const axiosModule = require("axios");
const axios = axiosModule.default || axiosModule;
let CryptoJs = null;
let nodeCrypto = null;
try { CryptoJs = require("crypto-js"); } catch (_) {}
try { nodeCrypto = require("crypto"); } catch (_) {}
const { Buffer } = require("buffer");

const API_BASE = "https://api.bilibili.com";
const PAGE_SIZE = 20;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const REFERER = "https://www.bilibili.com/";
const AUDIO_QUALITY = { low: 30216, medium: 30232, high: 30280, dolby: 30250, hires: 30251 };
const QUALITY_ID = { "64k": 30216, "96k": 30216, "128k": 30216, "132k": 30232, "192k": 30232, "320k": 30280 };
const QUALITY_LABEL = { 30216: "128k", 30232: "192k", 30280: "320k" };
const WBI_MIXIN_TABLE = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
const HTTP_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: REFERER,
};
const SEARCH_HEADERS = {
  ...HTTP_HEADERS,
  Origin: "https://search.bilibili.com",
  "Sec-Fetch-Site": "same-site",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
};

let fingerprint;
let wbiKeys;
let wbiKeysAt = 0;
let biliTicket;
let biliTicketExpires = 0;
const videoViewCache = new Map();
const VIDEO_VIEW_TTL = 10 * 60 * 1000;
const VIDEO_VIEW_CACHE_LIMIT = 256;

function getUserVariables() {
  try {
    if (typeof env !== "undefined" && env && typeof env.getUserVariables === "function") {
      return env.getUserVariables() || {};
    }
  } catch (_) {}
  return {};
}

function getCookieInput() {
  const vars = getUserVariables();
  // Keep all aliases instead of selecting the first non-empty field.  The
  // settings panel may retain an old BILI_COOKIE while the user has just
  // entered a fresh SESSDATA; selecting only one of them silently drops the
  // login cookie and makes premium DASH tracks look unavailable.
  return [
    vars.BILI_COOKIE, vars.bili_cookie, vars.BILI_CK, vars.bili_ck,
    vars.CK, vars.ck, vars.COOKIE, vars.cookie, vars.Cookie,
    vars.SESSDATA, vars.sessdata,
  ].filter((value) => value !== undefined && value !== null && String(value).trim()).join("; ");
}

function parseCookieString(value) {
  const jar = {};
  String(value || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key && val) jar[key] = val;
  });
  return jar;
}

function getUserCookieJar() {
  const raw = String(getCookieInput() || "").trim();
  if (!raw) return {};
  // A raw SESSDATA token may contain a trailing `=` (base64 padding), so
  // detect cookie assignments by their key shape rather than any equals sign.
  return /(?:^|;\s*)[A-Za-z_][\w-]*\s*=/.test(raw)
    ? parseCookieString(raw)
    : { SESSDATA: raw };
}

function hasLoginCookie() {
  const jar = getUserCookieJar();
  return Boolean(jar.SESSDATA || jar.DedeUserID || jar.bili_jct || jar.CSRFKEY);
}

async function loadFingerprint() {
  if (fingerprint && (fingerprint.b_3 || fingerprint.b_4)) return fingerprint;
  try {
    const response = await axios.get(`${API_BASE}/x/frontend/finger/spi`, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
    fingerprint = response.data?.data || {};
  } catch (_) { fingerprint = {}; }
  return fingerprint;
}

function buildCookieHeader() {
  const jar = { ...getUserCookieJar() };
  if (fingerprint?.b_3 && !jar.buvid3) jar.buvid3 = fingerprint.b_3;
  if (fingerprint?.b_4 && !jar.buvid4) jar.buvid4 = fingerprint.b_4;
  if (biliTicket && Date.now() < biliTicketExpires && !jar.bili_ticket) {
    jar.bili_ticket = biliTicket;
    jar.bili_ticket_expires = String(Math.floor(biliTicketExpires / 1000));
  }
  return Object.keys(jar).filter((key) => jar[key] !== undefined && jar[key] !== "").map((key) => `${key}=${jar[key]}`).join("; ");
}

function cookieValue(name) { return getUserCookieJar()[name] || ""; }
function csrfToken() { return cookieValue("bili_jct") || cookieValue("csrf"); }
function normalizeImage(url) {
  if (!url) return "";
  const value = String(url).trim();
  if (value.startsWith("//")) return `https:${value}`;
  return value.replace(/^http:\/\//i, "https://");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<em[^>]*>/gi, "").replace(/<\/em>/gi, "")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (raw, code) => {
      const radix = String(code).toLowerCase().startsWith("x") ? 16 : 10;
      const number = parseInt(String(code).replace(/^x/i, ""), radix);
      return Number.isFinite(number) ? String.fromCodePoint(number) : raw;
    })
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'");
}

function durationToSec(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.round(Number(value));
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let size = value, index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(1)}${units[index]}`;
}

function formatDate(timestamp) {
  const number = Number(timestamp);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const date = new Date(number < 10000000000 ? number * 1000 : number);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function getMixinKey(value) { return WBI_MIXIN_TABLE.map((index) => String(value || "").charAt(index)).join("").slice(0, 32); }
function encodeWbi(value) { return encodeURIComponent(String(value)).replace(/[!'()*]/g, ""); }
function parseQueryString(query) {
  const params = {};
  String(query || "").split("&").forEach((pair) => {
    if (!pair) return;
    const index = pair.indexOf("=");
    const key = index >= 0 ? pair.slice(0, index) : pair;
    const value = index >= 0 ? pair.slice(index + 1) : "";
    try { params[decodeURIComponent(key)] = decodeURIComponent(value); } catch (_) { params[key] = value; }
  });
  return params;
}

function md5Hex(value) {
  if (CryptoJs?.MD5) return CryptoJs.MD5(String(value)).toString(CryptoJs.enc?.Hex);
  if (nodeCrypto?.createHash) return nodeCrypto.createHash("md5").update(String(value)).digest("hex");
  throw new Error("MD5 provider is missing");
}

function hmacSha256Hex(key, value) {
  if (CryptoJs?.HmacSHA256) return CryptoJs.HmacSHA256(String(value), String(key)).toString(CryptoJs.enc?.Hex);
  if (nodeCrypto?.createHmac) return nodeCrypto.createHmac("sha256", String(key)).update(String(value)).digest("hex");
  throw new Error("HMAC-SHA256 provider is missing");
}

function signWbi(params, imgKey, subKey) {
  const values = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(values).sort()
    .filter((key) => values[key] !== undefined && values[key] !== null && values[key] !== "")
    .map((key) => `${encodeWbi(key)}=${encodeWbi(String(values[key]).replace(/[!'()*]/g, ""))}`).join("&");
  const wRid = md5Hex(query + getMixinKey(`${imgKey}${subKey}`));
  return { ...values, w_rid: wRid };
}

function fileStem(url) {
  const match = String(url || "").match(/\/([^/?#]+?)(?:\.[^./?#]+)?(?:[?#].*)?$/);
  return match ? match[1] : "";
}

async function getBiliTicket() {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256Hex("XgwSnGZ1p", `ts${ts}`);
  try {
    const response = await axios.post(`${API_BASE}/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket`, null, {
      params: { key_id: "ec02", hexsign, "context[ts]": ts, csrf: csrfToken() }, headers: HTTP_HEADERS, timeout: 10000,
    });
    const data = response.data?.data || {};
    if (data.ticket) {
      biliTicket = data.ticket;
      const created = Number(data.created_at || ts) * 1000;
      biliTicketExpires = created + Math.max(3600, Number(data.ttl || 259200) - 3600) * 1000;
    }
    return data;
  } catch (_) { return {}; }
}

async function getWbiKeys(force = false) {
  if (!force && wbiKeys && Date.now() - wbiKeysAt < 12 * 60 * 60 * 1000) return wbiKeys;
  const nav = await rawApiGet("/x/web-interface/nav", {}, { useCookie: true });
  const navData = nav?.data;
  let imgUrl = navData?.wbi_img?.img_url;
  let subUrl = navData?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) {
    const ticket = await getBiliTicket();
    imgUrl = imgUrl || ticket.nav?.wbi_img?.img_url || ticket.nav?.img;
    subUrl = subUrl || ticket.nav?.wbi_img?.sub_url || ticket.nav?.sub;
  }
  const img = fileStem(imgUrl), sub = fileStem(subUrl);
  if (img && sub) { wbiKeys = { img, sub }; wbiKeysAt = Date.now(); }
  return wbiKeys || { img: "", sub: "" };
}

async function rawApiGet(path, params = {}, options = {}) {
  const requestParams = { ...params };
  let headers = { ...HTTP_HEADERS, ...(options.headers || {}) };
  if (options.useCookie !== false) {
    await loadFingerprint();
    const cookie = buildCookieHeader();
    if (cookie) headers.Cookie = cookie;
  }
  if (options.wbi) {
    const keys = await getWbiKeys();
    Object.assign(requestParams, signWbi(requestParams, keys.img, keys.sub));
  }
  try {
    const response = await axios.get(path.startsWith("http") ? path : `${API_BASE}${path}`, {
      params: requestParams, headers, timeout: options.timeout || 20000, validateStatus: () => true,
    });
    return response.data;
  } catch (error) {
    if (options.throwOnError === false) return null;
    throw error;
  }
}

async function apiGet(path, params = {}, options = {}) {
  const body = await rawApiGet(path, params, options);
  if (!body || (body.code !== undefined && body.code !== 0)) {
    const error = new Error(`Bilibili API error: ${body && (body.message || body.msg || body.code)}`);
    error.response = body;
    throw error;
  }
  return body;
}

async function getVideoView(identifier) {
  const params = {};
  const bvid = identifier && (identifier.bvid || (typeof identifier === "string" && /^BV/i.test(identifier) ? identifier : ""));
  const aid = identifier && (identifier.aid || (typeof identifier === "number" || /^\d+$/.test(String(identifier || "")) ? identifier : ""));
  if (bvid) params.bvid = bvid;
  else if (aid) params.aid = aid;
  else throw new Error("A BVID or AID is required");
  const cacheKey = bvid ? `bvid:${String(bvid).toUpperCase()}` : `aid:${String(aid)}`;
  const cached = videoViewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) videoViewCache.delete(cacheKey);
  const body = await apiGet("/x/web-interface/view", params, { useCookie: true });
  if (!body.data) throw new Error("Video metadata is empty");
  if (videoViewCache.size >= VIDEO_VIEW_CACHE_LIMIT) {
    const firstKey = videoViewCache.keys().next().value;
    if (firstKey) videoViewCache.delete(firstKey);
  }
  videoViewCache.set(cacheKey, { value: body.data, expiresAt: Date.now() + VIDEO_VIEW_TTL });
  return body.data;
}

async function getCid(bvid, aid) { return getVideoView({ bvid, aid }); }

async function getPlayurlData(bvid, aid, cid) {
  const params = { ...(bvid ? { bvid } : { aid }), cid: Number(cid), qn: 127, fnval: 4048, fnver: 0, fourk: 1 };
  let body = null;
  try { body = await rawApiGet("/x/player/wbi/playurl", params, { wbi: true, useCookie: true }); } catch (_) { body = null; }
  const hasMedia = (value) => value && value.code === 0 && value.data && (value.data.dash || value.data.durl);
  const hasPremiumAudio = (value) => {
    const dash = value?.data?.dash;
    return Boolean(dash?.flac?.audio || dash?.dolby?.audio);
  };
  // Some WBI responses contain only the three standard audio tracks even with
  // a valid cookie. Query the legacy player endpoint as a capability fallback;
  // it still honours SESSDATA and often exposes FLAC/Dolby/Hi-Res.
  if (!hasMedia(body) || !hasPremiumAudio(body)) {
    try {
      const legacy = await rawApiGet("/x/player/playurl", params, { useCookie: true });
      if (hasMedia(legacy) && (!hasMedia(body) || hasPremiumAudio(legacy))) body = legacy;
    } catch (_) {}
  }
  if (!hasMedia(body)) throw new Error(`Playback metadata request failed: ${body && (body.message || body.msg || body.code) || "empty response"}`);
  return body;
}

async function getProgressiveVideoData(bvid, aid, cid, videoQuality) {
  const wanted = String(videoQuality || "1080p").toLowerCase().replace(/\s+/g, "");
  const qn = VIDEO_QUALITY_ID[wanted] || Number(wanted.replace(/p$/, "")) || 80;
  const params = {
    ...(bvid ? { bvid } : { aid }),
    cid: Number(cid),
    qn,
    fnval: 0,
    fnver: 0,
    fourk: 1,
  };
  let body = null;
  const hasSingleFile = (value) => value?.code === 0
    && asArray(value.data?.durl).filter((entry) => mediaUrl(entry)).length === 1;
  try { body = await rawApiGet("/x/player/wbi/playurl", params, { wbi: true, useCookie: true }); } catch (_) { body = null; }
  if (!hasSingleFile(body)) {
    try { body = await rawApiGet("/x/player/playurl", params, { useCookie: true }); } catch (_) { body = null; }
  }
  return hasSingleFile(body)
    ? { ...body, data: { ...body.data, dash: undefined } }
    : null;
}

function mediaUrl(media) { return media && (media.baseUrl || media.base_url || media.url || media.play_url || ""); }
function mediaSize(media, duration) {
  if (media && Number(media.size) > 0) return formatFileSize(media.size);
  if (media && Number(media.bandwidth) > 0 && Number(duration) > 0) return formatFileSize(Number(media.bandwidth) * Number(duration) / 8);
  return undefined;
}
function asArray(value) { return !value ? [] : Array.isArray(value) ? value : [value]; }

function collectQualities(playData) {
  const dash = playData?.dash;
  const qualities = {}, videoQualities = [];
  if (!dash) return { qualities: { "128k": {} }, videoQualities };
  const duration = Number(dash.duration || (playData.timelength && playData.timelength / 1000) || 0);
  asArray(dash.audio).forEach((audio) => {
    const id = Number(audio.id);
    const label = QUALITY_LABEL[id] || (Number(audio.bandwidth) >= 180000 ? "320k" : Number(audio.bandwidth) >= 100000 ? "192k" : "128k");
    qualities[label] = { size: mediaSize(audio, duration), bitrate: Number(audio.bandwidth) || undefined, id };
  });
  const flac = asArray(dash.flac?.audio)[0];
  if (flac) {
    const flacId = Number(flac.id) || AUDIO_QUALITY.hires;
    const entry = { size: mediaSize(flac, duration), bitrate: Number(flac.bandwidth) || undefined, id: flacId };
    // `dash.flac` is the 30251 Hi-Res stream on Bilibili.  Expose exactly one
    // quality key for it; publishing flac + flac24bit + hires here makes the
    // player display the same URL three times.  Keep a generic FLAC label only
    // for a future non-30251 stream returned by the API.
    qualities[flacId === AUDIO_QUALITY.hires ? "hires" : "flac"] = entry;
  }
  const dolby = asArray(dash.dolby?.audio)[0];
  if (dolby) qualities.dolby = { size: mediaSize(dolby, duration), bitrate: Number(dolby.bandwidth) || undefined, id: Number(dolby.id) || AUDIO_QUALITY.dolby };
  asArray(dash.video).forEach((video) => {
    if (!video || video.id === undefined) return;
    videoQualities.push({
      id: Number(video.id), quality: Number(video.id), codec: video.codecs || video.codec || "",
      width: Number(video.width) || undefined, height: Number(video.height) || undefined,
      bitrate: Number(video.bandwidth) || undefined, size: mediaSize(video, duration),
    });
  });
  if (!Object.keys(qualities).length) qualities["128k"] = {};
  return { qualities, videoQualities };
}

function pickAudio(playData, requestedQuality) {
  const dash = playData?.dash;
  if (!dash) return asArray(playData?.durl)[0] || null;
  const wanted = String(requestedQuality || "320k").toLowerCase();
  if (wanted === "dolby") {
    const dolby = asArray(dash.dolby?.audio);
    if (dolby.length) return dolby[0];
    const flac = asArray(dash.flac?.audio);
    if (flac.length) return flac[0];
  }
  if (wanted === "flac" || wanted === "flac24bit" || wanted === "hires" || wanted === "lossless") {
    const flac = asArray(dash.flac?.audio);
    if (flac.length) return flac[0];
  }
  const audios = asArray(dash.audio).filter((audio) => mediaUrl(audio));
  if (!audios.length) return asArray(dash.dolby?.audio)[0] || asArray(dash.flac?.audio)[0] || asArray(playData.durl)[0] || null;
  audios.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  const target = QUALITY_ID[wanted] || AUDIO_QUALITY.high;
  return audios.find((audio) => Number(audio.id) === target) || audios.filter((audio) => Number(audio.id) <= target).pop() || audios[0] || null;
}

function resolvedAudioQuality(playData, media) {
  const id = Number(media?.id);
  if (id === AUDIO_QUALITY.dolby) return "dolby";
  if (id === AUDIO_QUALITY.hires) return "hires";
  if (QUALITY_LABEL[id]) return QUALITY_LABEL[id];
  const dash = playData?.dash;
  const mediaUrlValue = mediaUrl(media);
  if (mediaUrlValue && asArray(dash?.dolby?.audio).some((item) => mediaUrl(item) === mediaUrlValue)) return "dolby";
  if (mediaUrlValue && asArray(dash?.flac?.audio).some((item) => mediaUrl(item) === mediaUrlValue)) return "hires";
  const bitrate = Number(media?.bandwidth);
  if (bitrate >= 180000) return "320k";
  if (bitrate >= 100000) return "192k";
  if (bitrate > 0) return "128k";
  return "128k";
}

const VIDEO_QUALITY_ID = {
  "360p": 16, "480p": 32, "720p": 64, "720p60": 74,
  "1080p": 80, "1080p+": 112, "1080p60": 116, "4k": 120,
  "hdr": 125, "dolby_vision": 126, "8k": 127,
};
const VIDEO_QUALITY_LABEL = {
  16: "360p", 32: "480p", 64: "720p", 74: "720p60", 80: "1080p",
  112: "1080p+", 116: "1080p60", 120: "4k", 125: "hdr", 126: "dolby_vision", 127: "8k",
};

function pickVideo(playData, requestedQuality = "1080p") {
  const videos = asArray(playData?.dash?.video).filter((video) => mediaUrl(video));
  if (!videos.length) return asArray(playData?.durl)[0] || null;
  const wanted = String(requestedQuality).toLowerCase().replace(/\s+/g, "");
  const target = VIDEO_QUALITY_ID[wanted] || Number(wanted.replace(/p$/, "")) || 80;
  const ordered = videos.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  return ordered.find((video) => Number(video.id) === target)
    || ordered.filter((video) => Number(video.id) <= target).pop()
    || ordered[0];
}

function getMediaHeaders(musicItem) {
  const id = musicItem?.bvid || musicItem?.aid || musicItem?.id || "";
  const headers = {
    "User-Agent": USER_AGENT, Accept: "*/*", Referer: id ? `${REFERER}video/${id}` : REFERER,
    Origin: "https://www.bilibili.com", "Accept-Encoding": "identity",
  };
  const cookie = buildCookieHeader();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function formatMedia(result = {}) {
  const owner = result.owner || result.upper || {};
  const title = decodeHtml(result.title || result.part || result.name || "");
  const mid = owner.mid || result.mid || result.author_mid;
  const artist = result.artist || result.author || owner.name || "";
  const singerList = mid || artist ? [{ id: mid, name: artist, avatar: normalizeImage(owner.face || result.face) }] : [];
  const bvid = result.bvid || result.bv_id;
  const aid = result.aid || result.id;
  const cid = result.cid;
  const artwork = normalizeImage(result.pic || result.cover || result.arcurl || result.upic);
  const item = {
    id: cid || bvid || aid, aid, bvid, cid, title, artist, singerList, album: bvid || aid,
    // BakaMusic accepts artwork; coverImg is kept in sync because the music
    // bar and immersive background prefer that field when both are present.
    artwork, coverImg: artwork,
    duration: durationToSec(result.duration !== undefined ? result.duration : result.length),
    tags: Array.isArray(result.tag) ? result.tag : (typeof result.tag === "string" ? result.tag.split(",").filter(Boolean) : []),
    date: formatDate(result.pubdate || result.created),
    // Search/view responses do not carry DASH capability information.  An
    // empty map deliberately lets BakaMusic call getMusicInfo(), instead of
    // treating synthetic 128/192/320 entries as the complete quality list
    // and hiding premium tracks from the quality picker.
    qualities: result.qualities || {},
  };
  if (result.videoQualities) item.videoQualities = result.videoQualities;
  if (result.description || result.desc) item.description = result.description || result.desc;
  return item;
}

async function getMusicInfo(musicBase = {}) {
  const bvid = musicBase.bvid || (typeof musicBase.id === "string" && /^BV/i.test(musicBase.id) ? musicBase.id : "");
  const aid = musicBase.aid || (!bvid && /^\d+$/.test(String(musicBase.id || "")) ? musicBase.id : "");
  if (!bvid && !aid) return null;
  const hasRealQualities = musicBase.qualities && Object.values(musicBase.qualities).some((entry) => entry && Object.keys(entry).length > 0);
  // Never reuse a pre-login quality snapshot.  Search results and items
  // cached before SESSDATA was entered commonly contain only 128/192/320K;
  // refreshing the player metadata after login is what reveals FLAC/Hi-Res
  // and Dolby tracks.
  if (musicBase.artwork && hasRealQualities && !hasLoginCookie()) {
    return { ...musicBase, bvid, aid, platform: "bilibili" };
  }
  try {
    const video = await getVideoView({ bvid, aid });
    const page = video.pages?.[0];
    const cid = musicBase.cid || page?.cid || video.cid;
    let playback = null;
    try { playback = await getPlayurlData(video.bvid, video.aid, cid); } catch (_) {}
    const metadata = collectQualities(playback?.data);
    const item = formatMedia({ ...video, cid, qualities: metadata.qualities, videoQualities: metadata.videoQualities });
    item.platform = "bilibili";
    item.duration = durationToSec(video.duration);
    item.pages = (video.pages || []).map((part) => ({ cid: part.cid, title: part.part, duration: durationToSec(part.duration) }));
    return item;
  } catch (error) {
    console.error(`[bilibili] getMusicInfo: ${error.message}`);
    return null;
  }
}

async function getMediaSource(musicItem = {}, quality = "320k") {
  const bvid = musicItem.bvid || (typeof musicItem.id === "string" && /^BV/i.test(musicItem.id) ? musicItem.id : "");
  const aid = musicItem.aid || (!bvid && /^\d+$/.test(String(musicItem.id || "")) ? musicItem.id : "");
  if (!bvid && !aid) throw new Error("A BVID or AID is required for playback");
  // Let BakaMusic's quality fallback order handle quality levels that
  // Bilibili does not expose.  Returning a 320K URL for an unsupported
  // request (for example `master`, `atmos` or `atmos_plus`) makes the host
  // believe the requested level succeeded and stops the fallback chain.
  const requestedQuality = String(quality || "320k").trim().toLowerCase();
  const supportedQuality = new Set(["128k", "192k", "320k", "flac", "flac24bit", "hires", "lossless", "dolby"]);
  if (!supportedQuality.has(requestedQuality)) {
    throw new Error(`Unsupported Bilibili audio quality: ${requestedQuality}`);
  }
  // Search results already carry cid on some endpoints; imported/detail
  // items may keep it under pages or _bilibiliData. Reuse it before issuing a
  // view request so playing the same search result does not refetch metadata.
  let cid = musicItem.cid || musicItem._bilibiliData?.cid || musicItem.pages?.[0]?.cid;
  if (!cid) {
    const view = await getVideoView({ bvid, aid });
    cid = view.cid || view.pages?.[0]?.cid;
  }
  const response = await getPlayurlData(bvid, aid, cid);
  const selected = pickAudio(response.data, requestedQuality);
  const url = mediaUrl(selected);
  if (!url) throw new Error("No playable audio URL returned");
  const backup = selected && (selected.backupUrl || selected.backup_url || selected.backup_url_list || []);
  return {
    // BakaMusic treats this field as an IQualityKey and calls `.trim()` on
    // it while building download names.  Returning Bilibili's numeric stream
    // id (30280, 30251, …) makes downloads fail and also reports Master even
    // when the actual fallback stream is 320K.
    url, headers: getMediaHeaders({ ...musicItem, bvid, aid }), quality: resolvedAudioQuality(response.data, selected),
    duration: Number(response.data?.timelength) > 0 ? Math.round(response.data.timelength / 1000) : undefined,
    backupUrl: Array.isArray(backup) ? backup.slice(0, 2) : [],
  };
}

async function getMvSource(musicItem = {}, videoQuality = "1080p") {
  const bvid = musicItem.bvid || (typeof musicItem.id === "string" && /^BV/i.test(musicItem.id) ? musicItem.id : "");
  const aid = musicItem.aid || (!bvid && /^\d+$/.test(String(musicItem.id || "")) ? musicItem.id : "");
  if (!bvid && !aid) return null;
  let cid = musicItem.cid || musicItem._bilibiliData?.cid || musicItem.pages?.[0]?.cid;
  if (!cid) {
    const view = await getVideoView({ bvid, aid });
    cid = view.cid || view.pages?.[0]?.cid;
  }
  // Progressive MP4 contains both video and audio. Prefer it so playback,
  // volume control and downloads operate on one complete media file.
  const response = await getProgressiveVideoData(bvid, aid, cid, videoQuality)
    || await getPlayurlData(bvid, aid, cid);
  const selected = pickVideo(response.data, videoQuality);
  const url = mediaUrl(selected);
  if (!url) return null;
  const actualId = Number(selected?.id)
    || Number(response.data?.quality)
    || VIDEO_QUALITY_ID[String(videoQuality).toLowerCase()]
    || 80;
  const backup = selected?.backupUrl || selected?.backup_url || [];
  return {
    url,
    headers: getMediaHeaders({ ...musicItem, bvid, aid }),
    userAgent: USER_AGENT,
    videoQuality: VIDEO_QUALITY_LABEL[actualId] || `${actualId}q`,
    mimeType: selected?.mimeType || "video/mp4",
    duration: Number(response.data?.timelength) > 0 ? Math.round(response.data.timelength / 1000) : undefined,
    width: Number(selected?.width) || undefined,
    height: Number(selected?.height) || undefined,
    codec: selected?.codecs || selected?.codec || undefined,
    backupUrl: Array.isArray(backup) ? backup.slice(0, 2) : [],
  };
}

async function searchBase(keyword, page, searchType = "video") {
  await loadFingerprint();
  const params = {
    context: "", page: Number(page) || 1, order: "", page_size: PAGE_SIZE, keyword: String(keyword || ""),
    duration: "", tids_1: "", tids_2: "", __refresh__: true, _extra: "", highlight: 1,
    single_column: 0, platform: "pc", from_source: "", search_type: searchType, dynamic_offset: 0,
  };
  let body = await rawApiGet("/x/web-interface/search/type", params, { headers: SEARCH_HEADERS, useCookie: true });
  if (!body || body.code !== 0 || !body.data) {
    body = await rawApiGet("/x/web-interface/search/all/v2", { keyword: keyword || "", page: page || 1, page_size: PAGE_SIZE }, { headers: SEARCH_HEADERS, useCookie: true });
  }
  return body?.data || {};
}

function pageEnd(data, page) {
  const total = Number(data && (data.numResults || data.num_results || data.total));
  return total > 0 ? Number(page || 1) * PAGE_SIZE >= total : true;
}

async function searchVideos(keyword, page) {
  const resultData = await searchBase(keyword, page, "video");
  let list = resultData.result || resultData.items || resultData.video || [];
  if (!Array.isArray(list) && Array.isArray(resultData.result)) list = resultData.result;
  // search/all/v2 groups results by result_type.
  if (Array.isArray(list) && list.length && list[0]?.data) list = list.find((group) => group.result_type === "video")?.data || [];
  return { isEnd: pageEnd(resultData, page) || list.length < PAGE_SIZE, data: list.map(formatMedia) };
}

async function searchArtists(keyword, page) {
  const resultData = await searchBase(keyword, page, "bili_user");
  let list = resultData.result || resultData.items || [];
  if (Array.isArray(list) && list.length && list[0]?.data) list = list.find((group) => group.result_type === "bili_user" || group.result_type === "user")?.data || [];
  return {
    isEnd: pageEnd(resultData, page) || list.length < PAGE_SIZE,
    data: list.map((result) => ({
      id: result.mid, name: decodeHtml(result.uname || result.name), fans: Number(result.fans) || undefined,
      description: result.usign || result.sign, avatar: normalizeImage(result.upic || result.face), worksNum: Number(result.videos) || undefined,
    })),
  };
}

async function getCookieMid() {
  const value = cookieValue("DedeUserID");
  if (value && /^\d+$/.test(value)) return value;
  try {
    const nav = await rawApiGet("/x/web-interface/nav", {}, { useCookie: true });
    const mid = nav?.data?.mid;
    return mid && /^\d+$/.test(String(mid)) ? String(mid) : "";
  } catch (_) { return ""; }
}

async function getFavoriteFolders(mid) {
  const userMid = mid || await getCookieMid();
  if (!userMid) return [];
  const body = await rawApiGet("/x/v3/fav/folder/created/list", { up_mid: userMid, ps: 50, pn: 1 }, { useCookie: true });
  const list = body?.data?.list || body?.data?.folders;
  return Array.isArray(list) ? list : [];
}

async function searchSheets(keyword, page) {
  const folders = await getFavoriteFolders();
  const query = String(keyword || "").toLowerCase();
  const matched = folders.filter((folder) => !query || String(folder.title || "").toLowerCase().includes(query));
  if (matched.length) {
    const start = ((Number(page) || 1) - 1) * PAGE_SIZE;
    return {
      isEnd: start + PAGE_SIZE >= matched.length,
      data: matched.slice(start, start + PAGE_SIZE).map((folder) => ({
        id: String(folder.id || folder.fid), title: folder.title || "", artwork: normalizeImage(folder.cover),
        description: folder.intro || "", worksNum: Number(folder.media_count || folder.cnt) || 0,
        artist: folder.upper?.name || "", _bilibiliType: "favorite",
      })),
    };
  }
  const videos = await searchVideos(keyword, page);
  return { isEnd: videos.isEnd, data: videos.data.map((item) => ({ ...item, id: item.bvid || item.aid, worksNum: 1, _bilibiliType: "video" })) };
}

function randomDmString() {
  return Buffer.from(Array.from({ length: 36 }, () => Math.floor(32 + Math.random() * 96))).toString("base64").replace(/=+$/, "");
}

async function getArtistWorks(artistItem = {}, page = 1, type = "music") {
  const mid = String(artistItem.id || artistItem.mid || "");
  if (!mid || (type && type !== "music" && type !== "album")) return { isEnd: true, data: [] };
  const params = {
    mid, pn: String(page || 1), ps: "30", index: "1", order: "pubdate", order_avoided: "true",
    platform: "web", web_location: "333.1387", dm_img_list: "[]", dm_img_str: randomDmString(),
    dm_cover_img_str: randomDmString(), dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
  };
  try {
    const body = await apiGet("/x/space/wbi/arc/search", params, { wbi: true, useCookie: true, timeout: 25000 });
    const list = body.data?.list?.vlist || [];
    const pageInfo = body.data?.page || {};
    return {
      isEnd: list.length < Number(pageInfo.ps || 30) || Number(pageInfo.pn || page) * Number(pageInfo.ps || 30) >= Number(pageInfo.count || 0),
      data: list.map(formatMedia),
    };
  } catch (error) {
    console.error(`[bilibili] getArtistWorks: ${error.message}`);
    return { isEnd: true, data: [] };
  }
}

async function getFavoriteList(id, page = 1, all = false) {
  const result = [];
  let info = null, hasMore = false, pn = Number(page) || 1;
  const maxPages = all ? 100 : 1;
  for (let count = 0; count < maxPages; count += 1) {
    const body = await rawApiGet("/x/v3/fav/resource/list", { media_id: id, platform: "web", ps: 36, pn }, { useCookie: true });
    const data = body?.data;
    if (!data) break;
    info = info || data.info || null;
    if (!Array.isArray(data.medias) && data.info?.mid && count === 0) {
      // Older links expose `fid`; the resource endpoint now expects the
      // composite folder id returned by created/list.
      const folders = await getFavoriteFolders(String(data.info.mid));
      const folder = folders.find((entry) => String(entry.id) === String(id) || String(entry.fid) === String(id));
      if (folder && String(folder.id) !== String(id)) return getFavoriteList(String(folder.id), page, all);
    }
    if (!Array.isArray(data.medias)) {
      hasMore = false;
      break;
    }
    result.push(...(Array.isArray(data.medias) ? data.medias : []));
    hasMore = Boolean(data.has_more);
    if (!hasMore || !all) break;
    pn += 1;
  }
  return { info, medias: result, hasMore };
}

function favoriteMediaToItem(media) {
  const item = formatMedia({ ...media, pic: media.cover, owner: media.upper, aid: media.aid, bvid: media.bvid });
  item.id = media.cid || media.bvid || media.aid || media.id;
  item.album = media.bvid || media.aid;
  return item;
}

function extractFavoriteId(value) {
  const input = String(value || "").trim();
  if (/^\d+$/.test(input)) return input;
  const patterns = [/[?&](?:fid|media_id)=(\d+)/i, /\/(?:ml|pl)(\d+)/i, /\/fav(?:list|folder|resource)\/(\d+)/i, /bilibili\.com\/medialist\/detail\/ml(\d+)/i];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return "";
}

async function importMusicSheet(urlLike) {
  const text = String(urlLike || "").trim();
  const bvid = (text.match(/\b(BV[a-zA-Z0-9]{10})\b/) || [])[1];
  if (bvid) {
    const view = await getVideoView({ bvid });
    const pages = view.pages || [{ cid: view.cid, part: view.title, duration: view.duration }];
    return {
      id: bvid, title: decodeHtml(view.title), artwork: normalizeImage(view.pic), artist: view.owner?.name || "",
      description: view.desc || "", worksNum: pages.length,
      musicList: pages.map((part) => formatMedia({ ...view, cid: part.cid, title: part.part || view.title, duration: part.duration })),
    };
  }
  let id = extractFavoriteId(text);
  const mid = (text.match(/space\.bilibili\.com\/(\d+)/i) || [])[1];
  if (mid && id) {
    const folders = await getFavoriteFolders(mid);
    const folder = folders.find((entry) => String(entry.id) === String(id) || String(entry.fid) === String(id));
    if (folder?.id) id = String(folder.id);
  }
  if (!id) return undefined;
  const favorite = await getFavoriteList(id, 1, true);
  const musicList = favorite.medias.map(favoriteMediaToItem);
  const info = favorite.info || {};
  return {
    id: String(info.id || info.fid || id), title: info.title || "", artwork: normalizeImage(info.cover),
    artist: info.upper?.name || "", description: info.intro || "", worksNum: Number(info.media_count || info.cnt) || musicList.length,
    createAt: Number(info.ctime) > 0 ? Number(info.ctime) * 1000 : undefined, musicList,
  };
}

async function getMusicSheetInfo(sheet = {}, page = 1) {
  if (sheet._bilibiliType === "video" || /^BV/i.test(String(sheet.id || ""))) {
    if (!sheet.bvid && sheet.aid) {
      const item = await getMusicInfo({ id: sheet.aid, aid: sheet.aid, cid: sheet.cid });
      return { isEnd: true, sheetItem: sheet, musicList: item ? [item] : [] };
    }
    const detail = await importMusicSheet(String(sheet.bvid || sheet.id));
    return { isEnd: true, sheetItem: detail, musicList: detail ? detail.musicList : [] };
  }
  const id = sheet.id || sheet.fid || sheet.media_id;
  if (!id) return { isEnd: true, musicList: [] };
  const favorite = await getFavoriteList(id, page, false);
  const musicList = favorite.medias.map(favoriteMediaToItem);
  const total = Number(favorite.info?.media_count || favorite.info?.cnt || 0);
  return {
    isEnd: !favorite.hasMore,
    sheetItem: favorite.info ? {
      ...sheet, id: String(favorite.info.id || id), title: favorite.info.title || sheet.title || "",
      artwork: normalizeImage(favorite.info.cover || sheet.artwork), description: favorite.info.intro || sheet.description || "",
      worksNum: total || sheet.worksNum || musicList.length,
    } : sheet,
    musicList,
  };
}

async function getAlbumInfo(albumItem = {}) {
  const video = await getVideoView(albumItem.bvid || albumItem.aid || albumItem.id);
  const pages = video.pages || [{ cid: video.cid, part: video.title, duration: video.duration }];
  return {
    albumItem: formatMedia(video),
    musicList: pages.map((part) => formatMedia({ ...video, cid: part.cid, title: part.part || video.title, duration: part.duration })),
  };
}

const BOARD_KEYS = [
  [0,"全站"],[3,"音乐"],[1,"动画"],[119,"鬼畜"],[168,"国创相关"],[129,"舞蹈"],[4,"游戏"],[36,"知识"],
  [188,"科技"],[234,"运动"],[223,"汽车"],[160,"生活"],[211,"美食"],[217,"动物圈"],[155,"时尚"],[5,"娱乐"],[181,"影视"],
];

async function getTopLists() {
  const cover = "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_rank.png";
  const weeklyCover = "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_weekly.png";
  let weekly = [];
  try {
    const body = await rawApiGet("/x/web-interface/popular/series/list", {}, { useCookie: true });
    weekly = (body?.data?.list || []).slice(0, 12).map((entry) => ({
      id: `popular/series/one?number=${entry.number}`, title: entry.subject || entry.name || `每周必看 ${entry.number}`,
      description: entry.name || "", coverImg: weeklyCover,
    }));
  } catch (_) {}
  return [
    { title: "每周必看", data: weekly },
    { title: "热门", data: [
      { id: "popular?ps=20&pn=1", title: "热门视频", coverImg: cover },
      { id: "popular/precious?page_size=100&page=1", title: "入站必刷", coverImg: cover },
    ] },
    { title: "排行榜", data: BOARD_KEYS.map(([rid, title]) => ({ id: `ranking/v2?rid=${rid}&type=all`, title, coverImg: cover })) },
  ];
}

async function getTopListDetail(topListItem = {}) {
  const rawId = String(topListItem.id || "");
  const question = rawId.indexOf("?");
  const path = question >= 0 ? rawId.slice(0, question) : rawId;
  const query = question >= 0 ? rawId.slice(question + 1) : "";
  const params = parseQueryString(query);
  const needsWbi = path.includes("ranking") || path.includes("popular/series") || path === "popular";
  let body = null;
  try { body = await rawApiGet(`/x/web-interface/${path}`, params, { wbi: needsWbi, useCookie: true }); } catch (_) { body = null; }
  if (!body || body.code !== 0) {
    try { body = await rawApiGet(`/x/web-interface/${path}`, params, { useCookie: true }); } catch (_) { body = null; }
  }
  const data = body?.data;
  const list = data?.list || data?.item || data?.archives || data?.result || [];
  return { ...topListItem, musicList: (Array.isArray(list) ? list : []).map(formatMedia) };
}

async function getRecommendSheetTags() {
  return {
    pinned: [{ id:"popular",title:"热门" },{ id:"3",title:"音乐" },{ id:"1",title:"动画" },{ id:"4",title:"游戏" },{ id:"36",title:"知识" },{ id:"188",title:"科技" }],
    data: [],
  };
}

async function getRecommendSheetsByTag(tag = {}, page = 1) {
  const rid = String(tag.id || "popular");
  const asSheets = (items) => (items || []).map((item) => ({
    id: String(item.bvid || item.aid || item.id),
    title: item.title || "",
    artist: item.artist || "",
    artwork: item.artwork || "",
    description: item.description || "Bilibili 视频歌单",
    worksNum: 1,
    playCount: item.playCount,
    _bilibiliType: "video",
    bvid: item.bvid,
    aid: item.aid,
    musicList: [item],
  }));
  if (rid === "popular") {
    const detail = await getTopListDetail({ id: `popular?ps=20&pn=${page || 1}`, title: "热门" });
    return { isEnd: !detail.musicList || detail.musicList.length < PAGE_SIZE, data: asSheets(detail.musicList) };
  }
  const detail = await getTopListDetail({ id: `ranking/v2?rid=${encodeURIComponent(rid)}&type=all`, title: tag.title || "排行榜" });
  return { isEnd: true, data: asSheets(detail.musicList) };
}

function formatComment(item = {}) {
  const location = item.reply_control?.location;
  return {
    id: item.rpid, nickName: item.member?.uname || "", avatar: normalizeImage(item.member?.avatar),
    comment: item.content?.message || "", like: Number(item.like) || 0,
    createAt: Number(item.ctime) > 0 ? Number(item.ctime) * 1000 : undefined,
    location: location && String(location).replace(/^IP属地：/, ""),
  };
}

async function getMusicComments(musicItem = {}, page = 1) {
  const aid = musicItem.aid || (typeof musicItem.id === "number" || /^\d+$/.test(String(musicItem.id || "")) ? musicItem.id : "");
  if (!aid) return { isEnd: true, data: [] };
  const params = {
    type: 1, mode: 3, oid: aid, plat: 1, web_location: 1315875,
    pagination_str: JSON.stringify({ offset: page > 1 ? String((page - 1) * PAGE_SIZE) : "" }),
  };
  try {
    const body = await apiGet("/x/v2/reply/wbi/main", params, { wbi: true, useCookie: true });
    const replies = body.data?.replies || [];
    const data = replies.map((reply) => {
      const comment = formatComment(reply);
      if (reply.replies?.length) comment.replies = reply.replies.map(formatComment);
      return comment;
    });
    return { isEnd: Boolean(body.data?.cursor?.is_end) || data.length < PAGE_SIZE, data };
  } catch (error) {
    console.error(`[bilibili] getMusicComments: ${error.message}`);
    return { isEnd: true, data: [] };
  }
}

function subtitleToLrc(payload) {
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (_) { return ""; }
  }
  const body = Array.isArray(payload) ? payload : payload?.body;
  if (!Array.isArray(body)) return "";
  return body.map((line) => {
    const from = Number(line.from);
    if (!Number.isFinite(from)) return "";
    const minutes = Math.floor(from / 60).toString().padStart(2, "0");
    const seconds = (from % 60).toFixed(2).padStart(5, "0");
    return `[${minutes}:${seconds}]${String(line.content || "")}`;
  }).filter(Boolean).join("\n");
}

async function getLyric(musicItem = {}) {
  const bvid = musicItem.bvid || (typeof musicItem.id === "string" && /^BV/i.test(musicItem.id) ? musicItem.id : "");
  const aid = musicItem.aid || (!bvid && /^\d+$/.test(String(musicItem.id || "")) ? musicItem.id : "");
  let cid = musicItem.cid;
  try {
    if (!cid) {
      const view = await getVideoView({ bvid, aid });
      cid = view.cid || view.pages?.[0]?.cid;
    }
    const body = await apiGet("/x/player/wbi/v2", { ...(bvid ? { bvid } : { aid }), cid }, { wbi: true, useCookie: true });
    const subtitles = body.data?.subtitle?.subtitle || body.data?.subtitle?.list || [];
    const subtitle = subtitles.find((item) => /zh|中文/i.test(item.lan || item.lan_doc || "")) || subtitles[0];
    if (!subtitle) return { rawLrc: "" };
    const url = normalizeImage(subtitle.subtitle_url || subtitle.url);
    if (!url) return { rawLrc: "" };
    const response = await axios.get(url, { headers: getMediaHeaders(musicItem), timeout: 15000 });
    return { rawLrc: subtitleToLrc(response.data), artwork: musicItem.artwork };
  } catch (error) {
    console.error(`[bilibili] getLyric: ${error.message}`);
    return { rawLrc: "", artwork: musicItem.artwork };
  }
}

function getMusicDetailPageUrl(musicItem = {}) {
  const bvid = musicItem.bvid || musicItem._bilibiliData?.bvid || (typeof musicItem.id === "string" && /^BV/i.test(musicItem.id) ? musicItem.id : "");
  if (bvid) return `https://www.bilibili.com/video/${bvid}`;
  const aid = musicItem.aid || musicItem._bilibiliData?.aid || (/^\d+$/.test(String(musicItem.id || "")) ? musicItem.id : "");
  return aid ? `https://www.bilibili.com/video/av${aid}` : "";
}

async function importMusicItem(urlLike) {
  const text = String(urlLike || "");
  const bvid = (text.match(/\b(BV[a-zA-Z0-9]{10})\b/) || [])[1];
  const aid = (text.match(/(?:av|aid[=/])([0-9]+)/i) || [])[1] || (/^\d+$/.test(text.trim()) ? text.trim() : "");
  if (!bvid && !aid) return undefined;
  return getMusicInfo({ bvid, aid, id: bvid || aid });
}

module.exports = {
  platform: "bilibili",
  author: "Toskysun",
  version: "2.0.7",
  appVersion: ">=0.1.0-alpha.0",
  srcUrl: "https://music.cwo.cc.cd/plugins/bilibili.js",
  cacheControl: "no-cache",
  primaryKey: ["id", "aid", "bvid", "cid"],
  supportedQualities: ["128k", "192k", "320k", "flac", "hires", "dolby"],
  supportedVideoQualities: ["360p", "480p", "720p", "720p60", "1080p", "1080p+", "1080p60", "4k", "hdr", "dolby_vision", "8k"],
  userVariables: [
    {
      key: "SESSDATA", name: "Bilibili Cookie / SESSDATA",
      hint: "可填写浏览器完整 Cookie，或只填写 SESSDATA；登录后会重新探测会员、杜比和 Hi-Res 音质。",
    },
    {
      key: "BILI_COOKIE", name: "Bilibili 完整 Cookie（可选）",
      hint: "优先使用此字段。支持 buvid3、bili_jct、DedeUserID 等登录字段。",
    },
    {
      key: "CK", name: "CK（Cookie 别名，可选）",
      hint: "兼容旧版客户端的 CK 字段；可填写完整浏览器 Cookie。",
    },
  ],
  hints: {
    importMusicSheet: [
      "支持收藏夹 URL、fid/media_id、/medialist/detail/ml数字，也支持直接粘贴 BV 视频链接（多分P会展开为歌单）",
      "私有收藏夹需要在用户变量中填写完整 Cookie；公开收藏夹可直接导入",
    ],
    importMusicItem: ["支持 BV/av 视频链接或直接输入 BV 号、AV 号"],
  },
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  async search(query, page = 1, type = "music") {
    if (type === "artist") return searchArtists(query, page);
    if (type === "sheet") return searchSheets(query, page);
    return searchVideos(query, page);
  },
  getMediaSource,
  getMvSource,
  getMusicInfo,
  getMusicDetailPageUrl,
  getLyric,
  getAlbumInfo,
  getArtistWorks,
  importMusicSheet,
  importMusicItem,
  getMusicSheetInfo,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getTopLists,
  getTopListDetail,
  getMusicComments,
};
