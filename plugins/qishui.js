/**
 * 汽水音乐 BakaMusic 插件
 * @author JanYun & Toskysun
 * @version 3.0.1
 * @description 汽水音乐 PC API 原生插件，支持搜索、专辑、歌单、音乐人、逐字歌词和多音质
 * @officialGroup BakaMusic官方群：1064805856
 * @janyunGroup 简云官方群：288305439
 * @srcLink https://music.cwo.cc.cd/plugins/qishui.js
 */

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

const QISHUI_PC_API_BASE = "https://api.qishui.com/luna/pc";

const QISHUI_TRACK_DETAIL_DEVICE_ID = "1000008787889255961";

const QISHUI_PC_API_HEADERS = {
  "Accept": "*/*",
  "Content-Type": "application/json; charset=utf-8",
  "Accept-Encoding": "gzip, deflate",
  "User-Agent": "LunaPC/3.2.1(343009595)",
  "x-luna-background-type": "foreground",
  "x-luna-is-background-req": "0",
  "x-luna-is-local-user": "0"
};

const QISHUI_PC_API_PARAMS = {
  "aid": "386088",
  "app_name": "luna_pc",
  "region": "cn",
  "geo_region": "cn",
  "os_region": "cn",
  "sim_region": "",
  "device_id": "100000305367703244",
  "cdid": "",
  "iid": "",
  "version_name": "3.2.1",
  "version_code": "30020100",
  "channel": "official",
  "build_mode": "master",
  "network_carrier": "",
  "ac": "wifi",
  "tz_name": "Asia/Shanghai",
  "resolution": "",
  "device_platform": "windows",
  "device_type": "Windows",
  "os_version": "Windows 11 Home China",
  "fp": "100000305367703244"
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

const QISHUI_SEARCH_TYPE_MAP = {
  "music": "track",
  "album": "album",
  "artist": "artist",
  "sheet": "playlist"
};

const QISHUI_QUALITY_TO_BAKA = {
  "medium": "128k",
  "higher": "192k",
  "highest": "320k",
  "lossless": "flac",
  "hi_res": "hires",
  "spatial": "atmos"
};

const BAKA_QUALITY_TO_QISHUI = {
  "128k": "medium",
  "192k": "higher",
  "320k": "highest",
  "flac": "lossless",
  "hires": "hi_res",
  "atmos": "spatial",
  "atmos_plus": "spatial"
};

const QISHUI_QUALITY_FALLBACK_BITRATE = {
  "medium": 128000,
  "higher": 192000,
  "highest": 320000,
  "lossless": 1411000,
  "hi_res": 2304000,
  "spatial": 324000
};

const QISHUI_QUALITY_PRIORITY = ["medium", "higher", "highest", "lossless", "hi_res", "spatial"];

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

  if (Array.isArray(urlCover.urls) && urlCover.urls.length > 0) {
    return urlCover.urls[0];
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

function createSearchId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPcApiParams(extraParams = {}) {
  return Object.assign({}, QISHUI_PC_API_PARAMS, extraParams);
}

async function qishuiPcGet(path, params = {}) {
  const response = await axios.default.get(`${QISHUI_PC_API_BASE}${path}`, {
    "params": getPcApiParams(params),
    "headers": QISHUI_PC_API_HEADERS
  });

  return response.data;
}

async function qishuiPcPost(path, data = {}, params = {}) {
  const response = await axios.default.post(`${QISHUI_PC_API_BASE}${path}`, data, {
    "params": getPcApiParams(params),
    "headers": QISHUI_PC_API_HEADERS
  });

  return response.data;
}

function createQualitiesFromBitRates(bitRates = []) {
  const qualities = {};

  if (!Array.isArray(bitRates)) {
    return qualities;
  }

  const spatialEntries = [];

  bitRates.forEach(bitRate => {
    const qishuiQuality = bitRate?.quality;
    const bitrate = bitRate.br || QISHUI_QUALITY_FALLBACK_BITRATE[qishuiQuality];

    if (qishuiQuality === "spatial") {
      spatialEntries.push({
        "size": bitRate.size,
        "bitrate": bitrate,
        "qishuiQuality": qishuiQuality
      });
      return;
    }

    const qualityKey = QISHUI_QUALITY_TO_BAKA[qishuiQuality];

    if (!qualityKey) {
      return;
    }

    qualities[qualityKey] = {
      "size": bitRate.size,
      "bitrate": bitrate,
      "qishuiQuality": qishuiQuality
    };
  });

  assignSpatialQualities(qualities, spatialEntries);

  return qualities;
}

function createQualitiesFromPlayInfoList(playInfoList = []) {
  const qualities = {};

  if (!Array.isArray(playInfoList)) {
    return qualities;
  }

  const spatialEntries = [];

  playInfoList.forEach(playInfo => {
    const qishuiQuality = playInfo?.Quality;
    const bitrate = playInfo.Bitrate || QISHUI_QUALITY_FALLBACK_BITRATE[qishuiQuality];

    if (qishuiQuality === "spatial") {
      spatialEntries.push({
        "size": playInfo.Size,
        "bitrate": bitrate,
        "qishuiQuality": qishuiQuality
      });
      return;
    }

    const qualityKey = QISHUI_QUALITY_TO_BAKA[qishuiQuality];

    if (!qualityKey) {
      return;
    }

    qualities[qualityKey] = {
      "size": playInfo.Size,
      "bitrate": bitrate,
      "qishuiQuality": qishuiQuality
    };
  });

  assignSpatialQualities(qualities, spatialEntries);

  return qualities;
}

function getQualityEntryScore(entry) {
  return Number(entry?.bitrate || entry?.Bitrate || entry?.br || 0) * 1000000000
    + Number(entry?.size || entry?.Size || 0);
}

function assignSpatialQualities(qualities, entries) {
  const sortedEntries = entries
    .filter(Boolean)
    .sort((a, b) => getQualityEntryScore(b) - getQualityEntryScore(a));

  if (sortedEntries.length === 0) {
    return;
  }

  if (sortedEntries.length > 1) {
    qualities["atmos_plus"] = sortedEntries[0];
    qualities["atmos"] = sortedEntries[1];
  } else {
    qualities["atmos"] = sortedEntries[0];
  }
}

function normalizeTrack(track) {
  return track?.entity?.track_wrapper?.track
    || track?.entity?.track
    || track?.track
    || track;
}

function normalizeAlbum(album) {
  return album?.entity?.album || album?.album || album;
}

function normalizeArtist(artist) {
  return artist?.entity?.artist || artist?.artist || artist;
}

function normalizePlaylist(playlist) {
  return playlist?.entity?.playlist || playlist?.playlist || playlist;
}

function pickQishuiQuality(musicItem, quality) {
  const exactQuality = musicItem?.qualities?.[quality]?.qishuiQuality;
  if (exactQuality) {
    return exactQuality;
  }

  return BAKA_QUALITY_TO_QISHUI[quality] || "higher";
}

function getBestPlayableInfo(playInfoList, qishuiQuality, bakaQuality) {
  if (!Array.isArray(playInfoList) || playInfoList.length === 0) {
    return null;
  }

  if (qishuiQuality === "spatial") {
    const spatialPlayInfoList = playInfoList
      .filter(item => item?.Quality === "spatial")
      .sort((a, b) => getQualityEntryScore(b) - getQualityEntryScore(a));

    if (spatialPlayInfoList.length > 0) {
      if (bakaQuality === "atmos_plus") {
        return spatialPlayInfoList[0];
      }
      return spatialPlayInfoList.length > 1 ? spatialPlayInfoList[1] : spatialPlayInfoList[0];
    }
  }

  const exact = playInfoList.find(item => item?.Quality === qishuiQuality);
  if (exact) {
    return exact;
  }

  const targetIndex = QISHUI_QUALITY_PRIORITY.indexOf(qishuiQuality);
  if (targetIndex !== -1) {
    for (let index = targetIndex - 1; index >= 0; index--) {
      const fallbackQuality = QISHUI_QUALITY_PRIORITY[index];
      const fallback = playInfoList.find(item => item?.Quality === fallbackQuality);
      if (fallback) {
        return fallback;
      }
    }
  }

  return playInfoList[playInfoList.length - 1];
}

function escapeQrcText(text) {
  return String(text || "").replace(/\(/g, "（").replace(/\)/g, "）");
}

function parseQishuiKrcToQrc(krcContent) {
  if (!krcContent || typeof krcContent !== "string") {
    return null;
  }

  const qrcLines = [];
  const lines = krcContent.replace(/\r/g, "").split("\n");
  const wordPattern = /<(\d+),(\d+),\d+>([^<]*)/g;

  for (const line of lines) {
    const lineMatch = line.trim().match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lineMatch) {
      continue;
    }

    const lineStartMs = Number(lineMatch[1]);
    const lineDurationMs = Number(lineMatch[2]);
    const content = lineMatch[3] || "";
    const qrcWords = [];
    let match;

    wordPattern.lastIndex = 0;
    while ((match = wordPattern.exec(content)) !== null) {
      const wordOffsetMs = Number(match[1]);
      const wordDurationMs = Number(match[2]);
      const wordText = escapeQrcText(match[3]);

      if (!wordText) {
        continue;
      }

      qrcWords.push(`${wordText}(${lineStartMs + wordOffsetMs},${wordDurationMs})`);
    }

    if (qrcWords.length > 0) {
      qrcLines.push(`[${lineStartMs},${lineDurationMs}]${qrcWords.join("")}`);
    }
  }

  return qrcLines.length > 0 ? qrcLines.join("\n") : null;
}

function extractLyricText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  if (typeof value.lyric === "string") {
    return value.lyric;
  }

  return "";
}

function extractTranslationLyric(lyric) {
  return extractLyricText(lyric?.translations?.cn)
    || extractLyricText(lyric?.translations?.zh)
    || extractLyricText(lyric?.translation)
    || "";
}

function extractRomanizationLyric(lyric) {
  return extractLyricText(lyric?.romanization)
    || extractLyricText(lyric?.romaji)
    || extractLyricText(lyric?.translations?.romanization)
    || extractLyricText(lyric?.translations?.romaji)
    || "";
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
    "qualities": createQualitiesFromBitRates(searchItem.bit_rates),
    "fee": vipFee
  };
}

function parseRankTrackItem(rankItem, index = 0) {
  const musicItem = parseTrackItem(rankItem?.track);
  if (musicItem && rankItem?.rank) {
    musicItem.rank = rankItem.rank.rank || index + 1;
    musicItem.rankDelta = rankItem.rank.rank_delta || "0";
  }
  return musicItem;
}

function parseTrackItem(track) {
  track = normalizeTrack(track);
  if (!track) return null;

  const vipFee = getVipFee(track?.["label_info"]?.["only_vip_playable"]);
  const album = track.album || {};
  const primaryArtist = Array.isArray(track.artists) && track.artists.length > 0 ? track.artists[0] : {};

  const singerList = buildSingerList(track.artists || []);

  return {
    "id": track.id,
    "title": track.name,
    "artist": primaryArtist.name || "",
    "artistId": primaryArtist.id,
    "singerList": singerList,
    "album": album.name || "",
    "albumId": album.id,
    "artwork": buildImageUrlFromCover(album.url_cover),
    "duration": track.duration ? Math.floor(track.duration / 1000) : undefined,
    "qualities": createQualitiesFromBitRates(track.bit_rates),
    "fee": vipFee,
    "vid": track.vid
  };
}

function parsePlaylistMediaResource(mediaResource) {
  return parseTrackItem(mediaResource);
}

function parseAlbumItem(albumItem) {
  const album = normalizeAlbum(albumItem);
  if (!album) return null;
  const description = album.intro
    || (Array.isArray(album.pclines) ? album.pclines.join("\n") : "");

  return {
    "id": album.id,
    "title": album.name || "",
    "artist": buildSingerList(album.artists || []).map(artist => artist.name).filter(Boolean).join(" / "),
    "artwork": buildImageUrlFromCover(album.url_cover),
    "date": album.release_date,
    "description": description,
    "worksNum": album.count_tracks
  };
}

function parseArtistItem(artistItem) {
  const artist = normalizeArtist(artistItem);
  if (!artist) return null;

  return {
    "id": artist.id,
    "name": artist.name || artist.simple_display_name || "",
    "avatar": buildImageUrlFromCover(artist.url_avatar) || buildImageUrlFromCover(artist.user?.medium_avatar_url),
    "description": artist.description || "",
    "fans": artist.stats?.count_collected || 0,
    "platform": "汽水音乐",
    "albumCount": artist.count_albums || 0,
    "trackCount": artist.count_tracks || 0
  };
}

function parsePlaylistItem(playlistItem) {
  const playlist = normalizePlaylist(playlistItem);
  if (!playlist) return null;

  return {
    "id": playlist.id,
    "title": playlist.title || playlist.public_title || playlist.name || "",
    "artist": playlist.owner?.nickname || playlist.user_artist_info?.user_brief?.nickname || "",
    "createUserId": playlist.owner?.id || playlist.user_artist_info?.user_brief?.id || "",
    "description": playlist.desc || "",
    "artwork": buildImageUrlFromCover(playlist.url_cover),
    "createTime": playlist.create_time || 0,
    "worksNum": playlist.count_tracks || playlist.resource_cnt?.track_cnt || 0,
    "fee": getVipFee(playlist?.["label_info"]?.["only_vip_playable"]),
    "_bakaSourceType": "playlist"
  };
}

function parseRecommendPlaylistBlock(playlistBlock) {
  const playlist = playlistBlock?.resources?.[0]?.entity?.playlist;
  return parsePlaylistItem(playlist);
}

function parseCommentItem(comment) {
  const createdAt = comment.time_created ? Number(comment.time_created) : 0;
  const createDate = new Date(createdAt < 1000000000000 ? createdAt * 1000 : createdAt);

  return {
    "id": comment.id,
    "nickName": comment.user.nickname,
    "avatar": buildImageUrlFromCover(comment.user?.medium_avatar_url),
    "comment": comment.content,
    "like": comment.count_digged,
    "createAt": createDate.toLocaleString()
  };
}

async function searchMusic(keyword, page) {
  return searchQishui(keyword, page, "music");
}

async function searchQishui(keyword, page, type = "music") {
  const searchType = QISHUI_SEARCH_TYPE_MAP[type] || "track";
  const offset = (page - 1) * PAGE_SIZE;
  const apiData = await qishuiPcGet(`/search/${searchType}`, {
    "q": keyword,
    "cursor": String(offset),
    "search_id": createSearchId(),
    "search_method": "input",
    "debug_params": "",
    "from_search_id": "",
    "search_scene": ""
  });

  const groups = Array.isArray(apiData.result_groups) ? apiData.result_groups : [];
  const data = groups
    .flatMap(group => Array.isArray(group.data) ? group.data : [])
    .map(item => {
      if (type === "album") return parseAlbumItem(item);
      if (type === "artist") return parseArtistItem(item);
      if (type === "sheet") return parsePlaylistItem(item);
      return parseTrackItem(item);
    })
    .filter(Boolean);

  return {
    "isEnd": data.length === 0 || data.length < PAGE_SIZE || !groups.some(group => group.has_more),
    "data": data
  };
}



async function fetchSeoTrackData(trackId) {
  const seoUrl = `https://beta-luna.douyin.com/luna/h5/seo_track?track_id=${trackId}&device_platform=web`;
  const seoResponse = await axios.default.get(seoUrl);
  const playInfoUrl = seoResponse?.data?.track_player?.url_player_info;
  const vid = seoResponse?.data?.seo_track?.track?.vid;
  let playInfoList = [];

  if (!seoResponse?.data?.track_player?.media_id) {
    console.log(`[汽水音乐] fetchSeoTrackData: 未找到 media_id，trackId=${trackId}`);
    const TrackDetail = await fetchTrackDetail(trackId);
    const videoModel = TrackDetail?.track_player?.video_model;
    const videoModelObj = videoModel ? JSON.parse(videoModel) : null;
    if (videoModelObj && Array.isArray(videoModelObj.video_list)) {
      playInfoList = videoModelObj.video_list.map(video => ({
        "Bitrate": video.video_meta?.bitrate || 0,
        "FileHash": video.video_meta?.file_hash || "",
        "Size": video.video_meta?.size || 0,
        "Height": 0,
        "Width": 0,
        "Format": video.video_meta?.vtype || "",
        "Codec": video.video_meta?.codec_type || "",
        "Logo": "",
        "Definition": "",
        "Quality": video.video_meta?.quality || "",
        "Duration": video.video_duration || 0,
        "EncryptionMethod": video.encrypt_info?.encryption_method || "",
        "PlayAuth": video.encrypt_info?.spade_a || "",
        "PlayAuthID": video.encrypt_info?.kid || "",
        "MainPlayUrl": video.main_url || "",
        "BackupPlayUrl": video.backup_url || "",
        "UrlExpire": video.url_expire || 0,
        "FileID": video.video_meta?.file_id || "",
        "P2pVerifyURL": "",
        "PreloadInterval": 60,
        "PreloadMaxStep": 10,
        "PreloadMinStep": 5,
        "PreloadSize": 327680,
        "CheckInfo": ""
      }));
    }
    // const playInfoResponse = await axios.default.get(TrackDetail?.track_player?.url_player_info);
    // playInfoList = playInfoResponse?.data?.Result?.Data?.PlayInfoList || [];
  } else if (seoResponse?.data?.seo_track?.track?.preview?.duration && seoResponse?.data?.seo_track?.track?.preview?.duration < seoResponse?.data?.seo_track?.track?.duration) {
    console.log(`[汽水音乐] fetchSeoTrackData: 播放器版本，trackId=${trackId}`);
    const playInfoResponse = await fetchSeoTrackDataByVid(vid);
    playInfoList = playInfoResponse?.playInfoList || [];
  } else {
    if (playInfoUrl) {
      console.log(`[汽水音乐] fetchSeoTrackData: 获取播放信息，trackId=${trackId}`);
      const playInfoResponse = await axios.default.get(playInfoUrl);
      playInfoList = playInfoResponse?.data?.Result?.Data?.PlayInfoList || [];
    }
  }
  return {
    "seoData": seoResponse.data,
    "playInfoList": playInfoList
  };
}

async function getMusicInfoFromSeo(trackId) {
  try {
    const { seoData, playInfoList } = await fetchSeoTrackData(trackId);
    const musicItem = parseTrackItem(seoData?.seo_track?.track);

    if (!musicItem) {
      return null;
    }

    const playInfoQualities = createQualitiesFromPlayInfoList(playInfoList);
    if (Object.keys(playInfoQualities).length > 0) {
      musicItem.qualities = Object.assign({}, musicItem.qualities, playInfoQualities);
    }

    return musicItem;
  } catch (error) {
    return null;
  }
}

async function getMusicPlaybackSource(musicItem, quality = "128k") {
  if (!musicItem?.id) return null;

  try {
    if (musicItem.qualities && Object.keys(musicItem.qualities).length > 0 && !musicItem.qualities[quality]) {
      console.error(`[汽水音乐] 歌曲不支持音质 ${quality}`);
      throw new Error(`该歌曲不支持 ${quality} 音质`);
    }

    const { playInfoList } = await fetchSeoTrackData(musicItem.id);

    if (!playInfoList.length) {
      throw new Error("播放列表为空");
    }

    const qishuiQuality = pickQishuiQuality(musicItem, quality);
    const playInfo = getBestPlayableInfo(playInfoList, qishuiQuality, quality);
    console.log(`[汽水音乐] 获取播放源: trackId=${musicItem.id}, quality=${quality}, qishuiQuality=${qishuiQuality}, playInfo=${JSON.stringify(playInfo, null, 2)}`);
    const playUrl = playInfo?.MainPlayUrl;

    if (!playUrl) {
      throw new Error("未找到播放地址");
    }

    if (playInfo?.PlayAuth) {
      const decryptResponse = await axios.default.post("http://qs.xiaoapi.cn/4.0/decrypt.php", {
        "apikey": "sk_6a400fa0ba0687.778401724wNS5ACVxLqYbr9n",
        "play_auth": playInfo.PlayAuth
      });

      if (decryptResponse?.data?.code === 200 && decryptResponse?.data?.key) {
        const cek = decryptResponse.data.key;
        return {
          url: playUrl.replace("audio_mp4", "audio_mp3"),
          headers: AUDIO_PLAYBACK_HEADERS,
          cek: cek,
          quality
        };
      } else {
        throw new Error("解密 PlayAuth 失败");
      }
    }

    return {
      url: playUrl.replace("audio_mp4", "audio_mp3"),
      headers: AUDIO_PLAYBACK_HEADERS,
      quality
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
    return Object.assign({}, musicBase, {
      "platform": "汽水音乐"
    });
  }

  const songId = musicBase.id || musicBase.item_id;
  if (!songId) {
    console.error('[汽水音乐] getMusicInfo: 缺少有效的歌曲ID');
    return null;
  }

  const seoMusicInfo = await getMusicInfoFromSeo(songId);
  if (seoMusicInfo) {
    return Object.assign({}, seoMusicInfo, {
      "platform": "汽水音乐"
    });
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
      qualities: createQualitiesFromBitRates(item.bit_rates),
      fee: vipFee,
      platform: '汽水音乐',
      singerList,
    };
  } catch (error) {
    console.error('[汽水音乐] getMusicInfo 错误:', error.message);
    return null;
  }
}

async function fetchTrackDetail(trackId) {
  return qishuiPcPost("/track_v2", {
    "track_id": String(trackId),
    "media_type": "track",
    "queue_type": "daily_mix",
    "scene_name": "track_reco"
  }, {
    "device_id": QISHUI_TRACK_DETAIL_DEVICE_ID,
    "fp": QISHUI_TRACK_DETAIL_DEVICE_ID
  });
}

async function getLegacyMusicDetailInfo(trackId) {
  const response = await axios.default.get("https://api-vehicle.volcengine.com/v2/custom/contents", {
    "params": {
      "sources": "qishui",
      "need_author": true,
      "need_album": true,
      "need_ugc": true,
      "need_stat": true,
      "item_ids": trackId
    }
  });

  const apiData = response.data;
  const item = apiData?.data?.list?.[0];

  if (!item) {
    return {};
  }

  return {
    "artwork": item.cover_url,
    "rawLrc": item.lyric_info?.lyric_text || ""
  };
}

async function getMusicDetailInfo(musicItem) {
  const trackId = musicItem?.id || musicItem?.item_id;
  if (!trackId) {
    return {};
  }

  try {
    const detail = await fetchTrackDetail(trackId);
    const lyric = detail?.lyric || {};
    const rawLrc = parseQishuiKrcToQrc(lyric.content);
    const trackInfo = parseTrackItem(detail?.track);
    const result = {
      "artwork": trackInfo?.artwork || musicItem.artwork || ""
    };
    const translation = extractTranslationLyric(lyric);
    const romanization = extractRomanizationLyric(lyric);

    if (rawLrc) {
      result.rawLrc = rawLrc;
    } else if (typeof lyric.content === "string" && /^\[\d{1,2}:\d{2}/.test(lyric.content.trim())) {
      result.rawLrc = lyric.content;
    }

    if (translation) {
      result.translation = translation;
    }

    if (romanization) {
      result.romanization = romanization;
    }

    if (result.rawLrc || result.translation || result.romanization) {
      return result;
    }
  } catch (error) {
    console.error(`[汽水音乐] track_v2 获取歌词错误: ${error.message}`);
  }

  return getLegacyMusicDetailInfo(trackId);
}

async function getAlbumInfo(album) {
  const apiData = await qishuiPcGet(`/albums/${album.id}`, {
    "ignore_tracks": "false"
  });

  return {
    "isEnd": true,
    "albumItem": parseAlbumItem(apiData.album_info) || album,
    "musicList": (apiData.tracks || []).map(parseTrackItem).filter(Boolean)
  };
}

async function fetchArtistAlbumsPage(artistId, page) {
  const targetCount = page * PAGE_SIZE;
  const albums = [];
  const seenAlbumIds = new Set();
  let cursor = 0;
  let hasMore = true;

  for (let requestCount = 0; requestCount < 8; requestCount++) {
    const apiData = await qishuiPcGet(`/artists/${artistId}/albums`, {
      "cursor": String(cursor),
      "count": String(PAGE_SIZE)
    });

    let addedCount = 0;
    (apiData.albums || []).forEach(album => {
      const albumId = String(album?.id || "");
      if (!albumId || seenAlbumIds.has(albumId)) {
        return;
      }
      seenAlbumIds.add(albumId);
      albums.push(album);
      addedCount += 1;
    });

    hasMore = apiData.has_more === true;
    if (albums.length >= targetCount || (!hasMore && addedCount === 0)) {
      break;
    }

    cursor += PAGE_SIZE;
  }

  const startIndex = (page - 1) * PAGE_SIZE;
  const pageAlbums = albums.slice(startIndex, startIndex + PAGE_SIZE);

  return {
    "isEnd": pageAlbums.length < PAGE_SIZE || (!hasMore && albums.length <= targetCount),
    "data": pageAlbums.map(parseAlbumItem).filter(Boolean)
  };
}

async function getArtistWorks(artist, page, type) {
  if (type === "album") {
    return fetchArtistAlbumsPage(artist.id, page);
  }

  if (type && type !== "music") {
    return {
      "isEnd": true,
      "data": []
    };
  }

  const apiData = await qishuiPcGet(`/artists/${artist.id}/tracks`, {
    "cursor": String((page - 1) * 50),
    "count": "50"
  });

  return {
    "isEnd": !apiData.has_more,
    "data": (apiData.tracks || []).map(parseTrackItem).filter(Boolean)
  };
}

async function fetchSeoTrackDataByVid(vid) {
  const params = {
    "media_id": vid,
    "type": "audio",
    "player_ver": "2",
    "media_source": "luna_pc",
    "device_platform": "web",
    "os": "web",
    "ssmix": "a",
    "_rticket": String(Date.now()),
    "cdid": "",
    "channel": "official",
    "aid": "386088",
    "app_name": "luna",
    "version_code": "100030010",
    "version_name": "10.3.0",
    "manifest_version_code": "100030010",
    "update_version_code": "100030010",
    "resolution": "1920*1080",
    "dpi": "560",
    "device_type": "Windows",
    "language": "zh",
    "os_api": "0",
    "os_version": "10",
    "ac": "wifi",
    "package": "com.luna.music",
    "device_model": "Windows",
    "hybrid_version_code": "100030010",
    "network_carrier": "",
    "network_speed": "10",
    "tz_offset": "28800",
    "tz_name": "Asia/Shanghai",
    "device_id": "",
    "mac_address": ""
  };

  try {
    const response = await axios.default.get("https://api.qishui.com/luna/player", {
      "params": params,
      "headers": QISHUI_PC_API_HEADERS
    });

    const data = response.data;
    const playerInfo = data?.player_info || {};
    const playInfoUrl = playerInfo?.url_player_info;
    let playInfoList = [];

    if (playInfoUrl) {
      const playInfoResponse = await axios.default.get(playInfoUrl);
      playInfoList = playInfoResponse?.data?.Result?.Data?.PlayInfoList || [];
    }

    return {
      "playInfoList": playInfoList,
      "playerInfo": playerInfo
    };
  } catch (error) {
    console.error(`[汽水音乐] fetchSeoTrackDataByVid 错误: ${error.message}`);
    return {
      "playInfoList": [],
      "playerInfo": {}
    };
  }
}

async function fetchPlaylistDetailFromApi(playlistId) {
  try {
    const apiData = await qishuiPcGet("/playlist/detail", {
      "playlist_id": playlistId,
      "cursor": "",
      "count": "1000"
    });

    if (apiData && Array.isArray(apiData.media_resources)) {
      return {
        "playlistInfo": apiData.playlist || null,
        "media_resources": apiData.media_resources,
        "has_more": apiData.has_more,
        "next_cursor": apiData.next_cursor
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

function extractIdFromUrl(url, type) {
  const idParam = type === "playlist" ? "playlist_id" : "track_id";
  const pathPattern = type === "playlist" ? "playlist" : "track";

  let extractedId = (url.match(new RegExp(`${pathPattern}\\/([\\d]+)`)) || [])[1];
  if (extractedId) return extractedId;

  extractedId = (url.match(new RegExp(`[?&]${idParam}=([\\d]+)`)) || [])[1];
  if (extractedId) return extractedId;

  extractedId = (url.match(/[?&]id=([\d]+)/) || [])[1];
  if (extractedId) return extractedId;

  return null;
}

async function resolveRedirectId(url, type) {
  try {
    const redirectRes = await axios.default.get(url.trim(), {
      "maxRedirects": 0,
      "validateStatus": status => status >= 200 && status < 400,
      "headers": QISHUI_WEB_SHARE_HEADERS
    });
    const location = redirectRes.headers && redirectRes.headers.location;
    if (location) {
      const redirectedId = extractIdFromUrl(location, type);
      if (redirectedId) return redirectedId;
      if (/douyin\.com\/s\//i.test(location) || /qishui\.douyin\.com/i.test(location)) {
        return resolveRedirectId(location, type);
      }
    }
  } catch (error) {
  }

  return null;
}

async function extractQishuiId(input, type = "playlist") {
  if (!input || typeof input !== "string") return null;

  const trimmedInput = input.trim();
  const plainId = (trimmedInput.match(/^(\d+)$/) || [])[1];
  if (plainId) return plainId;

  const directId = extractIdFromUrl(trimmedInput, type);
  if (directId) return directId;

  const longId = (trimmedInput.match(/\b\d{10,}\b/) || [])[0];
  if (longId) return longId;

  const urls = trimmedInput.match(/https?:\/\/[^\s@]+/g) || [];
  for (const url of urls) {
    const urlId = extractIdFromUrl(url, type);
    if (urlId) return urlId;

    if (/douyin\.com\/s\//i.test(url) || /qishui\.douyin\.com/i.test(url)) {
      const redirectedId = await resolveRedirectId(url, type);
      if (redirectedId) return redirectedId;
    }
  }

  return null;
}

async function importMusicPlaylist(playlistUrl) {
  const playlistId = await extractQishuiId(playlistUrl, "playlist");

  if (!playlistId) return;

  const playlistDetail = await fetchPlaylistDetail(playlistId);
  return playlistDetail.media_resources
    .filter(resource => resource.type === "track")
    .map(parsePlaylistMediaResource)
    .filter(Boolean);
}

async function importMusicItem(urlLike) {
  const trackId = await extractQishuiId(urlLike, "track");
  if (!trackId) return null;

  return getMusicInfo({
    "id": trackId
  });
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
    "sheetItem": parsePlaylistItem(playlistDetail.playlistInfo) || playlist,
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
    const response = await qishuiPcPost("/discover/mix", {
      "block_type": "discover_playlist_mix",
      "feed_discover_extra": {},
      "latest_douyin_liked_playlist_show_ts": 0,
      "sub_channel_id": subChannelId
    });

    if (response && Array.isArray(response.inner_block) && response.inner_block.length > 0) {
      return {
        "isEnd": !response.has_more,
        "data": response.inner_block.map(parseRecommendPlaylistBlock).filter(Boolean)
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
  let apiData;

  try {
    apiData = await qishuiPcGet(`/charts/${topListItem.id}`);
  } catch (error) {
    const response = await axios.default.get(`https://api5-lf.qishui.com/luna/charts/${topListItem.id}?charge=0`, {
      "headers": QISHUI_API_HEADERS
    });
    apiData = response.data;
  }

  const chart = apiData?.chart || {};

  return { ...topListItem, 
    "title": chart.title || topListItem.title,
    "musicList": (chart.track_ranks || []).map(parseRankTrackItem).filter(Boolean)
   };
}

async function getMusicComments(musicItem, page = 1) {
  const cursor = (page - 1) * PAGE_SIZE;
  const apiData = await qishuiPcGet("/comments", {
    "group_id": musicItem.id,
    "cursor": String(cursor),
    "count": String(PAGE_SIZE),
    "group_type": "1",
    "image_strategy": "2"
  });

  const comments = (apiData.comments || []).map(parseCommentItem).filter(Boolean);

  return {
    "isEnd": apiData.has_more === false || comments.length < PAGE_SIZE,
    "data": comments
  };
}

module.exports = {
  "platform": "汽水音乐",
  "author": "JanYun & Toskysun",
  "version": "3.0.1",
  "appVersion": ">0.1.0-alpha.0",
  "srcUrl": "https://music.cwo.cc.cd/plugins/qishui.js",
  "cacheControl": "no-cache",
  "supportedQualities": ["128k", "192k", "320k", "flac", "hires", "atmos", "atmos_plus"],
  "hints": {
    "importMusicSheet": [
      "汽水APP：歌单-分享-分享链接；手动访问链接后再复制链接粘贴即可",
      "网页：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
      "导入时间和歌单大小有关，请耐心等待"
    ],
    "importMusicItem": [
      "汽水APP：歌曲-分享-分享链接；也可以直接输入纯数字歌曲ID"
    ]
  },
  "supportedSearchType": ["music", "album", "artist", "sheet"],

  
  async "search"(query, page, type) {
    const searchType = type || "music";
    if (["music", "album", "artist", "sheet"].includes(searchType)) {
      return await searchQishui(query, page, searchType);
    }
    return {
      "isEnd": true,
      "data": []
    };
  },

  "getMediaSource": getMusicPlaybackSource,
  "getMusicInfo": getMusicInfo,
  "getLyric": getMusicDetailInfo,
  "getAlbumInfo": getAlbumInfo,
  "getArtistWorks": getArtistWorks,
  "importMusicSheet": importMusicPlaylist,
  "importMusicItem": importMusicItem,
  "getMusicSheetInfo": getMusicPlaylistInfo,
  "getRecommendSheetTags": getRecommendPlaylistTags,
  "getRecommendSheetsByTag": getRecommendPlaylistsByTag,
  "getTopLists": getTopLists,
  "getTopListDetail": getTopListDetail,
  "getMusicComments": getMusicComments
};
