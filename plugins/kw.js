// {{REQUEST_HANDLER}}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const axios_1 = require("axios");

const he = require("he");

const pageSize = 30;

const BASE_SUPPORTED_QUALITIES = ["128k", "320k", "flac"];

function ensureQualities(qualities) {
  const declared = module.exports && Array.isArray(module.exports.supportedQualities)
    ? module.exports.supportedQualities
    : BASE_SUPPORTED_QUALITIES;

  const parsed = qualities && typeof qualities === "object" ? qualities : {};

  const result = {};
  for (const q of declared) {
    result[q] = parsed[q] || {};
  }

  return result;
}

function artworkShort2Long(albumpicShort) {
  var _a;
  const firstSlashOfAlbum =
    (_a =
      albumpicShort === null || albumpicShort === void 0
        ? void 0
        : albumpicShort.indexOf("/")) !== null && _a !== void 0
      ? _a
      : -1;
  return firstSlashOfAlbum !== -1
    ? `https://img4.kuwo.cn/star/albumcover/1080${albumpicShort.slice(
        firstSlashOfAlbum
      )}`
    : undefined;
}

function getPicByRid(rid) {
  return axios_1.default.get(
    `http://artistpicserver.kuwo.cn/pic.web?corp=kuwo&type=rid_pic&pictype=500&size=500&rid=${rid}`,
    { timeout: 5000 }
  )
  .then(res => /^http/.test(res.data) ? res.data : null)
  .catch(() => null);
}

function getQualityByMusicId(musicId, songName, artist) {
  return axios_1.default.get('http://search.kuwo.cn/r.s', {
    params: {
      client: 'kt',
      all: `${songName} ${artist}`,
      pn: 0,
      rn: 1,
      uid: 2574109560,
      ver: 'kwplayer_ar_8.5.4.2',
      vipver: 1,
      ft: 'music',
      cluster: 0,
      strategy: 2012,
      encoding: 'utf8',
      rformat: 'json',
      vermerge: 1,
      mobi: 1,
    },
    timeout: 5000
  })
  .then(res => {
    if (res.data && res.data.abslist && res.data.abslist.length > 0) {
      const song = res.data.abslist[0];
      if (song.N_MINFO) {
        return parseKuWoQualityInfo(song.N_MINFO);
      }
    }
    return {};
  })
  .catch(() => ({}));
}

// 解析酷我音质信息

function parseKuWoQualityInfo(nMInfo) {
  if (!nMInfo) return {};

  const qualities = {};
  const regExp = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/;

  const infoArr = nMInfo.split(';');
  for (let info of infoArr) {
    const match = info.match(regExp);
    if (match) {
      const [, level, bitrate, format, size] = match;
      const bitrateNum = parseInt(bitrate);

      switch (bitrateNum) {
        case 20900:
          qualities['master'] = {
            size: size.toUpperCase(),
            bitrate: 2304000,
            format: format
          };
          break;
        case 20501:
          qualities['atmos_plus'] = {
            size: size.toUpperCase(),
            bitrate: 1411000,
            format: format
          };
          break;
        case 20201:
          qualities['atmos'] = {
            size: size.toUpperCase(),
            bitrate: 1411000,
            format: format
          };
          break;
        case 4000:
          qualities['hires'] = {
            size: size.toUpperCase(),
            bitrate: 2304000,
            format: format
          };
          break;
        case 2000:
          qualities['flac'] = {
            size: size.toUpperCase(),
            bitrate: 1411000,
            format: format
          };
          break;
        case 320:
          qualities['320k'] = {
            size: size.toUpperCase(),
            bitrate: 320000,
            format: format
          };
          break;
        case 128:
          qualities['128k'] = {
            size: size.toUpperCase(),
            bitrate: 128000,
            format: format
          };
          break;
      }
    }
  }

  return qualities;
}

function getDurationSeconds(item) {
  const rawDuration = item?.duration ?? item?.DURATION ?? item?.songtime ?? item?.song_duration;
  if (rawDuration === undefined || rawDuration === null || rawDuration === "") {
    return undefined;
  }

  const parsedDuration = Number(rawDuration);
  return Number.isFinite(parsedDuration) ? parsedDuration : undefined;
}

function formatMusicItem(_) {
  let qualities = {};

  if (_.N_MINFO) {
    qualities = parseKuWoQualityInfo(_.N_MINFO);
  }

  qualities = ensureQualities(qualities);

  const singerList = _.ARTISTID ? [{
    id: _.ARTISTID,
    name: he.decode(_.ARTIST || ""),
    avatar: artworkShort2Long(_.web_artistpic_short) || "",
  }] : [];

  return {
    id: _.MUSICRID.replace("MUSIC_", ""),
    artwork: artworkShort2Long(_.web_albumpic_short),
    title: he.decode(_.NAME || ""),
    artist: he.decode(_.ARTIST || ""),
    singerList: singerList,
    album: he.decode(_.ALBUM || ""),
    albumId: _.ALBUMID,
    artistId: _.ARTISTID,
    formats: _.FORMATS,
    duration: _.DURATION ? Number(_.DURATION) : undefined,
    qualities: ensureQualities(qualities),
    nMInfo: _.N_MINFO,
  };
}

function formatAlbumItem(_) {
  var _a;
  return {
    id: _.albumid,
    artist: he.decode(_.artist || ""),
    title: he.decode(_.name || ""),
    artwork:
      (_a = _.img) !== null && _a !== void 0 ? _a : artworkShort2Long(_.pic),
    description: he.decode(_.info || ""),
    date: _.pub,
    artistId: _.artistid,
  };
}

function formatArtistItem(_) {
  return {
    id: _.ARTISTID,
    avatar: _.hts_PICPATH,
    name: he.decode(_.ARTIST || ""),
    artistId: _.ARTISTID,
    description: he.decode(_.desc || ""),
    worksNum: _.SONGNUM,
  };
}

function formatMusicSheet(_) {
  return {
    id: _.playlistid,
    title: he.decode(_.name || ""),
    artist: he.decode(_.nickname || ""),
    artwork: _.pic,
    playCount: _.playcnt,
    description: he.decode(_.intro || ""),
    worksNum: _.songnum,
  };
}

function sortLrcArr(arr) {
  const lrcSet = new Set();
  const lrc = [];
  const lrcT = [];

  for (const item of arr) {
    if (lrcSet.has(item.time)) {
      if (lrc.length < 2) continue;
      const tItem = lrc.pop();
      tItem.time = lrc[lrc.length - 1].time;
      lrcT.push(tItem);
      lrc.push(item);
    } else {
      lrc.push(item);
      lrcSet.add(item.time);
    }
  }

  return {
    lrc,
    lrcT,
  };
}

function transformLrc(lrclist) {
  return lrclist.map((l) => {
    const timeInSeconds = parseFloat(l.time);
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = (timeInSeconds % 60).toFixed(2);
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
    return `[${formattedTime}]${l.lineLyric}`;
  }).join("\n");
}

function buildParams(id, isGetLyricx) {
  try {
    let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`;
    if (isGetLyricx) params += '&lrcx=1';

    const key = 'yeelion';
    const keyLen = key.length;

    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(key);
    const paramsBytes = encoder.encode(params);

    const output = new Uint8Array(paramsBytes.length);
    for (let i = 0; i < paramsBytes.length; i++) {
      output[i] = paramsBytes[i] ^ keyBytes[i % keyLen];
    }

    if (typeof btoa !== 'undefined') {
      return btoa(String.fromCharCode.apply(null, output));
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(output).toString('base64');
    } else {
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      for (let i = 0; i < output.length; i += 3) {
        const a = output[i];
        const b = i + 1 < output.length ? output[i + 1] : 0;
        const c = i + 2 < output.length ? output[i + 2] : 0;

        result += base64Chars[(a >> 2) & 0x3F];
        result += base64Chars[((a << 4) | (b >> 4)) & 0x3F];
        result += i + 1 < output.length ? base64Chars[((b << 2) | (c >> 6)) & 0x3F] : '=';
        result += i + 2 < output.length ? base64Chars[c & 0x3F] : '=';
      }
      return result;
    }
  } catch (error) {
    console.error('[酷我] buildParams 失败:', error);
    throw error;
  }
}

function arrayBufferToBase64(buffer) {
  try {
    let uint8Array;
    if (buffer instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(buffer);
    } else if (buffer instanceof Uint8Array) {
      uint8Array = buffer;
    } else if (typeof buffer === 'string') {
      const encoder = new TextEncoder();
      uint8Array = encoder.encode(buffer);
    } else if (typeof Buffer !== 'undefined' && buffer instanceof Buffer) {
      uint8Array = new Uint8Array(buffer);
    } else {
      throw new Error('Unsupported data type');
    }

    if (typeof btoa !== 'undefined') {
      const binary = String.fromCharCode.apply(null, uint8Array);
      return btoa(binary);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(uint8Array).toString('base64');
    } else {
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      for (let i = 0; i < uint8Array.length; i += 3) {
        const a = uint8Array[i];
        const b = i + 1 < uint8Array.length ? uint8Array[i + 1] : 0;
        const c = i + 2 < uint8Array.length ? uint8Array[i + 2] : 0;

        result += base64Chars[(a >> 2) & 0x3F];
        result += base64Chars[((a << 4) | (b >> 4)) & 0x3F];
        result += i + 1 < uint8Array.length ? base64Chars[((b << 2) | (c >> 6)) & 0x3F] : '=';
        result += i + 2 < uint8Array.length ? base64Chars[c & 0x3F] : '=';
      }
      return result;
    }
  } catch (error) {
    console.error('[酷我] arrayBufferToBase64 失败:', error);
    throw error;
  }
}

async function searchMusic(query, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        client: "kt",
        all: query,
        pn: page - 1,
        rn: pageSize,
        uid: 2574109560,
        ver: "kwplayer_ar_8.5.4.2",
        vipver: 1,
        ft: "music",
        cluster: 0,
        strategy: 2012,
        encoding: "utf8",
        rformat: "json",
        vermerge: 1,
        mobi: 1,
      },
    })
  ).data;
  const songs = res.abslist.map(formatMusicItem);
  return {
    isEnd: (+res.PN + 1) * +res.RN >= +res.TOTAL,
    data: songs,
  };
}

async function searchAlbum(query, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        all: query,
        ft: "album",
        itemset: "web_2013",
        client: "kt",
        pn: page - 1,
        rn: pageSize,
        rformat: "json",
        encoding: "utf8",
        pcjson: 1,
      },
    })
  ).data;
  const albums = res.albumlist.map(formatAlbumItem);
  return {
    isEnd: (+res.PN + 1) * +res.RN >= +res.TOTAL,
    data: albums,
  };
}

async function searchArtist(query, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        all: query,
        ft: "artist",
        itemset: "web_2013",
        client: "kt",
        pn: page - 1,
        rn: pageSize,
        rformat: "json",
        encoding: "utf8",
        pcjson: 1,
      },
    })
  ).data;
  const artists = res.abslist.map(formatArtistItem);
  return {
    isEnd: (+res.PN + 1) * +res.RN >= +res.TOTAL,
    data: artists,
  };
}

async function searchMusicSheet(query, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        all: query,
        ft: "playlist",
        itemset: "web_2013",
        client: "kt",
        pn: page - 1,
        rn: pageSize,
        rformat: "json",
        encoding: "utf8",
        pcjson: 1,
      },
    })
  ).data;
  const musicSheets = res.abslist.map(formatMusicSheet);
  return {
    isEnd: (+res.PN + 1) * +res.RN >= +res.TOTAL,
    data: musicSheets,
  };
}

async function searchLyric(query, page) {
  const res = await searchMusic(query, page);
  return {
    isEnd: res.isEnd,
    data: res.data.map((item) => ({
      title: item.title,
      artist: item.artist,
      id: item.id,
      artwork: item.artwork,
      album: item.album,
      platform: "酷我音乐",
    })),
  };
}

async function getMediaSource(musicItem, quality) {
  try {
    let songId = musicItem.id;
    if (typeof songId === 'string' && songId.includes('MUSIC_')) {
      songId = songId.replace('MUSIC_', '');
    }

    const requestedQuality = quality;
    const songQualities = ensureQualities(musicItem.qualities);

    if (!songQualities[quality]) {
      const availableQualities = Object.keys(songQualities);
      if (availableQualities.length > 0) {
        if (availableQualities.includes('flac')) {
          quality = 'flac';
        } else if (availableQualities.includes('320k')) {
          quality = '320k';
        } else {
          quality = availableQualities[0];
        }
      }
    }

    const qualityMap = {
      '128k': '128k',
      '320k': '320k',
      'flac': 'flac',
      'atmos': 'atmos',
      'atmos_plus': 'atmos_plus',
      'master': 'master'
    };

    const qualityParam = qualityMap[quality] || quality;

    try {
      const res = await requestMusicUrl('kw', songId, qualityParam);

      if (res.code === 200 && res.url) {
        const result = { url: res.url };
        if (res.ekey) result.ekey = res.ekey;
        return result;
      }
    } catch (apiError) {
      console.error(`[酷我] API获取播放链接失败: ${apiError.message}`);
    }

    return null;
  } catch (error) {
    console.error(`[酷我] 获取播放源错误: ${error.message}`);
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
      platform: '酷我音乐',
    };
  }

  const rid = musicBase.id || musicBase.rid;
  if (!rid) {
    return null;
  }

  try {
    const [infoRes, artworkFromPicServer] = await Promise.all([
      axios_1.default.get("http://m.kuwo.cn/newh5/singles/songinfoandlrc", {
        params: {
          musicId: rid,
          httpStatus: 1,
        },
      }),
      getPicByRid(rid).catch(() => null)
    ]);

    if (!infoRes.data || infoRes.data.status !== 200 || !infoRes.data.data || !infoRes.data.data.songinfo) {
      return null;
    }

    const info = infoRes.data.data.songinfo;
    const songName = info.songName ? he.decode(info.songName) : '';
    const artist = info.artist ? he.decode(info.artist) : '';

    let qualities = {};
    try {
      qualities = await getQualityByMusicId(rid, songName, artist);
    } catch (e) {}

    if (Object.keys(qualities).length === 0) {
      qualities = ensureQualities({
        '128k': {},
        '320k': {},
        ...(info.hasLossless ? { flac: {} } : {}),
      });
    }

    let artwork = artworkFromPicServer;
    if (!artwork) {
      artwork = info.pic;
      if (artwork && artwork.includes("starheads/")) {
        artwork = artwork.replace(/starheads\/\d+/, "starheads/800");
      } else if (artwork && artwork.includes("albumcover/")) {
        artwork = artwork.replace(/albumcover\/\d+/, "albumcover/800");
      }
    }

    return {
      id: rid,
      title: songName || undefined,
      artist: artist || undefined,
      album: info.album ? he.decode(info.album) : undefined,
      albumId: info.albumId,
      artwork: artwork,
      duration: info.duration,
      qualities: ensureQualities(qualities),
      platform: '酷我音乐',
    };
  } catch (error) {
    console.error('[酷我] getMusicInfo 错误:', error.message);
    return null;
  }
}

async function getLyric(musicItem) {
  const songId = musicItem.id;

  const encryptedParams = buildParams(songId, false);

  try {
    const res = await axios_1.default.get(
      `http://newlyric.kuwo.cn/newlyric.lrc?${encryptedParams}`,
      {
        responseType: 'arraybuffer',
        timeout: 10000
      }
    );

    const base64Data = arrayBufferToBase64(res.data);

    return { rawLrc: base64Data };
  } catch (error) {
    console.error(`[酷我] 新歌词接口获取失败: ${error.message}`);
  }

  try {
    const res = (
      await axios_1.default.get("http://m.kuwo.cn/newh5/singles/songinfoandlrc", {
        params: {
          musicId: songId,
          httpStatus: 1,
        },
      })
    ).data;

    if (res.status === 200 && res.data && res.data.lrclist) {
      const list = res.data.lrclist;

      if (!list || list.length === 0) return { rawLrc: "" };

      const lrcInfo = sortLrcArr(list);

      return {
        rawLrc: transformLrc(lrcInfo.lrc),
        translation: lrcInfo.lrcT.length > 0 ? transformLrc(lrcInfo.lrcT) : undefined,
      };
    }
  } catch (error) {
    console.error(`[酷我] 旧歌词接口获取失败: ${error.message}`);
  }

  return { rawLrc: "" };
}

async function getAlbumInfo(albumItem) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        pn: 0,
        rn: 100,
        albumid: albumItem.id,
        stype: "albuminfo",
        sortby: 0,
        alflac: 1,
        show_copyright_off: 1,
        pcmp4: 1,
        encoding: "utf8",
        plat: "pc",
        thost: "search.kuwo.cn",
        vipver: "MUSIC_9.1.1.2_BCS2",
        devid: "38668888",
        newver: 1,
        pcjson: 1,
      },
    })
  ).data;
  const songs = res.musiclist.map((_) => {
    var _a;

    const qualities = parseKuWoQualityInfo(_.n_minfo || _.N_MINFO);
    const normalizedQualities = ensureQualities(qualities);

    return {
      id: _.id,
      artwork:
        (_a = albumItem.artwork) !== null && _a !== void 0 ? _a : res.img,
      title: he.decode(_.name || ""),
      artist: he.decode(_.artist || ""),
      album: he.decode(_.album || ""),
      albumId: albumItem.id,
      artistId: _.artistid,
      formats: _.formats,
      duration: getDurationSeconds(_),
      qualities: normalizedQualities,
      nMInfo: _.n_minfo || _.N_MINFO,
    };
  });
  return {
    musicList: songs,
  };
}

async function getArtistMusicWorks(artistItem, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        pn: page - 1,
        rn: pageSize,
        artistid: artistItem.id,
        stype: "artist2music",
        sortby: 0,
        alflac: 1,
        show_copyright_off: 1,
        pcmp4: 1,
        encoding: "utf8",
        plat: "pc",
        thost: "search.kuwo.cn",
        vipver: "MUSIC_9.1.1.2_BCS2",
        devid: "38668888",
        newver: 1,
        pcjson: 1,
      },
    })
  ).data;
  const songs = res.musiclist.map((_) => {
    const qualities = parseKuWoQualityInfo(_.n_minfo || _.N_MINFO);
    const normalizedQualities = ensureQualities(qualities);

    return {
      id: _.musicrid,
      artwork: artworkShort2Long(_.web_albumpic_short),
      title: he.decode(_.name || ""),
      artist: he.decode(_.artist || ""),
      album: he.decode(_.album || ""),
      albumId: _.albumid,
      artistId: _.artistid,
      formats: _.formats,
      qualities: normalizedQualities,
      nMInfo: _.n_minfo || _.N_MINFO,
    };
  });
  return {
    isEnd: (+res.pn + 1) * pageSize >= +res.total,
    data: songs,
  };
}

async function getArtistAlbumWorks(artistItem, page) {
  const res = (
    await axios_1.default({
      method: "get",
      url: `http://search.kuwo.cn/r.s`,
      params: {
        pn: page - 1,
        rn: pageSize,
        artistid: artistItem.id,
        stype: "albumlist",
        sortby: 1,
        alflac: 1,
        show_copyright_off: 1,
        pcmp4: 1,
        encoding: "utf8",
        plat: "pc",
        thost: "search.kuwo.cn",
        vipver: "MUSIC_9.1.1.2_BCS2",
        devid: "38668888",
        newver: 1,
        pcjson: 1,
      },
    })
  ).data;
  const albums = res.albumlist.map(formatAlbumItem);
  return {
    isEnd: (+res.pn + 1) * pageSize >= +res.total,
    data: albums,
  };
}

async function getArtistWorks(artistItem, page, type) {
  if (type === "music") {
    return getArtistMusicWorks(artistItem, page);
  } else if (type === "album") {
    return getArtistAlbumWorks(artistItem, page);
  }
}

async function getMusicSheetResponseById(id, page, pagesize = 50) {
  return (
    await axios_1.default.get(`http://nplserver.kuwo.cn/pl.svc`, {
      params: {
        op: "getlistinfo",
        pid: id,
        pn: page - 1,
        rn: pagesize,
        encode: "utf8",
        keyset: "pl2012",
        vipver: "MUSIC_9.1.1.2_BCS2",
        newver: 1,
      },
    })
  ).data;
}

async function importMusicSheet(urlLike) {
  var _a, _b;
  let id;
  if (!id) {
    id =
      (_a = urlLike.match(
        /https?:\/\/www\/kuwo\.cn\/playlist_detail\/(\d+)/
      )) === null || _a === void 0
        ? void 0
        : _a[1];
  }
  if (!id) {
    id =
      (_b = urlLike.match(/https?:\/\/m\.kuwo\.cn\/h5app\/playlist\/(\d+)/)) ===
        null || _b === void 0
        ? void 0
        : _b[1];
  }
  if (!id) {
    id = urlLike.match(/^\s*(\d+)\s*$/);
  }
  if (!id) {
    return;
  }
  let page = 1;
  let totalPage = 30;
  let musicList = [];
  while (page < totalPage) {
    try {
      const data = await getMusicSheetResponseById(id, page, 80);
      totalPage = Math.ceil(data.total / 80);
      if (isNaN(totalPage)) {
        totalPage = 1;
      }
      musicList = musicList.concat(
        data.musicList.map((_) => ({
          id: _.id,
          title: he.decode(_.name || ""),
          artist: he.decode(_.artist || ""),
          album: he.decode(_.album || ""),
          albumId: _.albumid,
          artistId: _.artistid,
          formats: _.formats,
        }))
      );
    } catch (_c) {}
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200 + Math.random() * 100);
    });
    ++page;
  }
  return musicList;
}

function getMusicSheetInfo(sheet, page) {
  return getMusicSheetResponseById(sheet.id, page, pageSize).then(res => {
    return Promise.all(
      res.musiclist.map((_) => {
        const rid = _.musicrid || _.id;

        return Promise.all([
          getPicByRid(rid),
          getQualityByMusicId(_.id, _.name, _.artist)
        ]).then(([artwork, qualities]) => {
          const normalizedQualities = ensureQualities(qualities);
          if (!artwork) {
            artwork = _.albumpic
              ? _.albumpic.replace('/120/', '/500/')
              : (_.pic || artworkShort2Long(_.web_albumpic_short));
          }

          return {
            id: _.id,
            artwork: artwork,
            title: he.decode(_.name || ""),
            artist: he.decode(_.artist || ""),
            album: he.decode(_.album || ""),
            albumId: _.albumid,
            artistId: _.artistid,
            formats: _.formats,
            duration: getDurationSeconds(_),
            qualities: normalizedQualities,
          };
        });
      })
    ).then(musicList => {
      return {
        isEnd: page * pageSize >= res.total,
        musicList: musicList,
      };
    });
  });
}

async function getRecommendSheetTags() {
  const res = (
    await axios_1.default.get(
      `http://wapi.kuwo.cn/api/pc/classify/playlist/getTagList?cmd=rcm_keyword_playlist&user=0&prod=kwplayer_pc_9.0.5.0&vipver=9.0.5.0&source=kwplayer_pc_9.0.5.0&loginUid=0&loginSid=0&appUid=76039576`
    )
  ).data.data;
  const data = res
    .map((group) => ({
      title: group.name,
      data: group.data.map((_) => ({
        id: _.id,
        digest: _.digest,
        title: _.name,
      })),
    }))
    .filter((item) => item.data.length);
  const pinned = [
    {
      id: "1848",
      title: "翻唱",
      digest: "10000",
    },
    {
      id: "621",
      title: "网络",
      digest: "10000",
    },
    {
      title: "伤感",
      digest: "10000",
      id: "146",
    },
    {
      title: "欧美",
      digest: "10000",
      id: "35",
    },
  ];
  return {
    data,
    pinned,
  };
}

async function getRecommendSheetsByTag(tag, page) {
  const pageSize = 20;
  let res;
  if (tag.id) {
    if (tag.digest === "10000") {
      res = (
        await axios_1.default.get(
          `http://wapi.kuwo.cn/api/pc/classify/playlist/getTagPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=${
            page - 1
          }&id=${tag.id}&rn=${pageSize}`
        )
      ).data.data;
    } else {
      let digest43Result = (
        await axios_1.default.get(
          `http://mobileinterfaces.kuwo.cn/er.s?type=get_pc_qz_data&f=web&id=${tag.id}&prod=pc`
        )
      ).data;
      const list = digest43Result.reduce((prev, curr) => [...prev, ...(curr.list || [])], []);
      res = {
        total: list.length,
        data: list.map(item => ({
          id: item.id,
          name: item.name,
          img: item.img,
          uname: '',
          listencnt: 0,
          uid: 0,
        })),
      };
    }
  } else {
    res = (
      await axios_1.default.get(
        `https://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?loginUid=0&loginSid=0&appUid=76039576&&pn=${
          page - 1
        }&rn=${pageSize}&order=hot`
      )
    ).data.data;
  }
  const isEnd = page * pageSize >= res.total;
  return {
    isEnd,
    data: res.data.map((_) => ({
      title: _.name,
      artist: _.uname,
      id: _.id,
      artwork: _.img,
      playCount: _.listencnt,
      createUserId: _.uid,
    })),
  };
}

async function getTopLists() {
  const result = (
    await axios_1.default.get("http://wapi.kuwo.cn/api/pc/bang/list")
  ).data.child;
  return result.map((e) => ({
    title: e.disname,
    data: e.child.map((_) => {
      var _a, _b;
      return {
        id: _.sourceid,
        coverImg:
          (_b = (_a = _.pic5) !== null && _a !== void 0 ? _a : _.pic2) !==
            null && _b !== void 0
            ? _b
            : _.pic,
        title: _.name,
        description: _.intro,
      };
    }),
  }));
}

function getTopListDetail(topListItem) {
  return axios_1.default.get(`http://kbangserver.kuwo.cn/ksong.s`, {
    params: {
      from: "pc",
      fmt: "json",
      pn: 0,
      rn: 80,
      type: "bang",
      data: "content",
      id: topListItem.id,
      show_copyright_off: 0,
      pcmp4: 1,
      isbang: 1,
      userid: 0,
      httpStatus: 1,
    },
  }).then(res => {
    return Promise.all(
      res.data.musiclist.map((_) => {
        const rid = _.musicrid || _.id;

        return Promise.all([
          getPicByRid(rid),
          getQualityByMusicId(_.id, _.name, _.artist)
        ]).then(([artwork, qualities]) => {
          const normalizedQualities = ensureQualities(qualities);
          if (!artwork) {
            artwork = _.albumpic
              ? _.albumpic.replace('/120/', '/500/')
              : (_.pic || artworkShort2Long(_.web_albumpic_short));
          }

          return {
            id: _.id,
            artwork: artwork,
            title: he.decode(_.name || ""),
            artist: he.decode(_.artist || ""),
            album: he.decode(_.album || ""),
            albumId: _.albumid,
            artistId: _.artistid,
            formats: _.formats,
            duration: getDurationSeconds(_),
            qualities: normalizedQualities,
          };
        });
      })
    ).then(musicList => {
      return { ...topListItem, 
        musicList: musicList,
       };
    });
  });
}

async function getMusicComments(musicItem, page = 1) {
  const pageSize = 20;

  try {
    const res = await axios_1.default.get(
      'http://ncomment.kuwo.cn/com.s',
      {
        params: {
          f: 'web',
          type: 'get_comment',
          aapiver: 1,
          prod: 'kwplayer_ar_10.5.2.0',
          digest: 15,
          sid: musicItem.id,
          start: pageSize * (page - 1),
          msgflag: 1,
          count: pageSize,
          newver: 3,
          uid: 0,
        },
        headers: {
          'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)',
        },
      }
    );

    if (res.status !== 200 || res.data.code !== '200') {
      return { isEnd: true, data: [] };
    }

    const comments = (res.data.comments || []).map((item) => ({
      id: item.id?.toString(),
      nickName: item.u_name || '',
      avatar: item.u_pic,
      comment: item.msg || '',
      like: item.like_num,
      createAt: item.time ? Number(item.time) * 1000 : null,
      replies: (item.child_comments || []).map((c) => ({
        id: c.id?.toString(),
        nickName: c.u_name || '',
        avatar: c.u_pic,
        comment: c.msg || '',
        like: c.like_num,
        createAt: c.time ? Number(c.time) * 1000 : null,
      })),
    }));

    const total = res.data.comments_counts || 0;

    return {
      isEnd: page * pageSize >= total,
      data: comments,
    };
  } catch (error) {
    console.error('[酷我] 获取评论失败:', error);
    return { isEnd: true, data: [] };
  }
}

module.exports = {
  platform: "酷我音乐",
  author: "Toskysun",
  version: "1.0.0",
  appVersion: ">0.1.0-alpha.0",
  srcUrl: UPDATE_URL,
  cacheControl: "no-cache",
  supportedQualities: ["128k", "320k", "flac"],
  hints: {
    importMusicSheet: [
      "酷我APP：自建歌单-分享-复制试听链接，直接粘贴即可",
      "H5：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待",
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
