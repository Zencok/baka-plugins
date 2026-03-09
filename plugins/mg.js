// {{REQUEST_HANDLER}}

// 转换字节为可读格式
function sizeFormate(size) {
  if (!size || size === 0) return '0B';
  if (size < 1024) return size + 'B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB';
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + 'MB';
  return (size / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
}

// 统一处理图片URL
function formatImgUrl(img) {
  if (!img) return null;
  // 如果已经是完整的URL，直接返回
  if (/^https?:/.test(img)) return img;
  // 如果以//开头，添加http:协议
  if (/^\/\//.test(img)) return 'http:' + img;
  // 否则添加咪咕图片服务器前缀
  return 'http://d.musicapp.migu.cn' + img;
}

// 获取高清封面
async function getHighQualityPic(songId) {
  try {
    const res = await axios_1.default.get(
      `http://music.migu.cn/v3/api/music/audioPlayer/getSongPic?songId=${songId}`,
      {
        headers: {
          Referer: 'http://music.migu.cn/v3/music/player/audio?from=migu',
        },
      }
    );
    if (res.data && res.data.returnCode === '000000') {
      let url = res.data.largePic || res.data.mediumPic || res.data.smallPic;
      if (url && !/^https?:/.test(url)) url = 'http:' + url;
      return url;
    }
  } catch (error) {
    // 忽略错误
  }
  return null;
}

// MD5加密函数
function toMD5(str) {
  return CryptoJS.MD5(str).toString();
}

// 创建签名
function createSignature(time, str) {
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20';
  const signatureMd5 = '6cdc72a439cef99a3418d2a78aa28c73';
  const sign = toMD5(
    `${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`
  );
  return { sign, deviceId };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const cheerio_1 = require("cheerio");
const CryptoJS = require("crypto-js");
const searchRows = 20;
// 使用新的搜索API获取包含音质信息的结果
async function searchMusicV3(query, page, limit = searchRows) {
  const time = Date.now().toString();
  const signData = createSignature(time, query);
  
  const headers = {
    uiVersion: 'A_music_3.6.1',
    deviceId: signData.deviceId,
    timestamp: time,
    sign: signData.sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };
  
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`;
  
  try {
    const res = await axios_1.default.get(url, { headers });
    return res.data;
  } catch (error) {
    console.error('[咪咕] 搜索V3 API失败，回退到旧API:', error);
    // 如果新API失败，回退到旧的搜索方式
    return searchBase(query, page, 2);
  }
}

async function searchBase(query, page, type) {
  const headers = {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    Connection: "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Host: "m.music.migu.cn",
    Referer: `https://m.music.migu.cn/v3/search?keyword=${encodeURIComponent(
      query
    )}`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Mobile Safari/537.36 Edg/89.0.774.68",
    "X-Requested-With": "XMLHttpRequest",
  };
  const params = {
    keyword: query,
    type,
    pgc: page,
    rows: searchRows,
  };
  const data = await axios_1.default.get(
    "https://m.music.migu.cn/migu/remoting/scr_search_tag",
    { headers, params }
  );
  return data.data;
}
function musicCanPlayFilter(_) {
  return _.mp3 || _.listenUrl || _.lisQq || _.lisCr;
}

// 基于咪咕音乐返回的数据结构优化音质检测
function getMiGuQualitiesFromSong(songData) {
  const qualities = {};
  
  // 优先从audioFormats获取音质信息（如果存在）
  if (songData.audioFormats && Array.isArray(songData.audioFormats)) {
    songData.audioFormats.forEach((format) => {
      const size = format.asize || format.isize || format.fileSize;
      
      switch (format.formatType) {
        case 'PQ': // 标准音质 128k
          qualities['128k'] = {
            size: sizeFormate(size),
            bitrate: format.bitRate || 128000,
          };
          break;
        case 'HQ': // 高音质 320k
          qualities['320k'] = {
            size: sizeFormate(size),
            bitrate: format.bitRate || 320000,
          };
          break;
        case 'SQ': // 无损音质 flac
          qualities['flac'] = {
            size: sizeFormate(size),
            bitrate: format.bitRate || 1411000,
          };
          break;
        case 'ZQ24': // Hi-Res音质
          qualities['hires'] = {
            size: sizeFormate(size),
            bitrate: format.bitRate || 2304000,
          };
          break;
      }
    });
    
    if (Object.keys(qualities).length > 0) {
      return qualities;
    }
  }
  
  // 如果没有audioFormats，使用URL字段判断（旧方式）
  // 基础音质 128k
  if (songData.mp3 || songData.listenUrl || musicCanPlayFilter(songData)) {
    qualities['128k'] = {
      size: 'N/A',
      bitrate: 128000,
    };
  }
  
  // 高音质 320k
  if (songData.lisQq || songData.hqUrl) {
    qualities['320k'] = {
      size: 'N/A',
      bitrate: 320000,
    };
  }
  
  // 无损音质 flac
  if (songData.lisCr || songData.sqUrl) {
    qualities['flac'] = {
      size: 'N/A',
      bitrate: 1411000,
    };
  }
  
  // 如果没有任何音质信息但歌曲可播放，提供基础音质
  if (Object.keys(qualities).length === 0 && musicCanPlayFilter(songData)) {
    qualities['128k'] = {
      size: 'N/A',
      bitrate: 128000,
    };
  }
  
  return qualities;
}

// 尝试从不同字段中提取歌词相关的URL，兼容多种API返回结构
function extractLyricInfo(songData) {
  const sources = [
    songData,
    songData === null || songData === void 0 ? void 0 : songData.songInfo,
    songData === null || songData === void 0 ? void 0 : songData.musicInfo,
    songData === null || songData === void 0 ? void 0 : songData.objectInfo,
    songData === null || songData === void 0 ? void 0 : songData.fullSong,
  ].filter(Boolean);
  
  const pickUrl = (fields) => {
    for (const source of sources) {
      for (const field of fields) {
        if (source[field]) {
          return source[field];
        }
      }
    }
    return undefined;
  };
  
  return {
    lrcUrl: pickUrl(['lrcUrl', 'lrcurl', 'lyricUrl', 'lyricUrlNew']),
    mrcUrl: pickUrl(['mrcUrl', 'mrcurl', 'mrcLyricUrl']),
    trcUrl: pickUrl(['trcUrl', 'trcurl', 'trcLyricUrl']),
  };
}

async function searchMusic(query, page) {
  // 尝试使用新的V3 API
  const result = await searchMusicV3(query, page);
  
  // 处理V3 API的响应
  if (result && result.code === '000000' && result.songResultData) {
    const songResultData = result.songResultData || { resultList: [], totalCount: 0 };
    const musics = [];
    
    // 处理V3 API返回的歌曲数据
    songResultData.resultList.forEach((itemArray) => {
      if (!Array.isArray(itemArray)) return;
      
      itemArray.forEach((item) => {
        if (!item.songId || !item.copyrightId) return;
        
        const qualities = {};
        
        // 从audioFormats字段获取音质信息（包含文件大小）
        if (item.audioFormats && Array.isArray(item.audioFormats)) {
          item.audioFormats.forEach((format) => {
            const size = format.asize || format.isize || format.fileSize;
            
            switch (format.formatType) {
              case 'PQ': // 标准音质 128k
                qualities['128k'] = {
                  size: sizeFormate(size),
                  bitrate: format.bitRate || 128000,
                };
                break;
              case 'HQ': // 高音质 320k
                qualities['320k'] = {
                  size: sizeFormate(size),
                  bitrate: format.bitRate || 320000,
                };
                break;
              case 'SQ': // 无损音质 flac
                qualities['flac'] = {
                  size: sizeFormate(size),
                  bitrate: format.bitRate || 1411000,
                };
                break;
              case 'ZQ24': // Hi-Res音质
                qualities['hires'] = {
                  size: sizeFormate(size),
                  bitrate: format.bitRate || 2304000,
                };
                break;
            }
          });
        }
        
        // 如果没有audioFormats，使用传统方式判断（但仍然没有size）
        if (Object.keys(qualities).length === 0) {
          if (item.mp3 || item.listenUrl) {
            qualities['128k'] = {
              size: 'N/A',
              bitrate: 128000,
            };
          }
          if (item.lisQq) {
            qualities['320k'] = {
              size: 'N/A',
              bitrate: 320000,
            };
          }
          if (item.lisCr) {
            qualities['flac'] = {
              size: 'N/A',
              bitrate: 1411000,
            };
          }
        }
        
        // 确保至少有一个音质
        if (Object.keys(qualities).length === 0) {
          qualities['128k'] = {
            size: 'N/A',
            bitrate: 128000,
          };
        }
        
        // 处理封面图片URL
        let artwork = item.img3 || item.img2 || item.img1 || null;
        if (artwork && !/https?:/.test(artwork)) artwork = 'http://d.musicapp.migu.cn' + artwork;

        // 保存完整的歌手信息列表，用于歌手详情跳转
        const singerList = (item.singerList || []).map(s => ({
          id: s.id || s.singerId,
          name: s.name || s.singerName,
          avatar: s.img || s.singerPic || "",
        }));

        musics.push({
          id: item.songId,
          artwork: artwork,
          title: item.name || item.songName,
          artist: formatSingerName(item.singerList) || item.artist,
          singerList: singerList,
          album: item.album || item.albumName,
          url: item.mp3 || item.listenUrl,
          copyrightId: item.copyrightId,
          singerId: item.singerId,
          qualities: qualities,
          albumId: item.albumId,
          duration: item.duration ? Math.floor(item.duration / 1000) : undefined,
          lrcUrl: item.lrcUrl,
          mrcUrl: item.mrcurl,  // 注意字段名是小写
          trcUrl: item.trcUrl,
        });
      });
    });
    
    return {
      isEnd: songResultData.totalCount <= page * searchRows,
      data: musics,
    };
  }
  
  // 如果V3 API失败或返回旧格式，使用原来的处理逻辑
  if (result && result.musics) {
    const data = result;
    const musics = data.musics.map((_) => {
      const qualities = {};
      
      if (_.mp3 || _.listenUrl || musicCanPlayFilter(_)) {
        qualities['128k'] = {
          size: 'N/A',
          bitrate: 128000,
        };
      }
      
      if (_.lisQq || _.hqUrl) {
        qualities['320k'] = {
          size: 'N/A',
          bitrate: 320000,
        };
      }
      
      if (_.lisCr || _.sqUrl) {
        qualities['flac'] = {
          size: 'N/A',
          bitrate: 1411000,
        };
      }
      
      if (Object.keys(qualities).length === 0) {
        qualities['128k'] = {
          size: 'N/A',
          bitrate: 128000,
        };
      }

      // 处理封面图片URL
      let artwork = _.picL || _.picM || _.picS || _.cover || _.songPic || null;
      if (artwork && !/https?:/.test(artwork)) artwork = 'http://d.musicapp.migu.cn' + artwork;

      // 保存完整的歌手信息列表，用于歌手详情跳转
      const singerList = _.singerId ? [{
        id: _.singerId,
        name: _.artist,
      }] : [];

      return {
        id: _.id,
        artwork: artwork,
        title: _.songName,
        artist: _.artist,
        singerList: singerList,
        album: _.albumName,
        url: musicCanPlayFilter(_),
        copyrightId: _.copyrightId,
        singerId: _.singerId,
        qualities: qualities,
        vipFlag: _.vipFlag,
        lrcUrl: _.lrcUrl,
        mrcUrl: _.mrcurl,
        trcUrl: _.trcUrl,
      };
    });
    
    return {
      isEnd: +data.pageNo * searchRows >= data.pgt,
      data: musics,
    };
  }
  
  return {
    isEnd: true,
    data: [],
  };
}

// 格式化歌手名称
function formatSingerName(singerList) {
  if (!singerList || !Array.isArray(singerList)) return '';
  return singerList.map(singer => singer.name || singer.singerName || '').filter(Boolean).join(', ');
}
// V3 API 搜索专辑
async function searchAlbumV3(query, page, limit = searchRows) {
  const time = Date.now().toString();
  const signData = createSignature(time, query);

  const headers = {
    uiVersion: 'A_music_3.6.1',
    deviceId: signData.deviceId,
    timestamp: time,
    sign: signData.sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };

  // searchSwitch: album=1, 其他=0
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A1%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`;

  try {
    const res = await axios_1.default.get(url, { headers });
    return res.data;
  } catch (error) {
    console.error('[咪咕] 搜索专辑V3 API失败:', error);
    return null;
  }
}

async function searchAlbum(query, page) {
  // 优先使用V3 API
  const result = await searchAlbumV3(query, page);

  if (result && result.code === '000000' && result.albumResultData) {
    const albumData = result.albumResultData || { result: [], totalCount: 0 };
    // V3 API 返回的是 result 数组
    const rawList = albumData.result || albumData.resultList || [];
    const albums = [];

    rawList.forEach((item) => {
      if (!item || !item.id) return;

      let artwork = null;
      if (item.imgItems && item.imgItems.length > 0) {
        artwork = item.imgItems[0].img;
      } else if (item.img) {
        artwork = item.img;
      } else {
        artwork = item.localAlbumPicM || item.localAlbumPicS || item.albumPic;
      }

      albums.push({
        id: item.id,
        artwork: formatImgUrl(artwork),
        title: item.name || item.title,
        date: item.publishDate || item.publishTime,
        artist: formatSingerName(item.singers) || (item.singer ? (Array.isArray(item.singer) ? item.singer.map(s => s.name).join(', ') : item.singer) : ''),
        singer: item.singers || item.singer,
        description: item.albumIntro || item.intro,
        worksNum: item.songNum || item.songCount || item.fullSongTotal,
      });
    });

    return {
      isEnd: albumData.totalCount <= page * searchRows,
      data: albums,
    };
  }

  // 降级到旧API
  const data = await searchBase(query, page, 4);
  if (!data || !data.albums) {
    return { isEnd: true, data: [] };
  }

  const albums = data.albums.map((_) => ({
    id: _.id,
    artwork: formatImgUrl(_.albumPicL || _.albumPicM || _.albumPicS),
    title: _.title,
    date: _.publishDate,
    artist: (_.singer || []).map((s) => s.name).join(","),
    singer: _.singer,
    worksNum: _.fullSongTotal,
  }));
  return {
    isEnd: +data.pageNo * searchRows >= data.pgt,
    data: albums,
  };
}
// V3 API 搜索歌手
async function searchArtistV3(query, page, limit = searchRows) {
  const time = Date.now().toString();
  const signData = createSignature(time, query);

  const headers = {
    uiVersion: 'A_music_3.6.1',
    deviceId: signData.deviceId,
    timestamp: time,
    sign: signData.sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };

  // searchSwitch: singer=1, 其他=0
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A0%2C%22singer%22%3A1%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`;

  try {
    const res = await axios_1.default.get(url, { headers });
    return res.data;
  } catch (error) {
    console.error('[咪咕] 搜索歌手V3 API失败:', error);
    return null;
  }
}

async function searchArtist(query, page) {
  // 优先使用V3 API
  const result = await searchArtistV3(query, page);

  if (result && result.code === '000000' && result.singerResultData) {
    const singerData = result.singerResultData || { result: [], totalCount: 0 };
    const rawList = singerData.result || singerData.resultList || [];
    const artists = [];

    rawList.forEach((item) => {
      if (!item || !item.id) return;

      // 歌手封面在 singerPicUrl 数组中
      let avatar = null;
      if (item.singerPicUrl && item.singerPicUrl.length > 0) {
        avatar = item.singerPicUrl[0].img;
      } else if (item.imgs && item.imgs.length > 0) {
        avatar = item.imgs[0].img;
      } else if (item.img) {
        avatar = item.img;
      }

      artists.push({
        id: item.id,
        name: item.name || item.title,
        avatar: formatImgUrl(avatar),
        description: item.intro || item.artistIntro,
        worksNum: item.songCount || item.songNum || item.musicNum,
        albumNum: item.albumCount || item.albumNum,
        fans: item.followNum || item.fansNum,
      });
    });

    return {
      isEnd: singerData.totalCount <= page * searchRows,
      data: artists,
    };
  }

  // 降级到旧API
  const data = await searchBase(query, page, 1);
  if (!data || !data.artists) {
    return { isEnd: true, data: [] };
  }

  const artists = data.artists.map((result) => ({
    name: result.title,
    id: result.id,
    avatar: formatImgUrl(result.artistPicL || result.artistPicM || result.artistPicS),
    worksNum: result.songNum,
  }));
  return {
    isEnd: +data.pageNo * searchRows >= data.pgt,
    data: artists,
  };
}
// V3 API 搜索歌单
async function searchMusicSheetV3(query, page, limit = searchRows) {
  const time = Date.now().toString();
  const signData = createSignature(time, query);

  const headers = {
    uiVersion: 'A_music_3.6.1',
    deviceId: signData.deviceId,
    timestamp: time,
    sign: signData.sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };

  // searchSwitch: songlist=1, 其他=0
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A1%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`;

  try {
    const res = await axios_1.default.get(url, { headers });
    return res.data;
  } catch (error) {
    console.error('[咪咕] 搜索歌单V3 API失败:', error);
    return null;
  }
}

async function searchMusicSheet(query, page) {
  // 优先使用V3 API
  const result = await searchMusicSheetV3(query, page);

  if (result && result.code === '000000' && result.songListResultData) {
    const listData = result.songListResultData || { result: [], totalCount: 0 };
    const musicsheet = (listData.result || []).map((item) => {
      let artwork = item.musicListPicUrl || item.img;
      if (!artwork && item.imgItem) {
        artwork = item.imgItem.img;
      }

      return {
        id: item.id,
        title: item.name || item.title,
        artist: item.userName || item.ownerName,
        artwork: formatImgUrl(artwork),
        description: item.intro || item.summary,
        worksNum: item.musicNum || item.songCount,
        playCount: item.playNum || item.playCount,
      };
    });

    return {
      isEnd: listData.totalCount <= page * searchRows,
      data: musicsheet,
    };
  }

  // 降级到旧API
  const data = await searchBase(query, page, 6);
  if (!data || !data.songLists) {
    return { isEnd: true, data: [] };
  }

  const musicsheet = data.songLists.map((result) => ({
    title: result.name,
    id: result.id,
    artist: result.userName,
    artwork: formatImgUrl(result.picL || result.picM || result.picS || result.img || result.cover),
    description: result.intro,
    worksNum: result.musicNum,
    playCount: result.playNum,
  }));
  return {
    isEnd: +data.pageNo * searchRows >= data.pgt,
    data: musicsheet,
  };
}

async function searchLyricV3(query, page, limit = searchRows) {
  const time = Date.now().toString();
  const signData = createSignature(time, query);

  const headers = {
    uiVersion: 'A_music_3.6.1',
    deviceId: signData.deviceId,
    timestamp: time,
    sign: signData.sign,
    channel: '0146921',
    'User-Agent':
      'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  };

  const searchSwitch = encodeURIComponent(
    JSON.stringify({
      song: 0,
      album: 0,
      singer: 0,
      tagSong: 0,
      mvSong: 0,
      bestShow: 0,
      songlist: 0,
      lyricSong: 1,
    })
  );

  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1&searchSwitch=${searchSwitch}&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`;

  try {
    const res = await axios_1.default.get(url, { headers });
    return res.data;
  } catch (error) {
    console.error('[咪咕] 搜索歌词V3 API失败:', error);
    return null;
  }
}

function cleanLyricText(text) {
  if (!text) return '';
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function searchLyric(query, page) {
  const result = await searchLyricV3(query, page);

  if (result && result.code === '000000' && result.lyricResultData) {
    const lyricData = result.lyricResultData || { result: [], totalCount: 0 };
    const rawList = lyricData.result || lyricData.resultList || [];
    const flattened = [];

    rawList.forEach((item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach((sub) => sub && flattened.push(sub));
      } else {
        flattened.push(item);
      }
    });

    const lyrics = flattened
      .map((item) => {
        const wrapper = item.objectInfo || item;
        const songInfo = wrapper.songInfo || wrapper.fullSong || wrapper.musicInfo || wrapper;
        const lyricText =
          cleanLyricText(
            wrapper.lyric ||
              wrapper.lyricContent ||
              wrapper.lyricText ||
              wrapper.lyricTxt ||
              wrapper.lyricStr ||
              songInfo.lyric ||
              songInfo.lyricContent
          ) || '';

        let artwork = null;
        if (songInfo.albumImgs && songInfo.albumImgs.length > 0) {
          artwork = songInfo.albumImgs[0].img;
        } else if (songInfo.imgItems && songInfo.imgItems.length > 0) {
          artwork = songInfo.imgItems[0].img;
        } else {
          artwork =
            songInfo.img3 ||
            songInfo.img2 ||
            songInfo.img1 ||
            songInfo.albumPic ||
            songInfo.cover ||
            songInfo.songPic ||
            songInfo.picL ||
            songInfo.picM ||
            songInfo.picS ||
            songInfo.mediumPic ||
            songInfo.largePic ||
            songInfo.smallPic;
        }

        let artist = formatSingerName(songInfo.singerList);
        if (!artist && Array.isArray(songInfo.singers)) {
          artist = songInfo.singers.map((s) => s.name || s.singerName || s).filter(Boolean).join(', ');
        }
        if (!artist && Array.isArray(songInfo.artists)) {
          artist = songInfo.artists.map((s) => s.name || s.singerName || s).filter(Boolean).join(', ');
        }
        if (!artist) {
          if (Array.isArray(songInfo.singerName)) {
            artist = songInfo.singerName.join(', ');
          } else {
            artist = songInfo.singerName || songInfo.singer || songInfo.artist || '';
          }
        }

        const title = songInfo.songName || songInfo.name || songInfo.title;
        const id = songInfo.songId || songInfo.id || wrapper.id;

        if (!title || (!id && !songInfo.copyrightId)) {
          return null;
        }

        // 提取歌词URL
        const lyricInfo = extractLyricInfo(wrapper);
        const songLyricInfo = extractLyricInfo(songInfo);

        return {
          title,
          id: id || songInfo.copyrightId,
          artist,
          artwork: formatImgUrl(artwork),
          album: songInfo.album || songInfo.albumName,
          lrc: lyricText,
          copyrightId: songInfo.copyrightId,
          lrcUrl: lyricInfo.lrcUrl || songLyricInfo.lrcUrl,
          mrcUrl: lyricInfo.mrcUrl || songLyricInfo.mrcUrl,
          trcUrl: lyricInfo.trcUrl || songLyricInfo.trcUrl,
        };
      })
      .filter(Boolean);

    const totalCount = Number(lyricData.totalCount || lyricData.total || 0);
    const isEnd = totalCount > 0 ? totalCount <= page * searchRows : lyrics.length < searchRows;

    return {
      isEnd,
      data: lyrics,
    };
  }

  try {
    const data = await searchBase(query, page, 7);
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    const lyrics = songs.map((result) => {
      const lyricInfo = extractLyricInfo(result);
      return {
        title: result.title,
        id: result.id,
        artist: result.artist,
        artwork: formatImgUrl(
          result.img3 ||
            result.img2 ||
            result.img1 ||
            result.picL ||
            result.picM ||
            result.picS ||
            result.cover ||
            result.songPic ||
            result.albumPic ||
            result.mediumPic
        ),
        lrc: cleanLyricText(result.lyrics),
        album: result.albumName,
        copyrightId: result.copyrightId,
        lrcUrl: lyricInfo.lrcUrl,
        mrcUrl: lyricInfo.mrcUrl,
        trcUrl: lyricInfo.trcUrl,
      };
    });

    return {
      isEnd: data && data.pgt ? +data.pageNo * searchRows >= data.pgt : songs.length < searchRows,
      data: lyrics,
    };
  } catch (error) {
    console.error('[咪咕] 旧歌词搜索失败:', error);
  }

  return {
    isEnd: true,
    data: [],
  };
}
async function getArtistAlbumWorks(artistItem, page) {
  // 使用搜索 API 获取歌手的专辑
  try {
    const result = await searchAlbum(artistItem.name, page);

    if (result && result.data) {
      // 过滤，只保留该歌手的专辑
      const albums = result.data.filter(album => {
        const albumArtist = album.artist?.toLowerCase() || '';
        const artistName = artistItem.name?.toLowerCase() || '';
        return albumArtist.includes(artistName) || artistName.includes(albumArtist);
      });

      return {
        isEnd: result.isEnd,
        data: albums,
      };
    }
  } catch (error) {
    console.error('[咪咕] 获取歌手专辑失败:', error.message);
  }

  return {
    isEnd: true,
    data: [],
  };
}
async function getArtistWorks(artistItem, page, type) {
  if (type === "music") {
    try {
      const res = await axios_1.default.get(
        `https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/song-list/release/`,
        {
          params: {
            singerId: artistItem.id,
            templateVersion: '2',
            needSimple: '01',
            pageNumber: page
          },
          transformResponse: [(data) => {
            if (typeof data === 'string') {
              try {
                // 修复无效 JSON：删除 subTitle1 字段（包含未转义的双引号）
                const fixedData = data.replace(/,\"subTitle1\":\s*\"[^}]*\}[^}]*\}\"/g, '');
                return JSON.parse(fixedData);
              } catch (e) {
                console.error('[咪咕] JSON 解析失败:', e.message);
                return { code: 'ERROR', data: {} };
              }
            }
            return data;
          }]
        }
      );

      if (res.data && res.data.code === '000000' && res.data.data?.contentItemList) {
        const itemsArray = res.data.data.contentItemList[0]?.itemList || [];
        // 从 itemList 中提取歌曲数据
        const items = itemsArray.map(item => item.song || item).filter(Boolean);

        return {
          data: items.map((item) => {
            const qualities = {};

            if (item.newRateFormats && Array.isArray(item.newRateFormats)) {
              item.newRateFormats.forEach((format) => {
                const size = format.size || format.androidSize;
                switch (format.formatType) {
                  case 'PQ':
                    qualities['128k'] = { size: sizeFormate(size), bitrate: 128000 };
                    break;
                  case 'HQ':
                    qualities['320k'] = { size: sizeFormate(size), bitrate: 320000 };
                    break;
                  case 'SQ':
                    qualities['flac'] = { size: sizeFormate(size), bitrate: 1411000 };
                    break;
                  case 'ZQ':
                  case 'ZQ24':
                    qualities['hires'] = { size: sizeFormate(size), bitrate: 2304000 };
                    break;
                }
              });
            }

            if (Object.keys(qualities).length === 0) {
              qualities['128k'] = { size: 'N/A', bitrate: 128000 };
            }

            let artwork = null;
            if (item.albumImgs && item.albumImgs.length > 0) {
              artwork = item.albumImgs[0].img;
            } else {
              artwork = item.img || item.cover;
            }

            let artist = '';
            if (item.artists && Array.isArray(item.artists)) {
              artist = item.artists.map(a => a.name).filter(Boolean).join(', ');
            } else if (item.singer) {
              artist = item.singer;
            }

            return {
              id: item.songId,
              artwork: formatImgUrl(artwork),
              title: item.songName || item.title,
              artist: artist,
              album: item.album || item.albumName,
              copyrightId: item.copyrightId,
              singerId: item.singerId,
              qualities: qualities,
              lrcUrl: item.lrcUrl,
              mrcUrl: item.mrcUrl,
              trcUrl: item.trcUrl,
            };
          }),
        };
      }
    } catch (error) {
      console.error('[咪咕] 获取歌手作品失败:', error.message);
    }

    return { data: [] };
  } else if (type === "album") {
    return getArtistAlbumWorks(artistItem, page);
  }
}
// 咪咕 MRC 解密和解析函数
const { Buffer } = require('buffer');

// TEA 解密常量和密钥
const DELTA = 2654435769n;
const MIN_LENGTH = 32;
const keyArr = [
  27303562373562475n,
  18014862372307051n,
  22799692160172081n,
  34058940340699235n,
  30962724186095721n,
  27303523720101991n,
  27303523720101998n,
  31244139033526382n,
  28992395054481524n,
];

// 辅助函数
const MAX = 9223372036854775807n;
const MIN = -9223372036854775808n;
const toLong = (str) => {
  const num = typeof str == 'string' ? BigInt('0x' + str) : str;
  if (num > MAX) return toLong(num - (1n << 64n));
  else if (num < MIN) return toLong(num + (1n << 64n));
  return num;
};

const toBigintArray = (data) => {
  const length = Math.floor(data.length / 16);
  const jArr = Array(length);
  for (let i = 0; i < length; i++) {
    jArr[i] = toLong(data.substring(i * 16, i * 16 + 16));
  }
  return jArr;
};

const longToBytes = (l) => {
  const result = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    result[i] = parseInt(l & 0xffn);
    l >>= 8n;
  }
  return result;
};

const longArrToString = (data) => {
  const arrayList = [];
  for (const j of data) arrayList.push(longToBytes(j).toString('utf16le'));
  return arrayList.join('');
};

const teaDecrypt = (data, key) => {
  const length = data.length;
  const lengthBigint = BigInt(length);
  if (length >= 1) {
    let j2 = data[0];
    let j3 = toLong((6n + 52n / lengthBigint) * DELTA);
    while (true) {
      let j4 = j3;
      if (j4 == 0n) break;
      let j5 = toLong(3n & toLong(j4 >> 2n));
      let j6 = lengthBigint;
      while (true) {
        j6--;
        if (j6 > 0n) {
          let j7 = data[j6 - 1n];
          let i = j6;
          j2 = toLong(
            data[i] -
              (toLong(toLong(j2 ^ j4) + toLong(j7 ^ key[toLong(toLong(3n & j6) ^ j5)])) ^
                toLong(
                  toLong(toLong(j7 >> 5n) ^ toLong(j2 << 2n)) +
                    toLong(toLong(j2 >> 3n) ^ toLong(j7 << 4n))
                ))
          );
          data[i] = j2;
        } else break;
      }
      let j8 = data[lengthBigint - 1n];
      j2 = toLong(
        data[0n] -
          toLong(
            toLong(toLong(key[toLong(toLong(j6 & 3n) ^ j5)] ^ j8) + toLong(j2 ^ j4)) ^
              toLong(
                toLong(toLong(j8 >> 5n) ^ toLong(j2 << 2n)) +
                  toLong(toLong(j2 >> 3n) ^ toLong(j8 << 4n))
              )
          )
      );
      data[0] = j2;
      j3 = toLong(j4 - DELTA);
    }
  }
  return data;
};

// MRC 解密函数
function decryptMrc(data) {
  if (data == null || data.length < MIN_LENGTH) return data;
  try {
    return longArrToString(teaDecrypt(toBigintArray(data), keyArr));
  } catch (error) {
    console.error('[咪咕] MRC解密失败:', error);
    return null;
  }
}

// MRC 解析函数（生成普通歌词和逐字歌词）
const mrcRegexps = {
  lineTime: /^\s*\[(\d+),\d+\]/,
  wordTime: /\(\d+,\d+\)/,
  wordTimeAll: /(\(\d+,\d+\))/g,
};

function parseMrc(str) {
  if (!str) return null;
  try {
    str = str.replace(/\r/g, '');
    const lines = str.split('\n');
    const lxlrcLines = [];
    const lrcLines = [];

    for (const line of lines) {
      if (line.length < 6) continue;
      let result = mrcRegexps.lineTime.exec(line);
      if (!result) continue;

      const startTime = parseInt(result[1]);
      let time = startTime;
      let ms = time % 1000;
      time /= 1000;
      let m = parseInt(time / 60).toString().padStart(2, '0');
      time %= 60;
      let s = parseInt(time).toString().padStart(2, '0');
      time = `${m}:${s}.${ms}`;

      let words = line.replace(mrcRegexps.lineTime, '');
      lrcLines.push(`[${time}]${words.replace(mrcRegexps.wordTimeAll, '')}`);

      // 生成逐字歌词
      let times = words.match(mrcRegexps.wordTimeAll);
      if (!times) continue;
      times = times.map((t) => {
        const r = /\((\d+),(\d+)\)/.exec(t);
        return `<${parseInt(r[1]) - startTime},${r[2]}>`;
      });
      const wordArr = words.split(mrcRegexps.wordTime);
      const newWords = times.map((t, index) => `${t}${wordArr[index]}`).join('');
      lxlrcLines.push(`[${time}]${newWords}`);
    }

    return {
      lyric: lrcLines.join('\n'),
      lxlyric: lxlrcLines.join('\n'),
    };
  } catch (error) {
    console.error('[咪咕] MRC解析失败:', error);
    return null;
  }
}

async function getMiGuMusicInfo(copyrightId) {
  try {
    const res = await axios_1.default.post(
      'https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?resourceType=2',
      `resourceId=${copyrightId}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36',
          'Referer': 'https://m.music.migu.cn/',
        },
      }
    );

    if (res.data && res.data.resource && res.data.resource.length > 0) {
      return res.data.resource[0];
    }
    return null;
  } catch (error) {
    console.error('[咪咕] 获取歌曲信息失败:', error);
    return null;
  }
}

async function fetchText(url) {
  if (!url) return '';
  try {
    const res = await axios_1.default.get(url, {
      headers: {
        'Referer': 'https://app.c.nf.migu.cn/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E)',
      },
    });
    return res.data || '';
  } catch (error) {
    console.error('[咪咕] 获取文本失败:', error);
    return '';
  }
}

async function getLyric(musicItem) {
  try {
    // 优先使用歌曲信息中已有的歌词URL
    const mrcUrl = musicItem.mrcUrl;
    const lrcUrl = musicItem.lrcUrl;
    const trcUrl = musicItem.trcUrl;

    // 如果歌曲信息中没有歌词URL，获取歌曲详细信息
    let musicInfo = null;
    if (!mrcUrl && !lrcUrl) {
      musicInfo = await getMiGuMusicInfo(musicItem.copyrightId);
    }

    // 注意：API返回的mrc字段名是 mrcurl (小写)
    const finalMrcUrl = mrcUrl || musicInfo?.mrcurl || musicInfo?.mrcUrl;
    const finalLrcUrl = lrcUrl || musicInfo?.lrcUrl;
    const finalTrcUrl = trcUrl || musicInfo?.trcUrl;

    if (!finalMrcUrl && !finalLrcUrl) {
      // 降级到原有API
      const headers = {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Host: "m.music.migu.cn",
        Referer: `https://m.music.migu.cn/migu/l/?s=149&p=163&c=5200&j=l&id=${musicItem.copyrightId}`,
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Mobile Safari/537.36 Edg/89.0.774.68",
      };
      const result = (
        await axios_1.default.get(
          "https://m.music.migu.cn/migu/remoting/cms_detail_tag",
          {
            headers,
            params: {
              cpid: musicItem.copyrightId,
            },
          }
        )
      ).data;
      return {
        rawLrc: result.data?.lyricLrc || '',
      };
    }

    // 并行获取歌词和译文
    let lyricPromise;

    // 优先使用 MRC（逐字歌词），其次 LRC
    if (finalMrcUrl) {
      lyricPromise = fetchText(finalMrcUrl).then(content => {
        if (!content) return null;
        const decrypted = decryptMrc(content);
        if (decrypted) {
          const parsed = parseMrc(decrypted);
          if (parsed) return parsed;
        }
        return null;
      });
    } else if (finalLrcUrl) {
      lyricPromise = fetchText(finalLrcUrl).then(text => ({
        lyric: text,
        lxlyric: '',
      }));
    }

    // 获取译文
    const translationPromise = finalTrcUrl
      ? fetchText(finalTrcUrl)
      : Promise.resolve('');

    if (!lyricPromise) {
      return { rawLrc: '' };
    }

    const [lyricResult, translation] = await Promise.all([lyricPromise, translationPromise]);

    if (!lyricResult) {
      return { rawLrc: '' };
    }

    // 返回歌词结果
    return {
      rawLrc: lyricResult.lyric || '',
      translation: translation || undefined,
    };
  } catch (error) {
    console.error('[咪咕] 获取歌词失败:', error);
    return { rawLrc: '' };
  }
}
async function getMusicSheetInfo(sheet, page) {
  try {
    // 处理歌单ID
    let sheetId = sheet.id || sheet;
    
    try {
      const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/user/queryMusicListSongs.do?musicListId=${sheetId}&pageNo=${page}&pageSize=30`;
      
      const res = await axios_1.default.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
          Referer: 'https://m.music.migu.cn/',
        },
      });
      
      if (res.data && res.data.code === '000000' && res.data.list) {
        const musicList = res.data.list.map((item) => {
          const qualities = {};
          const lyricInfo = extractLyricInfo(item);
          
          if (item.newRateFormats && Array.isArray(item.newRateFormats)) {
            item.newRateFormats.forEach((format) => {
              const size = format.size || format.androidSize || format.fileSize;
              
              switch (format.formatType) {
                case 'PQ': // 标准音质 128k
                  qualities['128k'] = {
                    size: sizeFormate(size),
                    bitrate: format.bitRate || 128000,
                  };
                  break;
                case 'HQ': // 高音质 320k
                  qualities['320k'] = {
                    size: sizeFormate(size),
                    bitrate: format.bitRate || 320000,
                  };
                  break;
                case 'SQ': // 无损音质 flac
                  qualities['flac'] = {
                    size: sizeFormate(size),
                    bitrate: format.bitRate || 1411000,
                  };
                  break;
                case 'ZQ': // Hi-Res音质
                case 'ZQ24':
                  qualities['hires'] = {
                    size: sizeFormate(size),
                    bitrate: format.bitRate || 2304000,
                  };
                  break;
              }
            });
          }
          
          // 如果没有newRateFormats，尝试从其他字段获取
          if (Object.keys(qualities).length === 0 && item.rateFormats) {
            const formats = item.rateFormats.split('|');
            formats.forEach((format) => {
              switch (format) {
                case 'PQ':
                  qualities['128k'] = { size: 'N/A', bitrate: 128000 };
                  break;
                case 'HQ':
                  qualities['320k'] = { size: 'N/A', bitrate: 320000 };
                  break;
                case 'SQ':
                  qualities['flac'] = { size: 'N/A', bitrate: 1411000 };
                  break;
                case 'ZQ':
                case 'ZQ24':
                  qualities['hires'] = { size: 'N/A', bitrate: 2304000 };
                  break;
              }
            });
          }
          
          // 确保至少有基础音质
          if (Object.keys(qualities).length === 0) {
            qualities['128k'] = { size: 'N/A', bitrate: 128000 };
          }
          
          // 处理歌手信息
          let artist = '';
          if (item.artists && Array.isArray(item.artists)) {
            artist = item.artists.map(a => a.name || a.artistName || '').filter(Boolean).join(', ');
          } else if (item.singer) {
            artist = item.singer;
          } else if (item.singerName) {
            artist = Array.isArray(item.singerName) ? item.singerName.join(', ') : item.singerName;
          }
          
          // 处理封面图片
          let artwork = null;
          if (item.albumImgs && item.albumImgs.length > 0) {
            artwork = formatImgUrl(item.albumImgs[0].img);
          } else {
            artwork = formatImgUrl(item.albumPic || item.img3 || item.img2 || item.img1);
          }

          return {
            id: item.songId || item.id,
            artwork: artwork,
            title: item.songName || item.name,
            artist: artist,
            album: item.album || item.albumName,
            copyrightId: item.copyrightId,
            singerId: item.singerId,
            qualities: qualities,
            lrcUrl: lyricInfo.lrcUrl,
            mrcUrl: lyricInfo.mrcUrl,
            trcUrl: lyricInfo.trcUrl,
          };
        });
        
        return {
          isEnd: res.data.totalCount <= page * 30,
          musicList: musicList,
        };
      }
    } catch (err) {
      console.log('[咪咕] MIGUM2.0 API获取歌单失败，尝试备用API:', err.message);
    }
    
    // 如果MIGUM2.0失败，尝试使用MIGUM3.0 API
    try {
      const time = Date.now().toString();
      const signData = createSignature(time, sheetId);
      
      const headers = {
        uiVersion: 'A_music_3.6.1',
        deviceId: signData.deviceId,
        timestamp: time,
        sign: signData.sign,
        channel: '0146921',
        'User-Agent':
          'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      };
      
      const url = `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${sheetId}&pageNo=${page}&pageSize=30`;
      const res = await axios_1.default.get(url, { headers });
      
      if (res.data && res.data.resource && res.data.resource.length > 0) {
        const musicList = res.data.resource.map((item) => {
          const qualities = {};
          const lyricInfo = extractLyricInfo(item);
          
          // 解析newRateFormats获取音质信息
          if (item.newRateFormats && Array.isArray(item.newRateFormats)) {
            item.newRateFormats.forEach((format) => {
              const formatInfo = format.split('|');
              if (formatInfo.length >= 4) {
                const formatType = formatInfo[0];
                const fileSize = parseInt(formatInfo[3]) || 0;
                const bitRate = parseInt(formatInfo[2]) || 0;
                
                switch (formatType) {
                  case 'PQ':
                    qualities['128k'] = {
                      size: sizeFormate(fileSize),
                      bitrate: bitRate || 128000,
                    };
                    break;
                  case 'HQ':
                    qualities['320k'] = {
                      size: sizeFormate(fileSize),
                      bitrate: bitRate || 320000,
                    };
                    break;
                  case 'SQ':
                    qualities['flac'] = {
                      size: sizeFormate(fileSize),
                      bitrate: bitRate || 1411000,
                    };
                    break;
                  case 'ZQ':
                  case 'ZQ24':
                    qualities['hires'] = {
                      size: sizeFormate(fileSize),
                      bitrate: bitRate || 2304000,
                    };
                    break;
                }
              }
            });
          }
          
          // 确保至少有基础音质
          if (Object.keys(qualities).length === 0) {
            qualities['128k'] = { size: 'N/A', bitrate: 128000 };
          }

          // 保存完整的歌手信息列表，用于歌手详情跳转
          const singerList = (item.singers || []).map(s => ({
            id: s.id || s.singerId,
            name: s.name || s.singerName,
            avatar: s.img || s.singerPic || "",
          }));

          return {
            id: item.songId || item.copyrightId || item.id,
            artwork: formatImgUrl(
              item.albumImgs && item.albumImgs.length > 0
                ? item.albumImgs[0].img
                : (item.img3 || item.img2 || item.img1 || item.cover)
            ),
            title: item.songName || item.name,
            artist: item.singer || formatSingerName(item.singers),
            singerList: singerList,
            album: item.album || item.albumName,
            copyrightId: item.copyrightId,
            singerId: item.singerId,
            qualities: qualities,
            lrcUrl: lyricInfo.lrcUrl,
            mrcUrl: lyricInfo.mrcUrl,
            trcUrl: lyricInfo.trcUrl,
          };
        });
        
        return {
          isEnd: res.data.totalCount <= page * 30,
          musicList: musicList,
        };
      }
    } catch (err) {
      console.log('[咪咕] MIGUM3.0 API也失败了，使用降级方案:', err.message);
    }
    
    // 如果两个API都失败，使用最基础的H5 API作为降级方案
    const res = (
      await axios_1.default.get(
        "https://m.music.migu.cn/migumusic/h5/playlist/songsInfo",
        {
          params: {
            palylistId: sheetId,
            pageNo: page,
            pageSize: 30,
          },
          headers: {
            Host: "m.music.migu.cn",
            referer: "https://m.music.migu.cn/v4/music/playlist/",
            By: "7242bd16f68cd9b39c54a8e61537009f",
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/113.0.0.0",
          },
        }
      )
    ).data.data;
    
    if (!res) {
      return {
        isEnd: true,
        musicList: [],
      };
    }
    
    const isEnd = res.total < 30;
    return {
      isEnd,
      musicList: res.items
        .filter((item) => {
          var _a;
          return (
            ((_a = item === null || item === void 0 ? void 0 : item.fullSong) ===
              null || _a === void 0
              ? void 0
              : _a.vipFlag) === 0
          );
        })
        .map((_) => {
          var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
          
          // 使用getMiGuQualitiesFromSong函数获取音质
          const qualities = getMiGuQualitiesFromSong(_);
          const lyricInfo = extractLyricInfo(_);
          
          return {
            id: _.id,
            artwork: formatImgUrl(_.mediumPic),
            title: _.name,
            artist:
              (_f =
                (_e =
                  (_d =
                    (_c =
                      (_b = _.singers) === null || _b === void 0
                        ? void 0
                        : _b.map) === null || _c === void 0
                      ? void 0
                      : _c.call(_b, (_) => _.name)) === null || _d === void 0
                    ? void 0
                    : _d.join) === null || _e === void 0
                  ? void 0
                  : _e.call(_d, ",")) !== null && _f !== void 0
                ? _f
                : "",
            album:
              (_h =
                (_g = _.album) === null || _g === void 0
                  ? void 0
                  : _g.albumName) !== null && _h !== void 0
                ? _h
                : "",
            copyrightId: _.copyrightId,
            singerId:
              (_k =
                (_j = _.singers) === null || _j === void 0 ? void 0 : _j[0]) ===
                null || _k === void 0
                ? void 0
                : _k.id,
            qualities: qualities,
            lrcUrl: lyricInfo.lrcUrl,
            mrcUrl: lyricInfo.mrcUrl,
            trcUrl: lyricInfo.trcUrl,
          };
        }),
    };
  } catch (error) {
    console.error('[咪咕] 获取歌单信息失败:', error);
    return {
      isEnd: true,
      musicList: [],
    };
  }
}
async function importMusicSheet(urlLike) {
  var _a, _b, _c, _d;
  let id;
  if (!id) {
    id = (urlLike.match(
      /https?:\/\/music\.migu\.cn\/v3\/(?:my|music)\/playlist\/([0-9]+)/
    ) || [])[1];
  }
  if (!id) {
    id = (urlLike.match(
      /https?:\/\/h5\.nf\.migu\.cn\/app\/v4\/p\/share\/playlist\/index.html\?.*id=([0-9]+)/
    ) || [])[1];
  }
  if (!id) {
    id =
      (_a = urlLike.match(/^\s*(\d+)\s*$/)) === null || _a === void 0
        ? void 0
        : _a[1];
  }
  if (!id) {
    const tempUrl =
      (_b = urlLike.match(/(https?:\/\/c\.migu\.cn\/[\S]+)\?/)) === null ||
      _b === void 0
        ? void 0
        : _b[1];
    if (tempUrl) {
      const request = (
        await axios_1.default.get(tempUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.61",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            host: "c.migu.cn",
          },
          validateStatus(status) {
            return (status >= 200 && status < 300) || status === 403;
          },
        })
      ).request;
      const realpath =
        (_c =
          request === null || request === void 0 ? void 0 : request.path) !==
          null && _c !== void 0
          ? _c
          : request === null || request === void 0
          ? void 0
          : request.responseURL;
      if (realpath) {
        id =
          (_d = realpath.match(/id=(\d+)/)) === null || _d === void 0
            ? void 0
            : _d[1];
      }
    }
  }
  if (!id) {
    return;
  }
  const headers = {
    host: "m.music.migu.cn",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Mobile Safari/537.36 Edg/89.0.774.68",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://m.music.migu.cn",
  };
  const res = (
    await axios_1.default.get(
      `https://m.music.migu.cn/migu/remoting/query_playlist_by_id_tag?onLine=1&queryChannel=0&createUserId=migu&contentCountMin=5&playListId=${id}`,
      {
        headers,
      }
    )
  ).data;
  const contentCount = parseInt(res.rsp.playList[0].contentCount);
  const cids = [];
  let pageNo = 1;
  while ((pageNo - 1) * 20 < contentCount) {
    const listPage = (
      await axios_1.default.get(
        `https://music.migu.cn/v3/music/playlist/${id}?page=${pageNo}`
      )
    ).data;
    const $ = (0, cheerio_1.load)(listPage);
    $(".row.J_CopySong").each((i, v) => {
      cids.push($(v).attr("data-cid"));
    });
    pageNo += 1;
  }
  if (cids.length === 0) {
    return;
  }
  const songs = (
    await (0, axios_1.default)({
      url: `https://music.migu.cn/v3/api/music/audioPlayer/songs?type=1&copyrightId=${cids.join(
        ","
      )}`,
      headers: {
        referer: "http://m.music.migu.cn/v3",
      },
      xsrfCookieName: "XSRF-TOKEN",
      withCredentials: true,
    })
  ).data;
  return songs.items
    .filter((_) => _.vipFlag === 0)
    .map((_) => {
      var _a, _b, _c, _d, _e, _f;
      const lyricInfo = extractLyricInfo(_);
      return {
        id: _.songId,
        artwork: formatImgUrl(_.picL || _.picM || _.picS || _.cover || _.songPic),
        title: _.songName,
        artist:
          (_b =
            (_a = _.singers) === null || _a === void 0
              ? void 0
              : _a.map((_) => _.artistName)) === null || _b === void 0
            ? void 0
            : _b.join(", "),
        album:
          (_d = (_c = _.albums) === null || _c === void 0 ? void 0 : _c[0]) ===
            null || _d === void 0
            ? void 0
            : _d.albumName,
        copyrightId: _.copyrightId,
        singerId:
          (_f = (_e = _.singers) === null || _e === void 0 ? void 0 : _e[0]) ===
            null || _f === void 0
            ? void 0
            : _f.artistId,
        qualities: getMiGuQualitiesFromSong(_), // 添加音质检测
        lrcUrl: lyricInfo.lrcUrl,
        mrcUrl: lyricInfo.mrcUrl,
        trcUrl: lyricInfo.trcUrl,
      };
    });
}
// 榜单列表
const boardList = [
  { id: '27553319', name: '尖叫新歌榜', bangid: '27553319', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/dk/3ebe613aca744a7c95e29d7e8e91f2e7' },
  { id: '27186466', name: '尖叫热歌榜', bangid: '27186466', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/dh/ab6099687adc46febf73f885107ddb37' },
  { id: '27553408', name: '尖叫原创榜', bangid: '27553408', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/dh/e98a179c357c436d8e2746fcbe64dda2' },
  { id: '75959118', name: '音乐风向榜', bangid: '75959118', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/hh/72ea2a03dd554a5abded58a49af05d32' },
  { id: '76557036', name: '彩铃分贝榜', bangid: '76557036', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/hi/c50f0baa268c486290cb35394ac0f8a0' },
  { id: '76557745', name: '会员臻爱榜', bangid: '76557745', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/hi/eab41af2aee7487cbb4b11b187f0dddb' },
  { id: '23189800', name: '港台榜', bangid: '23189800', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/dh/2d827a0ea8ea459992a9add11adba63e' },
  { id: '23189399', name: '内地榜', bangid: '23189399', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/di/b0fcbed68fa642048a5ebef817235c72' },
  { id: '19190036', name: '欧美榜', bangid: '19190036', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/dh/a97fbb1b8fd04f6eb648a05be773c87c' },
  { id: '83176390', name: '国风金曲榜', bangid: '83176390', coverImg: 'https://d.musicapp.migu.cn/data/oss/column/00/1w/di/b0fcbed68fa642048a5ebef817235c72' },
];

async function getTopLists() {
  const yinyue = {
    title: "咪咕音乐榜",
    data: boardList.slice(0, 6).map(item => ({
      id: item.bangid,
      title: item.name,
      coverImg: item.coverImg,
    })),
  };

  const diqu = {
    title: "地区榜",
    data: boardList.slice(6).map(item => ({
      id: item.bangid,
      title: item.name,
      coverImg: item.coverImg,
    })),
  };

  return [yinyue, diqu];
}
const UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Mobile Safari/537.36 Edg/89.0.774.68";
const By = CryptoJS.MD5(UA).toString();

async function getTopListDetail(topListItem) {
  const bangid = topListItem.id;

  try {
    const res = await axios_1.default.get(
      `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querycontentbyId.do?columnId=${bangid}&needAll=0`,
      {
        headers: {
          Referer: 'https://app.c.nf.migu.cn/',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36',
          channel: '0146921',
        },
      }
    );

    if (res.data && res.data.code === '000000' && res.data.columnInfo && res.data.columnInfo.contents) {
      const musicList = res.data.columnInfo.contents.map(item => {
        const songInfo = item.objectInfo || item;
        const qualities = {};

        // 解析音质信息
        if (songInfo.newRateFormats && Array.isArray(songInfo.newRateFormats)) {
          songInfo.newRateFormats.forEach((format) => {
            const size = format.size || format.androidSize;
            switch (format.formatType) {
              case 'PQ':
                qualities['128k'] = { size: sizeFormate(size), bitrate: 128000 };
                break;
              case 'HQ':
                qualities['320k'] = { size: sizeFormate(size), bitrate: 320000 };
                break;
              case 'SQ':
                qualities['flac'] = { size: sizeFormate(size), bitrate: 1411000 };
                break;
              case 'ZQ':
              case 'ZQ24':
                qualities['hires'] = { size: sizeFormate(size), bitrate: 2304000 };
                break;
            }
          });
        }

        if (Object.keys(qualities).length === 0) {
          qualities['128k'] = { size: 'N/A', bitrate: 128000 };
        }

        // 处理封面
        let artwork = null;
        if (songInfo.albumImgs && songInfo.albumImgs.length > 0) {
          artwork = songInfo.albumImgs[0].img;
        } else if (songInfo.albumPic) {
          artwork = songInfo.albumPic;
        } else if (songInfo.img3 || songInfo.img2 || songInfo.img1) {
          artwork = songInfo.img3 || songInfo.img2 || songInfo.img1;
        } else if (songInfo.cover) {
          artwork = songInfo.cover;
        } else if (songInfo.mediumPic || songInfo.largePic || songInfo.smallPic) {
          artwork = songInfo.largePic || songInfo.mediumPic || songInfo.smallPic;
        }
        artwork = formatImgUrl(artwork);

        // 处理歌手
        let artist = '';
        if (songInfo.artists && Array.isArray(songInfo.artists)) {
          artist = songInfo.artists.map(a => a.name).filter(Boolean).join(', ');
        } else if (songInfo.singer) {
          artist = songInfo.singer;
        } else if (songInfo.singerName) {
          artist = Array.isArray(songInfo.singerName) ? songInfo.singerName.join(', ') : songInfo.singerName;
        }

        return {
          id: songInfo.songId,
          artwork: artwork,
          title: songInfo.songName,
          artist: artist,
          album: songInfo.album || songInfo.albumName,
          copyrightId: songInfo.copyrightId,
          singerId: songInfo.singerId,
          lrcUrl: songInfo.lrcUrl,
          mrcUrl: songInfo.mrcUrl,
          trcUrl: songInfo.trcUrl,
          qualities: qualities,
        };
      });

      return {
        ...topListItem,
        musicList: musicList,
      };
    }
  } catch (error) {
    console.error('[咪咕] 获取榜单详情失败，使用备用API:', error.message);
  }

  // 备用 API
  const res = await axios_1.default.get(
    `https://m.music.migu.cn/migumusic/h5/billboard/home`,
    {
      params: {
        pathName: bangid,
        pageNum: 1,
        pageSize: 100,
      },
      headers: {
        Accept: "*/*",
        Host: "m.music.migu.cn",
        referer: `https://m.music.migu.cn/v4/music/top/${bangid}`,
        "User-Agent": UA,
        By,
      },
    }
  );

  if (res.data && res.data.data && res.data.data.songs) {
    return {
      ...topListItem,
      musicList: res.data.data.songs.items.map((_) => {
        // 处理封面
        let artwork = null;
        if (_.albumImgs && _.albumImgs.length > 0) {
          artwork = _.albumImgs[0].img;
        } else {
          artwork = _.mediumPic || _.largePic || _.smallPic || _.img || _.cover;
        }

        return {
          id: _.id,
          artwork: formatImgUrl(artwork),
          title: _.name,
          artist: _.singers?.map(s => s.name).join(', ') || '',
          album: _.album?.albumName || '',
          copyrightId: _.copyrightId,
          singerId: _.singers?.[0]?.id,
          qualities: getMiGuQualitiesFromSong(_),
        };
      }),
    };
  }

  return { ...topListItem, musicList: [] };
}
async function getRecommendSheetTags() {
  try {
    const res = await axios_1.default.get(
      'https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-taglist/release',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
          Referer: 'https://m.music.migu.cn/',
        },
      }
    );

    if (res.data && res.data.code === '000000' && res.data.data) {
      const rawList = res.data.data;

      // 解析热门标签
      const hotTags = rawList[0]?.content?.map(item => ({
        id: item.texts?.[1] || item.tagId,
        title: item.texts?.[0] || item.tagName,
      })) || [];

      // 解析分类标签
      const data = rawList.slice(1).map(group => ({
        title: group.header?.title || group.name,
        data: (group.content || []).map(item => ({
          id: item.texts?.[1] || item.tagId,
          title: item.texts?.[0] || item.tagName,
        })),
      }));

      return {
        pinned: hotTags.slice(0, 8),
        data,
      };
    }
  } catch (error) {
    console.error('[咪咕] 获取歌单标签失败，使用备用API:', error.message);
  }

  // 备用 API
  try {
    const allTags = (
      await axios_1.default.get(
        "https://m.music.migu.cn/migumusic/h5/playlist/allTag",
        {
          headers: {
            host: "m.music.migu.cn",
            referer: "https://m.music.migu.cn/v4/music/playlist",
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/113.0.0.0",
            By: "7242bd16f68cd9b39c54a8e61537009f",
          },
        }
      )
    ).data.data.tags;

    const data = allTags.map((_) => ({
      title: _.tagName,
      data: _.tags.map((t) => ({
        id: t.tagId,
        title: t.tagName,
      })),
    }));

    return {
      pinned: [
        { title: "流行", id: "1000001672" },
        { title: "伤感", id: "1000001795" },
        { title: "电影", id: "1001076080" },
        { title: "经典老歌", id: "1000001635" },
        { title: "中国风", id: "1000001675" },
        { title: "翻唱", id: "1000001831" },
      ],
      data,
    };
  } catch (e) {
    return { pinned: [], data: [] };
  }
}
async function getRecommendSheetsByTag(sheetItem, page) {
  const pageSize = 30;
  const tagId = sheetItem?.id || '';

  try {
    let url;
    if (!tagId) {
      // 无标签时获取推荐列表
      url = `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0?templateVersion=2&pageNo=${page}`;
    } else {
      // 有标签时按标签获取
      url = `https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-listbytag/release?pageNumber=${page}&templateVersion=2&tagId=${tagId}`;
    }

    const res = await axios_1.default.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
        Referer: 'https://m.music.migu.cn/',
      },
    });

    if (res.data && res.data.code === '000000' && res.data.data) {
      let list = [];

      // 处理不同格式的返回数据
      if (res.data.data.contents) {
        // 递归提取歌单
        const extractPlaylists = (contents, result = [], ids = new Set()) => {
          for (const item of contents) {
            if (item.contents) {
              extractPlaylists(item.contents, result, ids);
            } else if (item.resType === '2021' && !ids.has(item.resId)) {
              ids.add(item.resId);
              result.push({
                id: String(item.resId),
                title: item.txt,
                artwork: formatImgUrl(item.img),
                artist: '',
                description: item.txt2 || '',
              });
            }
          }
          return result;
        };
        list = extractPlaylists(res.data.data.contents);
      } else if (res.data.data.contentItemList) {
        // 另一种格式
        const itemList = res.data.data.contentItemList[1]?.itemList || res.data.data.contentItemList[0]?.itemList || [];
        list = itemList.map(item => ({
          id: String(item.logEvent?.contentId || item.id),
          title: item.title,
          artwork: formatImgUrl(item.imageUrl),
          artist: '',
          playCount: item.barList?.[0]?.title || '',
        }));
      }

      if (list.length > 0) {
        return {
          isEnd: list.length < pageSize,
          data: list,
        };
      }
    }
  } catch (error) {
    console.error('[咪咕] 获取推荐歌单失败，使用备用API:', error.message);
  }

  // 备用 API
  const res = (
    await axios_1.default.get(
      "https://m.music.migu.cn/migumusic/h5/playlist/list",
      {
        params: {
          columnId: 15127272,
          tagId: tagId,
          pageNum: page,
          pageSize,
        },
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/113.0.0.0",
          host: "m.music.migu.cn",
          By: "7242bd16f68cd9b39c54a8e61537009f",
          Referer: "https://m.music.migu.cn/v4/music/playlist",
        },
      }
    )
  ).data.data;

  const isEnd = page * pageSize > res.total;
  const data = res.items.map((_) => ({
    id: _.playListId,
    artist: _.createUserName,
    title: _.playListName,
    artwork: formatImgUrl(_.image),
    playCount: _.playCount,
    createUserId: _.createUserId,
  }));

  return {
    isEnd,
    data,
  };
}
const qualityLevels = {
  "128k": "128k",
  "320k": "320k",
  "flac": "flac",
  "hires": "hires",
};
async function getMediaSource(musicItem, quality) {
  try {
    // 检查音质信息
    if (musicItem.qualities && Object.keys(musicItem.qualities).length > 0) {
      // 如果歌曲不支持请求的音质，返回错误
      if (!musicItem.qualities[quality]) {
        console.error(`[咪咕] 歌曲不支持音质 ${quality}`);
        throw new Error(`该歌曲不支持 ${quality} 音质`);
      }
    }
    
    const res = await requestMusicUrl('mg', musicItem.copyrightId, qualityLevels[quality] || quality);
    
    if (res.code === 200 && res.url) {
      return {
        url: res.url
      };
    } else {
      console.error(`[咪咕] 获取播放链接失败: ${res.msg || '未知错误'}`);
      return null;
    }
  } catch (error) {
    console.error(`[咪咕] 获取播放源错误: ${error.message}`);
    throw error;
  }
}
async function getMusicComments(musicItem, page = 1) {
  const pageSize = 20;

  try {
    // 使用简化的API，直接使用songId作为targetId
    const targetId = musicItem.id || musicItem.copyrightId;

    const res = await axios_1.default.get(
      `https://music.migu.cn/v3/api/comment/listComments`,
      {
        params: {
          targetId: targetId,
          pageSize: pageSize,
          pageNo: page,
        },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4195.1 Safari/537.36',
          Referer: 'https://music.migu.cn',
        },
      }
    );

    if (res.status !== 200 || res.data.returnCode !== '000000') {
      return { isEnd: true, data: [] };
    }

    const comments = (res.data.data?.items || []).map((item) => ({
      id: item.commentId?.toString(),
      nickName: item.author?.name || '',
      avatar: item.author?.avatar?.startsWith('//')
        ? `http:${item.author.avatar}`
        : item.author?.avatar,
      comment: item.body || '',
      like: item.praiseCount,
      createAt: item.createTime ? new Date(item.createTime).getTime() : null,
      replies: (item.replyCommentList || []).map((c) => ({
        id: c.commentId?.toString(),
        nickName: c.author?.name || '',
        avatar: c.author?.avatar?.startsWith('//')
          ? `http:${c.author.avatar}`
          : c.author?.avatar,
        comment: c.body || '',
        like: c.praiseCount,
        createAt: c.createTime ? new Date(c.createTime).getTime() : null,
      })),
    }));

    const total = res.data.data?.itemTotal || 0;

    return {
      isEnd: page * pageSize >= total,
      data: comments,
    };
  } catch (error) {
    console.error('[咪咕] 获取评论失败:', error);
    return { isEnd: true, data: [] };
  }
}

// 通过ID获取歌曲完整信息（用于PlayById功能）
async function getMusicInfo(musicBase) {
  // 如果已有完整信息（artwork和qualities），直接返回，避免重复请求
  if (musicBase.artwork && musicBase.qualities && Object.keys(musicBase.qualities).length > 0) {
    return {
      id: musicBase.id,
      copyrightId: musicBase.copyrightId,
      title: musicBase.title,
      artist: musicBase.artist,
      album: musicBase.album,
      albumId: musicBase.albumId,
      artwork: musicBase.artwork,
      qualities: musicBase.qualities,
      platform: '咪咕音乐',
    };
  }

  const songId = musicBase.id || musicBase.copyrightId || musicBase.songId;
  if (!songId) {
    console.error('[咪咕] getMusicInfo: 缺少有效的歌曲ID');
    return null;
  }

  try {
    const time = Date.now().toString();
    const signData = createSignature(time, songId);

    // 使用搜索API通过ID查找歌曲
    const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=10&text=${encodeURIComponent(songId)}&pageNo=1&sort=0&sid=USS`;

    const res = await axios_1.default.get(url, {
      headers: {
        uiVersion: 'A_music_3.6.1',
        deviceId: signData.deviceId,
        timestamp: time,
        sign: signData.sign,
        channel: '0146921',
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      },
    });

    if (res.data && res.data.code === '000000' && res.data.songResultData) {
      const resultList = res.data.songResultData.resultList || [];

      // 查找匹配的歌曲
      for (const itemArray of resultList) {
        if (!Array.isArray(itemArray)) continue;

        for (const item of itemArray) {
          // 检查是否匹配ID
          if (item.songId === songId || item.copyrightId === songId ||
              String(item.songId) === String(songId) || String(item.copyrightId) === String(songId)) {

            // 构建音质信息
            const qualities = {};
            if (item.audioFormats && Array.isArray(item.audioFormats)) {
              item.audioFormats.forEach((format) => {
                const size = format.asize || format.isize || format.fileSize;
                switch (format.formatType) {
                  case 'PQ': qualities['128k'] = { size: sizeFormate(size) }; break;
                  case 'HQ': qualities['320k'] = { size: sizeFormate(size) }; break;
                  case 'SQ': qualities['flac'] = { size: sizeFormate(size) }; break;
                  case 'ZQ24': qualities['hires'] = { size: sizeFormate(size) }; break;
                }
              });
            }
            if (Object.keys(qualities).length === 0) {
              qualities['128k'] = {};
              qualities['320k'] = {};
            }

            let artwork = item.img3 || item.img2 || item.img1 || null;
            if (artwork && !/https?:/.test(artwork)) artwork = 'http://d.musicapp.migu.cn' + artwork;

            // 保存完整的歌手信息列表，用于歌手详情跳转
            const singerList = (item.singerList || []).map(s => ({
              id: s.id || s.singerId,
              name: s.name || s.singerName,
            }));

            return {
              id: item.songId,
              copyrightId: item.copyrightId,
              title: item.name || item.songName,
              artist: formatSingerName(item.singerList) || item.artist,
              singerList: singerList,
              album: item.album || item.albumName,
              albumId: item.albumId,
              artwork: artwork,
              duration: item.duration ? Math.floor(item.duration / 1000) : undefined,
              qualities: qualities,
              platform: '咪咕音乐',
            };
          }
        }
      }
    }

    console.error('[咪咕] getMusicInfo: 未找到歌曲信息');
    return null;
  } catch (error) {
    console.error('[咪咕] getMusicInfo 错误:', error.message);
    return null;
  }
}

module.exports = {
  platform: "咪咕音乐",
  author: "Toskysun",
  version: "0.2.8",
  appVersion: ">0.1.0-alpha.0",
  // 声明插件支持的音质列表（基于咪咕音乐实际提供的音质）
  supportedQualities: ["128k", "320k", "flac", "hires"],
  hints: {
    importMusicSheet: [
      "咪咕APP：自建歌单-分享-复制链接，直接粘贴即可",
      "H5/PC端：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待",
    ],
  },
  primaryKey: ["copyrightId"],
  cacheControl: "cache",
  srcUrl: UPDATE_URL,
  supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
  getMediaSource,
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
  async getAlbumInfo(albumItem) {
    // 通过搜索专辑名歌曲获取正确的albumId
    async function findCorrectAlbumId(albumName, artistName) {
      try {
        const time = Date.now().toString();
        const query = albumName;
        const signData = createSignature(time, query);

        const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=30&text=${encodeURIComponent(query)}&pageNo=1&sort=0&sid=USS`;

        const res = await axios_1.default.get(url, {
          headers: {
            uiVersion: 'A_music_3.6.1',
            deviceId: signData.deviceId,
            timestamp: time,
            sign: signData.sign,
            channel: '0146921',
            'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
          },
        });

        if (res.data && res.data.code === '000000' && res.data.songResultData) {
          const songs = res.data.songResultData.resultList || [];
          for (const songArray of songs) {
            for (const song of (Array.isArray(songArray) ? songArray : [songArray])) {
              if (song.album === albumName && song.albumId) {
                return song.albumId;
              }
            }
          }
          // 如果没找到完全匹配的，返回第一个有albumId的结果
          for (const songArray of songs) {
            for (const song of (Array.isArray(songArray) ? songArray : [songArray])) {
              if (song.albumId) {
                return song.albumId;
              }
            }
          }
        }
      } catch (e) {
        console.error('[咪咕] 搜索专辑ID失败:', e.message);
      }
      return null;
    }

    // 获取专辑歌曲列表
    async function getAlbumSongs(albumId) {
      try {
        const res = await axios_1.default.get(
          `http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${albumId}&pageNo=1`
        );

        return res.data?.data || res.data;
      } catch (error) {
        console.error('[咪咕] 获取专辑歌曲失败:', error.message);
        return null;
      }
    }

    let albumId = albumItem.id;
    let musicListData = null;

    // 先尝试用原始ID获取
    const data = await getAlbumSongs(albumId);
    if (data && data.songList && data.songList.length > 0) {
      musicListData = data;
    }

    // 如果原始ID不工作，通过搜索获取正确的albumId
    if (!musicListData) {
      const correctId = await findCorrectAlbumId(albumItem.title, albumItem.artist);
      if (correctId) {
        albumId = correctId;
        const data2 = await getAlbumSongs(albumId);
        if (data2 && data2.songList && data2.songList.length > 0) {
          musicListData = data2;
        }
      }
    }

    if (!musicListData || !musicListData.songList) {
      return {
        albumItem: { description: albumItem.description || '' },
        musicList: [],
      };
    }

    return {
      albumItem: { description: albumItem.description || '' },
      musicList: musicListData.songList.map((item) => {
        const qualities = {};
        if (item.newRateFormats && Array.isArray(item.newRateFormats)) {
          item.newRateFormats.forEach((format) => {
            const size = format.size || format.androidSize;
            switch (format.formatType) {
              case 'PQ':
                qualities['128k'] = { size: sizeFormate(size), bitrate: 128000 };
                break;
              case 'HQ':
                qualities['320k'] = { size: sizeFormate(size), bitrate: 320000 };
                break;
              case 'SQ':
                qualities['flac'] = { size: sizeFormate(size), bitrate: 1411000 };
                break;
              case 'ZQ':
              case 'ZQ24':
                qualities['hires'] = { size: sizeFormate(size), bitrate: 2304000 };
                break;
            }
          });
        }
        if (Object.keys(qualities).length === 0) {
          qualities['128k'] = { size: 'N/A', bitrate: 128000 };
        }

        let artwork = null;
        if (item.albumImgs && item.albumImgs.length > 0) {
          artwork = item.albumImgs[0].img;
        }

        let artist = '';
        if (item.artists && Array.isArray(item.artists)) {
          artist = item.artists.map(a => a.name).filter(Boolean).join(', ');
        } else if (item.singer) {
          artist = item.singer;
        }

        return {
          id: item.songId,
          artwork: formatImgUrl(artwork),
          title: item.songName,
          artist: artist,
          album: item.album || albumItem.title,
          copyrightId: item.copyrightId,
          singerId: item.singerId,
          qualities: qualities,
        };
      }),
    };
  },
  getArtistWorks: getArtistWorks,
  getLyric: getLyric,
  importMusicSheet,
  getTopLists,
  getTopListDetail,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getMusicSheetInfo,
  getMusicComments,
  getMusicInfo,
};
