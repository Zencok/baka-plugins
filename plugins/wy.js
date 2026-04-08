// {{REQUEST_HANDLER}}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const axios_1 = require("axios");

const CryptoJs = require("crypto-js");

const qs = require("qs");

const bigInt = require("big-integer");

const dayjs = require("dayjs");

const cheerio = require("cheerio");

// eapi 加密（用于歌词接口）

const eapiKey = "e82ckenh8dichen8";

function eapiEncrypt(url, object) {
  const text = typeof object === 'object' ? JSON.stringify(object) : object;
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = CryptoJs.MD5(message).toString();
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;

  const encrypted = CryptoJs.AES.encrypt(
    CryptoJs.enc.Utf8.parse(data),
    CryptoJs.enc.Utf8.parse(eapiKey),
    {
      mode: CryptoJs.mode.ECB,
      padding: CryptoJs.pad.Pkcs7
    }
  );
  return {
    params: encrypted.ciphertext.toString(CryptoJs.enc.Hex).toUpperCase()
  };
}

function create_key() {
  var d,
    e,
    b = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    c = "";
  for (d = 0; 16 > d; d += 1)
    (e = Math.random() * b.length), (e = Math.floor(e)), (c += b.charAt(e));
  return c;
}

function AES(a, b) {
  var c = CryptoJs.enc.Utf8.parse(b),
    d = CryptoJs.enc.Utf8.parse("0102030405060708"),
    e = CryptoJs.enc.Utf8.parse(a),
    f = CryptoJs.AES.encrypt(e, c, {
      iv: d,
      mode: CryptoJs.mode.CBC,
    });
  return f.toString();
}

function Rsa(text) {
  text = text.split("").reverse().join("");
  const d = "010001";
  const e =
    "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
  const hexText = text
    .split("")
    .map((_) => _.charCodeAt(0).toString(16))
    .join("");
  const res = bigInt(hexText, 16)
    .modPow(bigInt(d, 16), bigInt(e, 16))
    .toString(16);
  return Array(256 - res.length)
    .fill("0")
    .join("")
    .concat(res);
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
  "flac": "flac",
  "flac24bit": "flac24bit",
  "hires": "hires",
  "atmos": "atmos",
  "master": "master",
};

function sizeFormate(size) {
  if (size < 1024) return size + 'B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB';
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + 'MB';
  return (size / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
}

function formatMusicItem(_) {
  var _a, _b, _c, _d;
  const album = _.al || _.album;
  const qualities = {};

  if (_.privilege) {
    const maxBr = _.privilege.maxbr || _.privilege.maxBrLevel;
    if (maxBr) {
      if (maxBr >= 128000) qualities['128k'] = { bitrate: 128000 };
      if (maxBr >= 320000) qualities['320k'] = { bitrate: 320000 };
      if (maxBr >= 999000) qualities['flac'] = { bitrate: 1411000 };
      if (maxBr >= 1999000) qualities['hires'] = { bitrate: 2304000 };
    }
  }

  if ((_.l && _.l.size) || (_.m && _.m.size && !_.h)) {
    const audioData = _.l || _.m;
    qualities['128k'] = { size: audioData.size, bitrate: audioData.br || 128000 };
  }

  if (_.h && _.h.size) {
    qualities['320k'] = { size: _.h.size, bitrate: _.h.br || 320000 };
  }

  if (_.sq && _.sq.size) {
    qualities['flac'] = { size: _.sq.size, bitrate: _.sq.br || 1411000 };
  }
  if (_.hr && _.hr.size) {
    qualities['hires'] = { size: _.hr.size, bitrate: _.hr.br || 2304000 };
  }
  if (_.jm && _.jm.size) {
    qualities['master'] = { size: _.jm.size, bitrate: _.jm.br };
  }
  if (_.je && _.je.size) {
    qualities['atmos'] = { size: _.je.size, bitrate: _.je.br };
  }

  if (Object.keys(qualities).length === 0) {
    qualities['128k'] = { bitrate: 128000 };
    qualities['320k'] = { bitrate: 320000 };
  }

  const artists = _.ar || _.artists || [];
  const singerList = artists.map(ar => ({
    id: ar.id,
    name: ar.name,
    avatar: ar.img1v1Url || ar.picUrl || "",
  }));

  return {
    id: _.id,
    artwork: album?.picUrl,
    title: _.name,
    artist: artists.map(ar => ar.name).join(', '),
    singerList: singerList,
    album: album?.name,
    albumId: album?.id,
    duration: _.dt ? Math.floor(_.dt / 1000) : (_.duration ? Math.floor(_.duration / 1000) : undefined),
    url: `https://share.duanx.cn/url/wy/${_.id}/128k`,
    qualities: qualities,
    copyrightId: _?.copyrightId,
    privilege: _.privilege,
  };
}

async function formatMusicItemWithQuality(_, qualityInfo = {}) {
  const album = _.al || _.album;
  const qualities = qualityInfo || {};

  const artists = _.ar || _.artists || [];
  const singerList = artists.map(ar => ({
    id: ar.id,
    name: ar.name,
    avatar: ar.img1v1Url || ar.picUrl || "",
  }));

  return {
    id: _.id,
    artwork: album?.picUrl,
    title: _.name,
    artist: artists.map(ar => ar.name).join(', '),
    singerList: singerList,
    album: album?.name,
    albumId: album?.id,
    duration: _.dt ? Math.floor(_.dt / 1000) : (_.duration ? Math.floor(_.duration / 1000) : undefined),
    url: `https://share.duanx.cn/url/wy/${_.id}/128k`,
    qualities: qualities,
    copyrightId: _?.copyrightId,
    privilege: _.privilege,
  };
}

function formatAlbumItem(_) {
  return {
    id: _.id,
    artist: _.artist.name,
    title: _.name,
    artwork: _.picUrl,
    description: "",
    date: dayjs.unix(_.publishTime / 1000).format("YYYY-MM-DD"),
  };
}

async function getMusicQualityInfo(id) {
  try {
    const res = await axios_1.default.get(
      `https://music.163.com/api/song/music/detail/get?songId=${id}`,
      {
        headers: {
          referer: "https://music.163.com/",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        },
      }
    );

    if (res.status !== 200 || res.data.code !== 200) return {};

    const data = res.data.data;
    const qualities = {};

    if (data.l && data.l.size) {
      qualities['128k'] = { size: sizeFormate(data.l.size), bitrate: data.l.br || 128000 };
    } else if (data.m && data.m.size) {
      qualities['128k'] = { size: sizeFormate(data.m.size), bitrate: data.m.br || 128000 };
    }
    if (data.h && data.h.size) {
      qualities['320k'] = { size: sizeFormate(data.h.size), bitrate: data.h.br || 320000 };
    }
    if (data.sq && data.sq.size) {
      qualities['flac'] = { size: sizeFormate(data.sq.size), bitrate: data.sq.br || 1411000 };
    }
    if (data.hr && data.hr.size) {
      qualities['hires'] = { size: sizeFormate(data.hr.size), bitrate: data.hr.br || 2304000 };
    }
    if (data.jm && data.jm.size) {
      qualities['master'] = { size: sizeFormate(data.jm.size), bitrate: data.jm.br || 4608000 };
    }
    if (data.je && data.je.size) {
      qualities['atmos'] = { size: sizeFormate(data.je.size), bitrate: data.je.br || 1411000 };
    }

    return qualities;
  } catch (error) {
    console.error(`[网易云] 获取音质信息异常:`, error.message);
    return {};
  }
}

async function getBatchMusicQualityInfo(idList) {
  if (!idList || idList.length === 0) return {};

  const qualityResults = await Promise.all(
    idList.map(id => getMusicQualityInfo(id).catch(() => ({})))
  );

  const qualityInfoMap = {};
  idList.forEach((id, index) => {
    qualityInfoMap[id] = qualityResults[index] || {};
  });

  return qualityInfoMap;
}

async function getValidMusicItems(trackIds) {
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
        }))
      ),
      ids: JSON.stringify(trackIds),
    };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = qs.stringify(pae);
    
    const res = (
      await axios_1.default({
        method: "post",
        url: "https://music.163.com/weapi/v3/song/detail",
        headers,
        data: paeData,
      })
    ).data;

    if (res.code !== 200 || !res.songs || !res.privileges) {
      console.error("[网易云] 获取歌曲详情失败:", res.code, res.msg);
      return [];
    }

    const songsWithPrivilege = res.songs.map((song, index) => {
      const privilege = res.privileges.find(p => p.id === song.id) || res.privileges[index];
      return { ...song, privilege };
    });

    const validMusicItems = songsWithPrivilege.map(formatMusicItem);
    const idList = validMusicItems.map(item => item.id);
    const qualityInfoMap = await getBatchMusicQualityInfo(idList);

    validMusicItems.forEach(item => {
      const qualityInfo = qualityInfoMap[item.id];
      if (qualityInfo) item.qualities = qualityInfo;
    });

    return validMusicItems;
  } catch (e) {
    console.error("[网易云] 获取歌单歌曲失败:", e);
    return [];
  }
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
  const paeData = qs.stringify(pae);
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
    await axios_1.default({
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
  const songIds = (res.result.songs || []).map(song => song.id);

  let formattedSongs = [];
  if (songIds.length > 0) {
    try {
      formattedSongs = await getValidMusicItems(songIds);
    } catch (error) {
      console.error('[网易云] 批量获取搜索歌曲详情失败:', error);
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
      worksNum: _.albumSize,
    })),
  };
}

async function searchMusicSheet(query, page) {
  const res = await searchBase(query, page, 1000);
  return {
    isEnd: res.result.playlistCount <= page * pageSize,
    data: res.result.playlists.map((_) => ({
      title: _.name,
      id: _.id,
      coverImg: _.coverImgUrl,
      artist: _.creator?.nickname,
      playCount: _.playCount,
      worksNum: _.trackCount,
    })),
  };
}

async function searchLyric(query, page) {
  const res = await searchBase(query, page, 1);
  const songIds = (res.result.songs || []).map(song => song.id);

  let formattedSongs = [];
  if (songIds.length > 0) {
    try {
      formattedSongs = await getValidMusicItems(songIds);
    } catch (error) {
      console.error('[网易云] 批量获取歌词搜索歌曲详情失败:', error);
      formattedSongs = (res.result.songs || []).map(formatMusicItem);
    }
  }

  return {
    isEnd: res.result.songCount <= page * pageSize,
    data: formattedSongs.map(item => ({ ...item, platform: "网易云音乐" })),
  };
}

function parseYrcToQrc(yrcContent) {
  if (!yrcContent) return null;

  const lines = yrcContent.trim().split('\n');
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
      qrcLines.push(`[${lineStartMs},${lineDurationMs}]${qrcWords.join('')}`);
    }
  }

  return qrcLines.length > 0 ? qrcLines.join('\n') : null;
}

// YRC 翻译/罗马音转 LRC 格式

function parseYrcTrans(yrcContent) {
  if (!yrcContent) return null;

  const lines = yrcContent.trim().split('\n');
  const lrcLines = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine.startsWith('{"')) {
      try {
        const info = JSON.parse(trimmedLine);
        if (info.t !== undefined && info.c) {
          const text = info.c.map(word => word.tx || '').join('');
          const timeMs = info.t;
          const ms = timeMs % 1000;
          const totalSec = Math.floor(timeMs / 1000);
          const min = Math.floor(totalSec / 60);
          const sec = totalSec % 60;
          const timeTag = `[${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}]`;
          lrcLines.push(`${timeTag}${text}`);
        }
      } catch (e) {
        continue;
      }
    } else if (/^\[[\d:.]+\]/.test(trimmedLine)) {
      lrcLines.push(trimmedLine);
    }
  }

  return lrcLines.length > 0 ? lrcLines.join('\n') : null;
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

async function getMediaSource(musicItem, quality) {
  try {
    if (musicItem.qualities && Object.keys(musicItem.qualities).length > 0) {
      if (!musicItem.qualities[quality]) {
        throw new Error(`该歌曲不支持 ${quality} 音质`);
      }
    }
    const qualityParam = qualityLevels[quality] || quality;
    const res = await requestMusicUrl('wy', musicItem.id, qualityParam);
    if (res.code === 200 && res.url) {
      return { url: res.url };
    } else {
      console.error(`[网易云] 获取播放链接失败: ${res.msg || '未知错误'}`);
      return null;
    }
  } catch (error) {
    console.error(`[网易云] 获取播放源错误: ${error.message}`);
    throw error;
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
      platform: '网易云音乐',
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
      await axios_1.get("http://music.163.com/api/song/detail", {
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
      console.error('[网易云] 获取音质信息失败:', e.message);
    }

    return {
      id: song.id,
      title: song.name,
      artist: artists.map(a => a.name).join(', '),
      album: album ? album.name : undefined,
      albumId: album ? album.id : undefined,
      artwork: album ? album.picUrl : undefined,
      duration: song.duration ? Math.floor(song.duration / 1000) : undefined,
      qualities: Object.keys(qualities).length > 0 ? qualities : { '128k': {}, '320k': {} },
      platform: '网易云音乐',
    };
  } catch (error) {
    console.error('[网易云] getMusicInfo 错误:', error.message);
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
    const encrypted = eapiEncrypt('/api/song/lyric/v1', eapiData);
    const result = (
      await axios_1.default({
        method: "post",
        url: "https://interface3.music.163.com/eapi/song/lyric/v1",
        headers,
        data: qs.stringify(encrypted),
      })
    ).data;

    if (result.code !== 200) {
      throw new Error('Failed to get lyrics');
    }

    let rawLrc = null;
    let translation = null;
    let romanization = null;

    if (result.yrc?.lyric) {
      rawLrc = parseYrcToQrc(result.yrc.lyric);
    }
    if (!rawLrc && result.lrc?.lyric) {
      rawLrc = normalizeColonTimeTag(result.lrc.lyric);
    }

    if (result.ytlrc?.lyric) {
      translation = parseYrcTrans(result.ytlrc.lyric);
    }
    if (!translation && result.tlyric?.lyric) {
      translation = normalizeColonTimeTag(result.tlyric.lyric);
    }

    if (result.yromalrc?.lyric) {
      romanization = parseYrcTrans(result.yromalrc.lyric);
    }
    if (!romanization && result.romalrc?.lyric) {
      romanization = normalizeColonTimeTag(result.romalrc.lyric);
    }

    return { rawLrc, translation, romanization };
  } catch (error) {
    console.error('[网易云] eapi获取歌词失败，尝试weapi:', error.message);

    const data = { id: musicItem.id, lv: -1, tv: -1, rv: -1, csrf_token: "" };
    const pae = getParamsAndEnc(JSON.stringify(data));
    const paeData = qs.stringify(pae);
    const result = (
      await axios_1.default({
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
      rawLrc: normalizeColonTimeTag(result.lrc?.lyric),
      translation: normalizeColonTimeTag(result.tlyric?.lyric),
      romanization: normalizeColonTimeTag(result.romalrc?.lyric),
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
  const paeData = qs.stringify(pae);
  const res = (
    await axios_1.default({
      method: "post",
      url: `https://interface.music.163.com/weapi/v1/album/${albumItem.id}?csrf_token=`,
      headers,
      data: paeData,
    })
  ).data;
  return {
    albumItem: { description: res.album.description },
    musicList: (res.songs || []).map(formatMusicItem),
  };
}

async function getArtistWorks(artistItem, page, type) {
  const data = { csrf_token: "" };
  const pae = getParamsAndEnc(JSON.stringify(data));
  const paeData = qs.stringify(pae);
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
      await axios_1.default({
        method: "post",
        url: `https://music.163.com/weapi/v1/artist/${artistItem.id}?csrf_token=`,
        headers,
        data: paeData,
      })
    ).data;
    return {
      isEnd: true,
      data: res.hotSongs.map(formatMusicItem),
    };
  } else if (type === "album") {
    const res = (
      await axios_1.default({
        method: "post",
        url: `https://music.163.com/weapi/artist/albums/${artistItem.id}?csrf_token=`,
        headers,
        data: paeData,
      })
    ).data;
    return {
      isEnd: true,
      data: res.hotAlbums.map(formatAlbumItem),
    };
  }
}

async function getSheetMusicById(id) {
  const headers = {
    Referer: "https://y.music.163.com/",
    Origin: "https://y.music.163.com/",
    authority: "music.163.com",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
  };
  const sheetDetail = (
    await axios_1.default.get(
      `https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`,
      {
        headers,
      }
    )
  ).data;
  const trackIds = sheetDetail.playlist.trackIds.map((_) => _.id);
  let result = [];
  let idx = 0;
  while (idx * 200 < trackIds.length) {
    const res = await getValidMusicItems(
      trackIds.slice(idx * 200, (idx + 1) * 200)
    );
    result = result.concat(res);
    ++idx;
  }
  return result;
}

async function importMusicSheet(urlLike) {
  const matchResult = urlLike.match(
    /(?:https:\/\/y\.music\.163.com\/m\/playlist\?id=([0-9]+))|(?:https?:\/\/music\.163\.com\/m\/playlist\?id=([0-9]+))|(?:https?:\/\/music\.163\.com\/playlist\/([0-9]+)\/.*)|(?:https?:\/\/music.163.com(?:\/#)?\/playlist\?id=(\d+))|(?:^\s*(\d+)\s*$)/
  );
  const id =
    matchResult[1] || matchResult[2] || matchResult[3] || matchResult[4] || matchResult[5];
  return getSheetMusicById(id);
}

async function getMusicSheetInfo(sheet, page) {
  let trackIds = sheet._trackIds;
  if (!trackIds) {
    const id = sheet.id;
    const headers = {
      Referer: "https://y.music.163.com/",
      Origin: "https://y.music.163.com/",
      authority: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
    };
    const sheetDetail = (
      await axios_1.default.get(
        `https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`,
        {
          headers,
        }
      )
    ).data;
    trackIds = sheetDetail.playlist.trackIds.map((_) => _.id);
  }
  const pageSize = 40;
  const currentPageIds = trackIds.slice((page - 1) * pageSize, page * pageSize);
  const res = await getValidMusicItems(currentPageIds);
  return {
    isEnd: trackIds.length <= page * pageSize,
    musicList: res,
    ...(page <= 1 ? { _trackIds: trackIds } : {}),
  };
}

async function getRecommendSheetTags() {
  const data = { csrf_token: "" };
  const pae = getParamsAndEnc(JSON.stringify(data));
  const paeData = qs.stringify(pae);
  const res = (
    await axios_1.default({
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
  const paeData = qs.stringify(pae);
  const res = (
    await axios_1.default({
      method: "post",
      url: "https://music.163.com/weapi/playlist/list",
      headers,
      data: paeData,
    })
  ).data;
  const playLists = res.playlists.map((_) => ({
    id: _.id,
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

async function getTopLists() {
  const res = await axios_1.default.get(
    "https://music.163.com/discover/toplist",
    {
      headers: {
        referer: "https://music.163.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
      },
    }
  );
  const $ = cheerio.load(res.data);
  const children = $(".n-minelst").children();
  const groups = [];
  let currentGroup = {};
  for (let c of children) {
    if (c.tagName == "h2") {
      if (currentGroup.title) {
        groups.push(currentGroup);
      }
      currentGroup = {};
      currentGroup.title = $(c).text();
      currentGroup.data = [];
    } else if (c.tagName === "ul") {
      let sections = $(c).children();
      currentGroup.data = sections
        .map((index, element) => {
          const ele = $(element);
          const id = ele.attr("data-res-id");
          const coverImg = ele
            .find("img")
            .attr("src")
            .replace(/(\.jpg\?).*/, ".jpg?param=800y800");
          const title = ele.find("p.name").text();
          const description = ele.find("p.s-fc4").text();
          return {
            id,
            coverImg,
            title,
            description,
          };
        })
        .toArray();
    }
  }
  if (currentGroup.title) {
    groups.push(currentGroup);
  }
  return groups;
}

async function getTopListDetail(topListItem) {
  const musicList = await getSheetMusicById(topListItem.id);
  return { ...topListItem,  musicList  };
}
// YRC 逐字歌词转 QRC 格式

async function getMusicComments(musicItem, page = 1) {
  const pageSize = 20;
  const id = 'R_SO_4_' + musicItem.id;

  try {
    const pae = getParamsAndEnc(
      JSON.stringify({
        rid: id,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        csrf_token: '',
      })
    );

    const res = await axios_1.default.post(
      `https://music.163.com/weapi/v1/resource/hotcomments/${id}`,
      qs.stringify(pae),
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
          'accept': '*/*',
          'origin': 'https://music.163.com',
          'referer': 'http://music.163.com/',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (res.status !== 200) {
      return { isEnd: true, data: [] };
    }

    const hotComments = (res.data.hotComments || []).map((item) => ({
      id: item.commentId?.toString(),
      nickName: item.user?.nickname || '',
      avatar: item.user?.avatarUrl,
      comment: item.content || '',
      like: item.likedCount,
      createAt: item.time,
      location: item.ipLocation?.location,
      replies: (item.beReplied || []).map((reply) => ({
        id: reply.beRepliedCommentId?.toString(),
        nickName: reply.user?.nickname || '',
        avatar: reply.user?.avatarUrl,
        comment: reply.content || '',
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
    console.error('[网易云] 获取热评失败:', error);
    return { isEnd: true, data: [] };
  }
}

module.exports = {
  platform: "网易云音乐",
  author: "Toskysun",
  version: "1.0.0",
  appVersion: ">0.1.0-alpha.0",
  srcUrl: UPDATE_URL,
  cacheControl: "no-store",
  primaryKey: ["id"],
  supportedQualities: ["128k", "320k", "flac", "hires", "atmos", "master"],
  hints: {
    importMusicSheet: [
      "网易云：APP点击分享，然后复制链接", 
      "默认歌单无法导入，先新建一个空白歌单复制过去再导入新歌单即可",
    ],
  },
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  async search(query, page, type) {
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
  },
  getMediaSource,
  getMusicInfo,
  getLyric,
  getAlbumInfo,
  getArtistWorks,
  importMusicSheet,
  getMusicSheetInfo,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getTopLists,
  getTopListDetail,
  getMusicComments,
};
