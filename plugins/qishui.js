"use strict";

Object.defineProperty(exports, "__esModule", {
  "value": true
});

const axios = require("axios");

const PAGE_SIZE = 20;

const DOUYIN_IMAGE_BASE_URL = "https://p3-luna.douyinpic.com/img/";

const QISHUI_API_HEADERS = {
  "Accept": "*/*",
  "Content-Type": "application/json; charset=UTF-8",
  "User-Agent": "com.luna.music/100159040 (Linux; U; Android 11; zh_CN; Cronet/TTNetVersion:dd1b0931 2024-06-28 QuicVersion:d299248d 2024-04-09)",
  "X-Argus": "=",
  "x-common-params-v2": "channel=appstore&aid=8478&device_id=1100210274091033"
};

const AUDIO_PLAYBACK_HEADERS = {
  "Accept": "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Range": "bytes=0-",
  "Referer": "https://www.douyin.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36"
};

const QISHUI_WEB_SHARE_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
};

const QISHUI_WEB_SHARE_URL = "https://music.douyin.com/qishui/share/playlist";

const QISHUI_TOP_LIST_ITEMS = [{
  "id": "7036274230471712007",
  "description": "汽水音乐内每周热度最高的50首歌，每周四更新",
  "coverImg": "https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/d0d8d48461a62748e84689cdf049b19a.png~tplv-b829550vbb-resize:960:960.png",
  "title": "热歌榜"
}, {
  "id": "7060812597884869927",
  "description": "近期发行的热度最高的50首新歌，每周四更新",
  "coverImg": "https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/f12f7eb5b54d0899c7c724df009668a8.png~tplv-b829550vbb-resize:960:960.png",
  "title": "新歌榜"
}, {
  "id": "7061475546400005410",
  "description": "汽水音乐内每周热度最高的50首外文歌曲，每周四更新",
  "coverImg": "https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/33747550ed5499b58feda42a21748637.png~tplv-b829550vbb-resize:960:960.png",
  "title": "欧美榜"
}, {
  "id": "7415959718721494311",
  "description": "抖音音乐人开放平台上传歌曲，综合每周站内热度进行排序展示",
  "coverImg": "https://p3-luna.douyinpic.com/img/tos-cn-v-2774c002/o8FQKiQQBxHWa2hzsBNAgYOX6iEHEAibADAbfB~tplv-b829550vbb-resize:960:960.png",
  "title": "音乐人歌曲榜"
}];

const QISHUI_TOP_LIST_IDS = new Set(QISHUI_TOP_LIST_ITEMS.map(item => String(item.id)));

const QISHUI_FALLBACK_PLAYLISTS = [{
  "id": "7434476168507637799",
  "title": "旅行者必听｜原神全部专辑上线✨",
  "artist": "汽水音乐APP",
  "createUserId": "2331429247649368",
  "description": "汽水音乐公开歌单",
  "artwork": "https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/c2da1ff20dcb4a168117392c7964b6d0~tplv-b829550vbb-crop-center:720:720.jpg",
  "createTime": 1730981418,
  "fee": 0,
  "_bakaSourceType": "playlist"
}];

function buildDouyinImageUrl(uri, templatePrefix, size = '960:960') {
  return `${DOUYIN_IMAGE_BASE_URL}${uri}~${templatePrefix}-resize:${size}.png`;
}

function buildImageUrlFromCover(urlCover, size = "960:960") {
  if (!urlCover) return "";
  if (typeof urlCover === "string") return urlCover;

  if (urlCover.uri && urlCover.template_prefix) {
    return buildDouyinImageUrl(urlCover.uri, urlCover.template_prefix, size);
  }

  if (Array.isArray(urlCover.urls) && urlCover.urls.length > 0 && urlCover.uri) {
    return `${urlCover.urls[0]}${urlCover.uri}`;
  }

  return "";
}

function buildSingerList(artists = []) {
  return artists.map(artist => ({
    id: artist.id,
    name: artist.name,
    avatar: artist.avatar || buildImageUrlFromCover(artist.url_avatar, "100:100") || "",
  }));
}

function extractRouterData(html) {
  if (!html || typeof html !== "string") return null;

  const assignment = "_ROUTER_DATA = ";
  const startIndex = html.indexOf(assignment);
  if (startIndex === -1) return null;

  const jsonStart = startIndex + assignment.length;
  let jsonEnd = html.indexOf(";\nfunction runWindowFn", jsonStart);

  if (jsonEnd === -1) {
    jsonEnd = html.indexOf(";</script>", jsonStart);
  }

  if (jsonEnd === -1) return null;

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch (error) {
    return null;
  }
}

function parseWebPlaylistDetail(html) {
  const routerData = extractRouterData(html);
  const playlistPage = routerData?.loaderData?.playlist_page;

  if (!playlistPage) return null;

  return {
    "playlistInfo": playlistPage.playlistInfo || null,
    "media_resources": Array.isArray(playlistPage.medias) ? playlistPage.medias : []
  };
}

function hasValidPlaylistDetail(playlistDetail) {
  return !!playlistDetail && Array.isArray(playlistDetail.media_resources) && playlistDetail.media_resources.length > 0;
}

function createRecommendSheetFromTopList(topListItem) {
  return {
    "id": topListItem.id,
    "title": topListItem.title,
    "artist": "汽水音乐",
    "createUserId": "",
    "description": topListItem.description,
    "artwork": topListItem.coverImg,
    "createTime": 0,
    "fee": 0,
    "_bakaSourceType": "toplist"
  };
}

function getFallbackRecommendSheets() {
  return QISHUI_FALLBACK_PLAYLISTS
    .concat(QISHUI_TOP_LIST_ITEMS.map(createRecommendSheetFromTopList))
    .map(item => Object.assign({}, item));
}

function getVipFee(isVipOnly) {
  return isVipOnly === true ? 1 : 0;
}

function parseSearchResultItem(searchItem) {
  const vipFee = getVipFee(searchItem?.["qishui_label_info"]?.["only_vip_playable"]);

  const qualities = {
    "128k": { bitrate: 128000 },
    "320k": { bitrate: 320000 },
    "flac": { bitrate: 1411000 },
  };

  const authorInfo = searchItem.author_info || {};
  const singerList = (authorInfo.id || authorInfo.name) ? [{
    id: authorInfo.id,
    name: authorInfo.name,
    avatar: authorInfo.avatar || "",
  }] : [];

  return {
    "id": searchItem.item_id,
    "title": searchItem.title,
    "artist": searchItem.author_info.name,
    "singerList": singerList,
    "artwork": searchItem.cover_url,
    "duration": searchItem.duration,
    "qualities": qualities,
    "fee": vipFee
  };
}

function parseRankTrackItem(rankItem) {
  const track = rankItem.track;
  const vipFee = getVipFee(track?.["label_info"]?.["only_vip_playable"]);
  const coverUri = track.album.url_cover.uri;
  const coverTemplate = track.album.url_cover.template_prefix;

  const qualities = {
    "128k": { bitrate: 128000 },
    "320k": { bitrate: 320000 },
    "flac": { bitrate: 1411000 },
  };

  const singerList = (track.artists || []).map(a => ({
    id: a.id,
    name: a.name,
    avatar: a.avatar || "",
  }));

  return {
    "id": track.id,
    "title": track.name,
    "artist": track.artists[0].name,
    "artistId": track.artists[0].id,
    "singerList": singerList,
    "album": track.album.name,
    "albumId": track.album.id,
    "artwork": buildDouyinImageUrl(coverUri, coverTemplate),
    "duration": track.duration ? Math.floor(track.duration / 1000) : undefined,
    "qualities": qualities,
    "fee": vipFee
  };
}

function parseTrackItem(track) {
  const vipFee = getVipFee(track?.["label_info"]?.["only_vip_playable"]);
  const coverUri = track.album.url_cover.uri;
  const coverTemplate = track.album.url_cover.template_prefix;

  const qualities = {
    "128k": { bitrate: 128000 },
    "320k": { bitrate: 320000 },
    "flac": { bitrate: 1411000 },
  };

  const singerList = (track.artists || []).map(a => ({
    id: a.id,
    name: a.name,
    avatar: a.avatar || "",
  }));

  return {
    "id": track.id,
    "title": track.name,
    "artist": track.artists[0].name,
    "artistId": track.artists[0].id,
    "singerList": singerList,
    "album": track.album.name,
    "albumId": track.album.id,
    "artwork": buildDouyinImageUrl(coverUri, coverTemplate),
    "duration": track.duration ? Math.floor(track.duration / 1000) : undefined,
    "qualities": qualities,
    "fee": vipFee
  };
}

function parsePlaylistMediaResource(mediaResource) {
  const track = mediaResource?.entity?.track_wrapper?.track
    || mediaResource?.entity?.track
    || mediaResource?.track;

  if (!track) return null;

  const vipFee = getVipFee(track?.["label_info"]?.["only_vip_playable"]);
  const album = track.album || {};
  const primaryArtist = Array.isArray(track.artists) && track.artists.length > 0 ? track.artists[0] : {};

  const qualities = {
    "128k": { bitrate: 128000 },
    "320k": { bitrate: 320000 },
    "flac": { bitrate: 1411000 },
  };

  return {
    "id": track.id,
    "title": track.name,
    "artist": primaryArtist.name || "",
    "artistId": primaryArtist.id,
    "singerList": buildSingerList(track.artists || []),
    "album": album.name || "",
    "albumId": album.id,
    "artwork": buildImageUrlFromCover(album.url_cover),
    "duration": track.duration ? Math.floor(track.duration / 1000) : undefined,
    "qualities": qualities,
    "fee": vipFee
  };
}

function parseRecommendPlaylistBlock(playlistBlock) {
  const playlist = playlistBlock.resources[0].entity.playlist;
  const vipFee = getVipFee(playlist?.["label_info"]?.["only_vip_playable"]);
  const coverUri = playlist.url_cover.uri;
  const coverTemplate = playlist.url_cover.template_prefix;

  return {
    "id": playlist.id,
    "title": playlist.title,
    "artist": playlist.owner.nickname,
    "createUserId": playlist.owner.id,
    "description": playlist.desc,
    "artwork": buildDouyinImageUrl(coverUri, coverTemplate),
    "createTime": playlist.create_time,
    "fee": vipFee
  };
}

function parseCommentItem(comment) {
  const createDate = new Date(comment.time_created);

  return {
    "id": comment.id,
    "nickName": comment.user.nickname,
    "avatar": comment.user.medium_avatar_url && comment.user.medium_avatar_url.urls[0],
    "comment": comment.content,
    "like": comment.count_digged,
    "createAt": createDate.toLocaleString()
  };
}

async function searchMusic(keyword, page) {
  const offset = (page - 1) * PAGE_SIZE;
  const response = await axios.default.get("https://api-vehicle.volcengine.com/v2/search/type", {
    "params": {
      "keyword": keyword,
      "search_type": "music",
      "limit": PAGE_SIZE,
      "real_offset": offset,
      "search_source": "qishui"
    }
  });

  const apiData = response.data;
  const musicList = apiData.data.list.map(parseSearchResultItem);

  return {
    "isEnd": apiData.data.list.length === 0 || apiData.data.list.length < PAGE_SIZE ? true : false,
    "data": musicList
  };
}

async function getMusicPlaybackSource(musicItem, quality = "128k") {
  if (!musicItem?.id) return null;

  try {
    if (musicItem.qualities && Object.keys(musicItem.qualities).length > 0 && !musicItem.qualities[quality]) {
      console.error(`[汽水音乐] 歌曲不支持音质 ${quality}`);
      throw new Error(`该歌曲不支持 ${quality} 音质`);
    }

    const seoUrl = `https://beta-luna.douyin.com/luna/h5/seo_track?track_id=${musicItem.id}&device_platform=web`;
    const seoResponse = await axios.default.get(seoUrl);
    const playInfoUrl = seoResponse?.data?.track_player?.url_player_info;

    if (!playInfoUrl) {
      throw new Error("未找到播放信息地址");
    }

    const playInfoResponse = await axios.default.get(playInfoUrl);
    const playInfoList = playInfoResponse?.data?.Result?.Data?.PlayInfoList || [];

    if (!playInfoList.length) {
      throw new Error("播放列表为空");
    }

    const highestQualityInfo = playInfoList[playInfoList.length - 1];
    const playUrl = highestQualityInfo?.MainPlayUrl;

    if (!playUrl) {
      throw new Error("未找到播放地址");
    }

    return {
      url: playUrl.replace("audio_mp4", "audio_mp3"),
      headers: AUDIO_PLAYBACK_HEADERS
    };
  } catch (error) {
    console.error(`[汽水音乐] 获取播放源错误: ${error.message}`);
    return {
      url: ""
    };
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
      fee: musicBase.fee,
      platform: '汽水音乐',
    };
  }

  const songId = musicBase.id || musicBase.item_id;
  if (!songId) {
    console.error('[汽水音乐] getMusicInfo: 缺少有效的歌曲ID');
    return null;
  }

  try {
    const response = await axios.default.get("https://api-vehicle.volcengine.com/v2/custom/contents", {
      "params": {
        "sources": "qishui",
        "need_author": true,
        "need_album": true,
        "need_ugc": true,
        "need_stat": true,
        "item_ids": songId
      }
    });

    const apiData = response.data;
    if (!apiData.data || !apiData.data.list || apiData.data.list.length === 0) {
      console.error('[汽水音乐] getMusicInfo: 未找到歌曲信息');
      return null;
    }

    const item = apiData.data.list[0];
    const vipFee = getVipFee(item?.["qishui_label_info"]?.["only_vip_playable"]);

    const qualities = {
      "128k": { bitrate: 128000 },
      "320k": { bitrate: 320000 },
      "flac": { bitrate: 1411000 },
    };

    const authorInfo = item.author_info || {};
    const singerList = (authorInfo.id || authorInfo.name) ? [{
      id: authorInfo.id,
      name: authorInfo.name,
      avatar: authorInfo.avatar || "",
    }] : [];

    return {
      id: songId,
      title: (item.title || ''),
      artist: item.author_info?.name || '',
      album: item.album_info?.name || '',
      artwork: item.cover_url,
      duration: item.duration,
      qualities: qualities,
      fee: vipFee,
      platform: '汽水音乐',
      singerList,
    };
  } catch (error) {
    console.error('[汽水音乐] getMusicInfo 错误:', error.message);
    return null;
  }
}

async function getMusicDetailInfo(musicItem) {
  const response = await axios.default.get("https://api-vehicle.volcengine.com/v2/custom/contents", {
    "params": {
      "sources": "qishui",
      "need_author": true,
      "need_album": true,
      "need_ugc": true,
      "need_stat": true,
      "item_ids": musicItem.id
    }
  });

  const apiData = response.data;

  return {
    "artwork": apiData.data.list[0].cover_url,
    "rawLrc": apiData.data.list[0].lyric_info.lyric_text
  };
}

async function getAlbumInfo(album) {
  const response = await axios.default.get(`https://api5-lq.qishui.com/luna/albums/${album.id}?count=1000&charge=0`, {
    "headers": QISHUI_API_HEADERS
  });

  const apiData = response.data;

  return {
    "musicList": apiData.tracks.map(parseTrackItem)
  };
}

async function getArtistWorks(artist, page, limit) {
  const response = await axios.default.get(`https://api5-lq.qishui.com/luna/artists/${artist.id}/tracks?count=1000&charge=0`, {
    "headers": QISHUI_API_HEADERS
  });

  const apiData = response.data;

  return {
    "data": apiData.tracks.map(parseTrackItem)
  };
}

async function fetchPlaylistDetailFromApi(playlistId) {
  try {
    const response = await axios.default.post("https://api5-lq.qishui.com/luna/playlist/detail?charge=0", {
      "playlist_id": playlistId
    }, {
      "headers": QISHUI_API_HEADERS
    });

    if (response?.data && Array.isArray(response.data.media_resources) && response.data.media_resources.length > 0) {
      return {
        "playlistInfo": response.data.playlist || null,
        "media_resources": response.data.media_resources
      };
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function fetchPlaylistDetailFromWeb(playlistId) {
  try {
    const response = await axios.default.get(QISHUI_WEB_SHARE_URL, {
      "params": {
        "playlist_id": playlistId
      },
      "headers": QISHUI_WEB_SHARE_HEADERS,
      "responseType": "text",
      "transformResponse": [data => data],
      "validateStatus": status => status >= 200 && status < 500
    });

    const playlistDetail = parseWebPlaylistDetail(response.data);

    if (
      hasValidPlaylistDetail(playlistDetail)
      && String(playlistDetail?.playlistInfo?.id || "") === String(playlistId)
    ) {
      return playlistDetail;
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function fetchPlaylistDetail(playlistId) {
  const apiDetail = await fetchPlaylistDetailFromApi(playlistId);
  if (hasValidPlaylistDetail(apiDetail)) {
    return apiDetail;
  }

  const webDetail = await fetchPlaylistDetailFromWeb(playlistId);
  if (hasValidPlaylistDetail(webDetail)) {
    return webDetail;
  }

  return {
    "playlistInfo": null,
    "media_resources": []
  };
}

async function importMusicPlaylist(playlistUrl) {
  let playlistId;

  if (/douyin\.com\/s\//i.test(playlistUrl)) {
    try {
      const redirectRes = await axios.default.get(playlistUrl.trim(), {
        maxRedirects: 0,
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const location = redirectRes.headers && redirectRes.headers.location;
      if (location) playlistUrl = location;
    } catch (e) {
    }
  }

  !playlistId && (playlistId = (playlistUrl.match(/[?&]playlist_id=(\d+)/) || [])[1]);

  !playlistId && (playlistId = (playlistUrl.match(/https?:\/\/.*?\.douyin\.com\/qishui\/share\/playlist\?playlist_id=(\d+)/) || [])[1]);

  if (!playlistId) {
    playlistId = (playlistUrl.trim().match(/^(\d+)$/) || [])[1];
  }

  if (!playlistId) return;

  const playlistDetail = await fetchPlaylistDetail(playlistId);
  return playlistDetail.media_resources
    .filter(resource => resource.type === "track")
    .map(parsePlaylistMediaResource)
    .filter(Boolean);
}

async function getMusicPlaylistInfo(playlist) {
  if (playlist?._bakaSourceType === "toplist" || QISHUI_TOP_LIST_IDS.has(String(playlist?.id))) {
    const baseTopList = QISHUI_TOP_LIST_ITEMS.find(item => String(item.id) === String(playlist.id)) || {
      "id": playlist.id,
      "title": playlist.title,
      "description": playlist.description,
      "coverImg": playlist.artwork
    };
    const topListDetail = await getTopListDetail(baseTopList);

    return {
      "isEnd": true,
      "musicList": topListDetail.musicList || []
    };
  }
  const playlistDetail = await fetchPlaylistDetail(playlist.id);

  return {
    "isEnd": true,
    "musicList": playlistDetail.media_resources
      .map(parsePlaylistMediaResource)
      .filter(Boolean)
  };
}

async function getRecommendPlaylistTags() {
  return {
    "data": [],
    "pinned": [{
      "id": 0,
      "title": "每日推荐"
    }, {
      "id": 14,
      "title": "流行"
    }, {
      "id": 8,
      "title": "华语"
    }, {
      "id": 9,
      "title": "欧美"
    }, {
      "id": 20,
      "title": "国风"
    }, {
      "id": 18,
      "title": "民谣"
    }, {
      "id": 15,
      "title": "摇滚"
    }, {
      "id": 38,
      "title": "说唱"
    }, {
      "id": 16,
      "title": "电子"
    }, {
      "id": 19,
      "title": "R&B"
    }, {
      "id": 69,
      "title": "治愈"
    }, {
      "id": 45,
      "title": "睡前"
    }, {
      "id": 40,
      "title": "学习"
    }]
  };
}

async function getRecommendPlaylistsByTag(tag, page) {
  let subChannelId = Number.isNaN(parseInt(tag.id, 10)) ? 0 : parseInt(tag.id, 10);

  try {
    const response = await axios.default.post("https://api5-lq.qishui.com/luna/discover/mix?charge=0", {
      "block_type": "discover_playlist_mix",
      "feed_discover_extra": {},
      "latest_douyin_liked_playlist_show_ts": 0,
      "sub_channel_id": subChannelId
    }, {
      "headers": QISHUI_API_HEADERS
    });

    if (response?.data && Array.isArray(response.data.inner_block) && response.data.inner_block.length > 0) {
      return {
        "isEnd": false,
        "data": response.data.inner_block.map(parseRecommendPlaylistBlock)
      };
    }
  } catch (error) {
  }

  return {
    "isEnd": true,
    "data": page > 1 ? [] : getFallbackRecommendSheets()
  };
}

async function getTopLists() {
  return [{
    "title": "默认排行榜",
    "data": QISHUI_TOP_LIST_ITEMS
  }];
}

async function getTopListDetail(topListItem, page = 1) {
  const response = await axios.default.get(`https://api5-lf.qishui.com/luna/charts/${topListItem.id}?charge=0`, {
    "headers": QISHUI_API_HEADERS
  });

  const apiData = response.data;

  return { ...topListItem, 
    "musicList": apiData.chart.track_ranks.map(parseRankTrackItem)
   };
}

async function getMusicComments(musicItem, page = 1) {
  const cursor = (page - 1) * PAGE_SIZE;
  const response = await axios.default.get(`https://api5-lq.qishui.com/luna/comments?group_id=${musicItem.id}&cursor=${cursor}&count=${PAGE_SIZE}&charge=0`, {
    "headers": QISHUI_API_HEADERS
  });

  const apiData = response.data;

  return {
    "isEnd": page * PAGE_SIZE > apiData.count ? true : false,
    "data": apiData.comments.map(parseCommentItem)
  };
}

module.exports = {
  "platform": "汽水音乐",
  "author": "Toskysun",
  "version": "1.0.0",
  "appVersion": ">0.1.0-alpha.0",
  "srcUrl": "https://music.cwo.cc.cd/plugins/qishui.js",
  "cacheControl": "no-cache",
  "supportedQualities": ["128k", "320k", "flac"],
  "hints": {
    "importMusicSheet": [
      "汽水APP：歌单-分享-分享链接；手动访问链接后再复制链接粘贴即可",
      "网页：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待"
    ]
  },
  "supportedSearchType": ["music"],

  
  async "search"(query, page, type) {
    if (type === "music") return await searchMusic(query, page);
  },

  "getMediaSource": getMusicPlaybackSource,
  "getMusicInfo": getMusicInfo,
  "getLyric": getMusicDetailInfo,
  "getAlbumInfo": getAlbumInfo,
  "getArtistWorks": getArtistWorks,
  "importMusicSheet": importMusicPlaylist,
  "getMusicSheetInfo": getMusicPlaylistInfo,
  "getRecommendSheetTags": getRecommendPlaylistTags,
  "getRecommendSheetsByTag": getRecommendPlaylistsByTag,
  "getTopLists": getTopLists,
  "getTopListDetail": getTopListDetail,
  "getMusicComments": getMusicComments
};
