// {{REQUEST_HANDLER}}

("use strict");
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CryptoJs = require("crypto-js");
const he = require("he");
const pageSize = 20;

// 统一的音质解析函数
function parseQualities(file) {
  if (!file) return {};

  const qualities = {};
  if (file.size_128mp3 && file.size_128mp3 !== 0) {
    qualities['128k'] = { size: file.size_128mp3, bitrate: 128000 };
  }
  if (file.size_320mp3 && file.size_320mp3 !== 0) {
    qualities['320k'] = { size: file.size_320mp3, bitrate: 320000 };
  }
  if (file.size_flac && file.size_flac !== 0) {
    qualities['flac'] = { size: file.size_flac, bitrate: 1411000 };
  }
  if (file.size_hires && file.size_hires !== 0) {
    qualities['hires'] = { size: file.size_hires, bitrate: 1536000 };
  }
  if (file.size_new && file.size_new[0] !== 0) {
    qualities['master'] = { size: file.size_new[0], bitrate: 2304000 };
  }
  if (file.size_new && file.size_new[1] !== 0) {
    qualities['atmos'] = { size: file.size_new[1], bitrate: 1411000 };
  }
  if (file.size_new && file.size_new[2] !== 0) {
    qualities['atmos_plus'] = { size: file.size_new[2], bitrate: 1411000 };
  }
  return qualities;
}

// 批量获取完整音质信息（用于歌单等旧格式数据）
async function getBatchQualities(songList) {
  if (!songList || songList.length === 0) return {};

  try {
    const res = await axios_1.default({
      url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
      method: "POST",
      data: {
        comm: { ct: '19', cv: '1859', uin: '0' },
        req: {
          module: 'music.trackInfo.UniformRuleCtrl',
          method: 'CgiGetTrackInfo',
          param: {
            types: songList.map(() => 1),
            ids: songList.map(item => item.songid || item.id),
            ctx: 0,
          },
        },
      },
      headers: {
        referer: "https://y.qq.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: "uin=",
      },
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    });

    const qualityMap = {};
    if (res.data?.req?.data?.tracks) {
      res.data.req.data.tracks.forEach((track) => {
        qualityMap[track.id] = parseQualities(track.file);
      });
    }
    return qualityMap;
  } catch (error) {
    console.error('[QQ音乐] 批量获取音质失败:', error);
    return {};
  }
}

function formatMusicItem(_, qualityInfo = {}) {
  var _a, _b, _c;
  const albumid =
    _.albumid || ((_a = _.album) === null || _a === void 0 ? void 0 : _a.id);
  const albummid =
    _.albummid || ((_b = _.album) === null || _b === void 0 ? void 0 : _b.mid);
  const albumname =
    _.albumname ||
    ((_c = _.album) === null || _c === void 0 ? void 0 : _c.title);

  // 优先使用外部传入的音质信息（批量获取的），否则从 file 字段解析
  const songId = _.id || _.songid;
  let qualities = qualityInfo[songId] || parseQualities(_.file);

  // 保存完整的歌手信息列表，用于歌手详情跳转
  const singerList = (_.singer || []).map(s => ({
    id: s.id,
    mid: s.mid,
    name: s.name,
    avatar: s.mid ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${s.mid}.jpg` : "",
  }));

  // 封面优先用专辑封面，fallback 到第一个歌手头像
  const singerMid = _.singer && _.singer[0] && _.singer[0].mid;
  const artwork = albummid
    ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${albummid}.jpg`
    : singerMid
      ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singerMid}.jpg`
      : undefined;

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
  };
}
function formatAlbumItem(_) {
  return {
    id: _.albumID || _.albumid,
    albumMID: _.albumMID || _.album_mid,
    title: _.albumName || _.album_name,
    artwork:
      _.albumPic ||
      `https://y.gtimg.cn/music/photo_new/T002R800x800M000${
        _.albumMID || _.album_mid
      }.jpg`,
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
  };
}
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
async function searchBase(query, page, type) {
  const res = (
    await (0, axios_1.default)({
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
async function searchMusic(query, page) {
  const songs = await searchBase(query, page, 0);
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
    data: songs.data.map((it) =>
      Object.assign(Object.assign({}, formatMusicItem(it)), {
        rawLrcTxt: it.content,
      })
    ),
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
  const newQuery = Object.assign(Object.assign({}, query), obj);
  let queryArr = [];
  Object.keys(newQuery).forEach((key) => {
    if (newQuery[key] !== undefined && newQuery[key] !== "") {
      queryArr.push(`${key}=${encodeURIComponent(newQuery[key])}`);
    }
  });
  return `${url}?${queryArr.join("&")}`.replace(/\?$/, "");
}
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
async function getAlbumInfo(albumItem) {
  const url = changeUrlQuery(
    {
      data: JSON.stringify({
        comm: {
          ct: 24,
          cv: 10000,
        },
        albumSonglist: {
          method: "GetAlbumSongList",
          param: {
            albumMid: albumItem.albumMID,
            albumID: 0,
            begin: 0,
            num: 999,
            order: 2,
          },
          module: "music.musichallAlbum.AlbumSongList",
        },
      }),
    },
    "https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8"
  );
  const res = (
    await (0, axios_1.default)({
      url: url,
      headers: headers,
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    })
  ).data;

  const songList = res.albumSonglist.data.songList.map(item => item.songInfo);
  return {
    musicList: songList.map(formatMusicItem),
  };
}
async function getArtistSongs(artistItem, page) {
  const url = changeUrlQuery(
    {
      data: JSON.stringify({
        comm: {
          ct: 24,
          cv: 0,
        },
        singer: {
          method: "get_singer_detail_info",
          param: {
            sort: 5,
            singermid: artistItem.singerMID,
            sin: (page - 1) * pageSize,
            num: pageSize,
          },
          module: "music.web_singer_info_svr",
        },
      }),
    },
    "http://u.y.qq.com/cgi-bin/musicu.fcg"
  );
  const res = (
    await (0, axios_1.default)({
      url: url,
      method: "get",
      headers: headers,
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    })
  ).data;

  return {
    isEnd: res.singer.data.total_song <= page * pageSize,
    data: res.singer.data.songlist.map(formatMusicItem),
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
    "http://u.y.qq.com/cgi-bin/musicu.fcg"
  );
  const res = (
    await (0, axios_1.default)({
      url,
      method: "get",
      headers: headers,
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    })
  ).data;
  return {
    isEnd: res.singerAlbum.data.total <= page * pageSize,
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
// Normalize non-standard LRC timestamps like [mm:ss:cc] -> [mm:ss.ccc]
// Example: [00:13:71] => [00:13.710]
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

async function getLyric(musicItem) {
  try {
    // 使用正确的 API（支持罗马音）
    const res = await (0, axios_1.default)({
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
            crypt: 1,           // 启用加密
            qrc: 1,             // qrc格式
            qrc_t: 0,
            roma: 1,            // ⭐ 请求罗马音
            roma_t: 0,
            trans: 1,           // 请求翻译
            trans_t: 0,
            songID: musicItem.id || musicItem.songid,
            type: -1,
          },
        },
      },
      headers: {
        referer: "https://y.qq.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
      },
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    });

    if (res.data?.code === 0 && res.data?.req?.code === 0) {
      const data = res.data.req.data;
      const lyricResult = {
        rawLrc: data.lyric || undefined,        // 原文（加密）
        translation: data.trans || undefined,    // 译文（加密）
        romanization: data.roma || undefined,    // 罗马音（加密）✨
      };

      // 新接口成功但歌词内容为空时，降级到老接口
      if (!lyricResult.rawLrc && !lyricResult.translation && !lyricResult.romanization) {
        console.warn("[QQ音乐] 新 API 返回空歌词，降级到旧 API");
        return getLyricLegacy(musicItem);
      }

      // 返回加密的 hex 字符串，应用层会自动解密
      return lyricResult;
    }

    // API 失败，降级到旧 API
    throw new Error("新 API 返回错误");
  } catch (error) {
    console.warn("[QQ音乐] 新 API 失败，降级到旧 API:", error.message);
    return getLyricLegacy(musicItem);
  }
}

// 旧 API（降级方案）
async function getLyricLegacy(musicItem) {
  const result = (
    await (0, axios_1.default)({
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
    result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, "")
  );
  let translation;
  if (res.trans) {
    translation = he.decode(
      CryptoJs.enc.Base64.parse(res.trans).toString(CryptoJs.enc.Utf8)
    );
  }
  return {
    rawLrc: normalizeColonTimeTag(he.decode(
      CryptoJs.enc.Base64.parse(res.lyric).toString(CryptoJs.enc.Utf8)
    )),
    translation: normalizeColonTimeTag(translation),
  };
}
async function importMusicSheet(urlLike) {
  let id;
  if (!id) {
    id = (urlLike.match(
      /https?:\/\/i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html\?.*id=([0-9]+)/
    ) || [])[1];
  }
  if (!id) {
    id = (urlLike.match(/https?:\/\/y\.qq\.com\/n\/ryqq\/playlist\/([0-9]+)/) ||
      [])[1];
  }
  if (!id) {
    id = (urlLike.match(/^(\d+)$/) || [])[1];
  }
  if (!id) {
    return;
  }
  const result = (
    await (0, axios_1.default)({
      url: `http://i.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&utf8=1&disstid=${id}&loginUin=0`,
      headers: { Referer: "https://y.qq.com/n/yqq/playlist", Cookie: "uin=" },
      method: "get",
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    })
  ).data;
  const res = JSON.parse(
    result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, "")
  );

  const songList = res.cdlist[0].songlist;

  // 批量获取完整音质信息
  const qualityInfo = await getBatchQualities(songList);

  return songList.map(song => formatMusicItem(song, qualityInfo));
}
async function getTopLists() {
  const list = await (0, axios_1.default)({
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
  const res = await (0, axios_1.default)({
    url: `https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&data=%7B%22detail%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetDetail%22%2C%22param%22%3A%7B%22topId%22%3A${
      topListItem.id
    }%2C%22offset%22%3A0%2C%22num%22%3A100%2C%22period%22%3A%22${
      (_a = topListItem.period) !== null && _a !== void 0 ? _a : ""
    }%22%7D%7D%2C%22comm%22%3A%7B%22ct%22%3A24%2C%22cv%22%3A0%7D%7D`,
    method: "get",
    headers: {
      Cookie: "uin=",
    },
    xsrfCookieName: "XSRF-TOKEN",
    withCredentials: true,
  });

  const songList = res.data.detail.data.songInfoList;

  // 批量获取完整音质信息
  const qualityInfo = await getBatchQualities(songList);

  return Object.assign(Object.assign({}, topListItem), {
    musicList: songList.map(song => formatMusicItem(song, qualityInfo)),
  });
}
async function getRecommendSheetTags() {
  const res = (
    await axios_1.default.get(
      "https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg?format=json&inCharset=utf8&outCharset=utf-8",
      {
        headers: {
          referer: "https://y.qq.com/",
        },
      }
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
    await axios_1.default.get(
      "https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg",
      {
        headers: {
          referer: "https://y.qq.com/",
        },
        params: {
          inCharset: "utf8",
          outCharset: "utf-8",
          sortId: 5,
          categoryId:
            (tag === null || tag === void 0 ? void 0 : tag.id) || "10000000",
          sin: pageSize * (page - 1),
          ein: page * pageSize - 1,
        },
      }
    )
  ).data;
  const res = JSON.parse(
    rawRes.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, "")
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
        (_b =
          (_a = item.creator) === null || _a === void 0 ? void 0 : _a.name) !==
          null && _b !== void 0
          ? _b
          : "",
    };
  });
  return {
    isEnd,
    data,
  };
}
async function getMusicSheetInfo(sheet, page) {
  const data = await importMusicSheet(sheet.id);
  return {
    isEnd: true,
    musicList: data,
  };
}
// MusicFree标准音质键映射
const qualityLevels = {
  "128k": "128k",
  "320k": "320k",
  "flac": "flac",
  "flac24bit": "flac24bit",
  "hires": "hires",
  "atmos": "atmos",
  "atmos_plus": "atmos_plus",
  "master": "master",
};

async function getMediaSource(musicItem, quality) {
  try {
    // 检查音质信息
    if (musicItem.qualities && Object.keys(musicItem.qualities).length > 0) {
      // 如果歌曲不支持请求的音质，返回错误
      if (!musicItem.qualities[quality]) {
        console.error(`[QQ音乐] 歌曲不支持音质 ${quality}`);
        throw new Error(`该歌曲不支持 ${quality} 音质`);
      }
    }
    
    // 直接使用质量键，因为现在quality参数就是标准的音质键
    const qualityParam = qualityLevels[quality] || quality;
    
    const res = await requestMusicUrl('tx', musicItem.songmid, qualityParam);
    
    if (res.code === 200 && res.url) {
      return {
        url: res.url
      };
    } else {
      console.error(`[QQ音乐] 获取播放链接失败: ${res.msg || '未知错误'}`);
      return null;
    }
  } catch (error) {
    console.error(`[QQ音乐] 获取播放源错误: ${error.message}`);
    throw error;
  }
}
// 获取歌曲详细信息（用于评论功能）
async function getMusicInfoForComment(musicItem) {
  try {
    // 如果已经有 id，直接返回
    if (musicItem.id && typeof musicItem.id === 'number') {
      return musicItem.id;
    }

    // 使用 songmid 获取详细信息
    const res = await axios_1.default.post(
      'https://u.y.qq.com/cgi-bin/musicu.fcg',
      {
        comm: {
          ct: '19',
          cv: '1859',
          uin: '0',
        },
        req: {
          module: 'music.trackInfo.UniformRuleCtrl',
          method: 'CgiGetTrackInfo',
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
          referer: 'https://y.qq.com',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
          Cookie: 'uin=',
        },
      }
    );

    if (res.data && res.data.req && res.data.req.data && res.data.req.data.tracks && res.data.req.data.tracks[0]) {
      return res.data.req.data.tracks[0].id;
    }

    return typeof musicItem.id === 'number' ? musicItem.id : null;
  } catch (error) {
    console.error('[QQ音乐] 获取歌曲信息失败:', error);
    return typeof musicItem.id === 'number' ? musicItem.id : null;
  }
}

// 通过ID/songmid获取歌曲详细信息
async function getMusicInfo(musicBase) {
  // 如果已有完整信息（artwork和qualities），直接返回，避免重复请求
  if (typeof musicBase.artwork === 'string' && musicBase.artwork && musicBase.qualities && Object.keys(musicBase.qualities).length > 0) {
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
      platform: 'QQ音乐',
    };
  }

  try {
    const songmid = musicBase.songmid || musicBase.mid || musicBase.id;
    const songid = musicBase.id || musicBase.songid;

    if (!songmid && !songid) {
      console.error('[QQ音乐] getMusicInfo: 缺少有效的歌曲标识');
      return null;
    }

    const res = await axios_1.default.post(
      'https://u.y.qq.com/cgi-bin/musicu.fcg',
      {
        comm: {
          ct: '19',
          cv: '1859',
          uin: '0',
        },
        req: {
          module: 'music.trackInfo.UniformRuleCtrl',
          method: 'CgiGetTrackInfo',
          param: {
            types: [1],
            ids: songid && !isNaN(Number(songid)) ? [Number(songid)] : [0],
            mids: songmid ? [String(songmid)] : [],
            ctx: 0,
          },
        },
      },
      {
        headers: {
          referer: 'https://y.qq.com',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
          Cookie: 'uin=',
        },
      }
    );

    if (res.data && res.data.req && res.data.req.data && res.data.req.data.tracks && res.data.req.data.tracks[0]) {
      const track = res.data.req.data.tracks[0];
      const album = track.album || {};
      const singers = track.singer || [];

      // 保存完整的歌手信息列表，用于歌手详情跳转
      const singerList = singers.map(s => ({
        id: s.id,
        mid: s.mid,
        name: s.name,
      }));

      const singerMid = singers[0] && singers[0].mid;
      return {
        id: track.id,
        songid: track.id,
        songmid: track.mid,
        mid: track.mid,
        title: track.title || track.name,
        artist: singers.map(s => s.name).join(', '),
        singerList: singerList,
        album: album.title || album.name,
        albumid: album.id,
        albummid: album.mid,
        artwork: album.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${album.mid}.jpg`
          : singerMid
            ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singerMid}.jpg`
            : undefined,
        duration: track.interval,
        qualities: parseQualities(track.file),
        platform: 'QQ音乐',
      };
    }

    console.error('[QQ音乐] getMusicInfo: 未找到歌曲信息');
    return null;
  } catch (error) {
    console.error('[QQ音乐] getMusicInfo 错误:', error.message);
    return null;
  }
}

// 获取热评论
async function getMusicComments(musicItem, page = 1) {
  const pageSize = 20;

  try {
    // 获取真实的 songId
    const songId = await getMusicInfoForComment(musicItem);

    // 验证 songId 有效性
    if (!songId || typeof songId !== 'number') {
      console.error('[QQ音乐] 无效的歌曲ID:', songId);
      return { isEnd: true, data: [] };
    }

    const res = await axios_1.default.post(
      'https://u.y.qq.com/cgi-bin/musicu.fcg',
      {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          notice: 0,
          platform: 'yqq.json',
          needNewCode: 1,
          uin: 0
        },
        req: {
          module: 'music.globalComment.CommentRead',
          method: 'GetHotCommentList',
          param: {
            BizType: 1,
            BizId: String(songId),
            LastCommentSeqNo: '',
            PageSize: pageSize,
            PageNum: page - 1,
            HotType: 1,
            WithAirborne: 0,
            PicEnable: 1
          }
        }
      },
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
          referer: 'https://y.qq.com/',
          origin: 'https://y.qq.com',
          'content-type': 'application/json; charset=utf-8'
        }
      }
    );

    if (res.data.code !== 0 || !res.data.req || res.data.req.code !== 0) {
      console.error('[QQ音乐] 获取热评论失败:', res.data);
      return { isEnd: true, data: [] };
    }

    const commentList = res.data.req.data?.CommentList?.Comments || [];
    const comments = commentList.map((item) => {
      const comment = {
        id: item.CmId,
        nickName: item.Nick || '',
        avatar: item.Avatar,
        comment: item.Content || '',
        like: item.PraiseNum || 0,
        createAt: item.PubTime ? parseInt(item.PubTime + '000') : null,
        replies: []
      };

      // 处理子评论
      if (item.SubComments && Array.isArray(item.SubComments)) {
        comment.replies = item.SubComments.map((c) => ({
          id: c.CmId,
          nickName: c.Nick || '',
          avatar: c.Avatar || '',
          comment: c.Content || '',
          like: c.PraiseNum || 0,
          createAt: c.PubTime ? parseInt(c.PubTime + '000') : null,
        }));
      }

      return comment;
    });

    // 热评论通常数量有限，判断是否结束
    return {
      isEnd: commentList.length < pageSize,
      data: comments,
    };
  } catch (error) {
    console.error('[QQ音乐] 获取热评论失败:', error);
    return { isEnd: true, data: [] };
  }
}

module.exports = {
  platform: "QQ音乐",
  author: "Toskysun",
  version: "0.3.4",
  srcUrl: UPDATE_URL,
  cacheControl: "no-cache",
  // 声明插件支持的音质列表
  supportedQualities: ["128k", "320k", "flac", "flac24bit", "hires", "atmos", "atmos_plus", "master"],
  hints: {
    importMusicSheet: [
      "QQ音乐APP：自建歌单-分享-分享到微信好友/QQ好友；然后点开并复制链接，直接粘贴即可",
      "H5：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待",
    ],
  },
  primaryKey: ["id", "songmid"],
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
  getTopLists,
  getTopListDetail,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getMusicSheetInfo,
  getMusicComments,
};
