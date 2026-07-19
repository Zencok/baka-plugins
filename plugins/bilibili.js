"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const axios_1 = require("axios");

const dayjs = require("dayjs");

const he = require("he");

const CryptoJs = require("crypto-js");

const { load } = require('cheerio');

const AudioQuality = {
    Audio64K: 30216,
    Audio132K: 30232,
    Audio192K: 30280,
    AudioDolby: 30250,
    AudioHiRes: 30251,
};

const QualityMap = {
    "128k": AudioQuality.Audio64K,
    "192k": AudioQuality.Audio132K,
    "320k": AudioQuality.Audio192K,
    "hires": AudioQuality.AudioHiRes,
    "dolby": AudioQuality.AudioDolby,
};

const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const headers = {
    "user-agent": CHROME_UA,
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};

const searchHeaders = {
    "user-agent": CHROME_UA,
    accept: "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br",
    origin: "https://search.bilibili.com",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: "https://search.bilibili.com/",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};

const pageSize = 20;

let cookie;

let img, sub, syncedTime;

let biliTicket;
let biliTicketExpires = 0;

let w_webid;

let w_webid_date;

function getSessdata() {
    const userVariables = env?.getUserVariables?.() || {};
    return userVariables.SESSDATA || '';
}

function buildCookieHeader() {
    const parts = [];
    if (cookie?.b_3) parts.push(`buvid3=${cookie.b_3}`);
    if (cookie?.b_4) parts.push(`buvid4=${cookie.b_4}`);
    if (biliTicket && Date.now() < biliTicketExpires) {
        parts.push(`bili_ticket=${biliTicket}`);
        parts.push(`bili_ticket_expires=${Math.floor(biliTicketExpires / 1000)}`);
    }
    const sessdata = getSessdata();
    if (sessdata) parts.push(`SESSDATA=${sessdata}`);
    return parts.join("; ");
}

function durationToSec(duration) {
    if (typeof duration === "number") {
        return duration;
    }
    if (typeof duration === "string") {
        var dur = duration.split(":");
        return dur.reduce(function (prev, curr) {
            return 60 * prev + +curr;
        }, 0);
    }
    return 0;
}

function getMixinKey(e) {
    var t = [];
    return ([
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
        49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
        40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
        62, 11, 36, 20, 34, 44, 52,
    ].forEach(function (r) {
        e.charAt(r) && t.push(e.charAt(r));
    }),
        t.join("").slice(0, 32));
}

function hmacSha256(key, message) {
    const hmac = CryptoJs.HmacSHA256(message, key);
    return hmac.toString(CryptoJs.enc.Hex);
}

function formatMedia(result) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const title = he.decode((_b = (_a = result.title) === null || _a === void 0 ? void 0 : _a.replace(/(\<em(.*?)\>)|(\<\/em\>)/g, "")) !== null && _b !== void 0 ? _b : "");

    const qualities = {
        "128k": {},
        "192k": {},
        "320k": {},
    };

    const owner = result.owner || {};
    const singerList = (owner.mid || owner.name) ? [{
        id: owner.mid,
        name: owner.name || result.author,
        avatar: owner.face || "",
    }] : [];

    const mid = owner.mid || result.mid;
    const artistName =
        (_e = result.author) !== null && _e !== void 0
            ? _e
            : (_f = result.owner) === null || _f === void 0
              ? void 0
              : _f.name;
    if (!singerList.length && (mid || artistName)) {
        singerList.push({
            id: mid,
            name: artistName || "",
            avatar: owner.face || "",
        });
    }

    return {
        id: (_d = (_c = result.cid) !== null && _c !== void 0 ? _c : result.bvid) !== null && _d !== void 0 ? _d : result.aid,
        aid: result.aid,
        bvid: result.bvid,
        artist: artistName,
        singerList: singerList,
        title,
        alias: (_g = title.match(/《(.+?)》/)) === null || _g === void 0 ? void 0 : _g[1],
        album: (_h = result.bvid) !== null && _h !== void 0 ? _h : result.aid,
        artwork: ((_j = result.pic) === null || _j === void 0 ? void 0 : _j.startsWith("//"))
            ? "http:".concat(result.pic)
            : result.pic,
        // 投稿列表用 length（"3:45"），搜索/详情用 duration（秒）
        duration: durationToSec(result.duration ?? result.length),
        tags: (_k = result.tag) === null || _k === void 0 ? void 0 : _k.split(","),
        date: dayjs.unix(result.pubdate || result.created).format("YYYY-MM-DD"),
        qualities: qualities,
    };
}

function formatComment(item) {
    var _a, _b, _c, _d, _e;
    return {
        id: item.rpid,
        nickName: (_a = item.member) === null || _a === void 0 ? void 0 : _a.uname,
        avatar: (_b = item.member) === null || _b === void 0 ? void 0 : _b.avatar,
        comment: (_c = item.content) === null || _c === void 0 ? void 0 : _c.message,
        like: item.like,
        createAt: item.ctime * 1000,
        location: ((_e = (_d = item.reply_control) === null || _d === void 0 ? void 0 : _d.location) === null || _e === void 0 ? void 0 : _e.startsWith("IP属地：")) ? item.reply_control.location.slice(5) : undefined
    };
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "未知";
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)}${units[unitIndex]}`;
}

async function getCid(bvid, aid) {
    const params = bvid
        ? {
            bvid: bvid,
        }
        : {
            aid: aid,
        };
    const cidRes = (await axios_1.default.get("https://api.bilibili.com/x/web-interface/view?%s", {
        headers: headers,
        params: params,
    })).data;
    return cidRes;
}

async function getCookie() {
    if (!cookie) {
        cookie = (await axios_1.default.get("https://api.bilibili.com/x/frontend/finger/spi", {
            headers: {
                "User-Agent": CHROME_UA,
            },
        })).data.data;
    }
}

async function getPlayurlData(bvid, aid, cid) {
    const _params = bvid ? { bvid: bvid } : { aid: aid };
    const params = { ..._params, ...{
        cid: cid,
        qn: 127,
        fnval: 4048,
        fnver: 0,
        fourk: 1,
    } };

    const res = (await axios_1.default.get("https://api.bilibili.com/x/player/playurl", {
        headers: headers,
        params: params,
    })).data;

    return res;
}

async function getBiliTicket(csrf) {
    const ts = Math.floor(Date.now() / 1000);
    const hexSign = hmacSha256('XgwSnGZ1p', `ts${ts}`);
    const url = 'https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket';
    try {
        const response = await axios_1.default.post(url, null, {
            params: {
                key_id: 'ec02',
                hexsign: hexSign,
                'context[ts]': ts,
                csrf: csrf || ''
            },
            headers: {
                'User-Agent': CHROME_UA,
            }
        });
        const data = await response.data;
        return data.data;
    }
    catch (e) {
        throw e;
    }
}

async function getWBIKeys() {
    const ticketValid = biliTicket && Date.now() < biliTicketExpires;
    if (img && sub && syncedTime && syncedTime.getDate() === (new Date()).getDate() && ticketValid) {
        return {
            img,
            sub
        };
    }
    else {
        const data = await getBiliTicket('');
        if (data?.ticket) {
            biliTicket = data.ticket;
            // ticket 约 3 天，提前 1 小时刷新
            const created = (data.created_at || Math.floor(Date.now() / 1000)) * 1000;
            const ttlMs = ((data.ttl || 259200) - 3600) * 1000;
            biliTicketExpires = created + Math.max(ttlMs, 60 * 60 * 1000);
        }
        img = data.nav.img;
        img = img.slice(img.lastIndexOf('/') + 1, img.lastIndexOf('.'));
        sub = data.nav.sub;
        sub = sub.slice(sub.lastIndexOf('/') + 1, sub.lastIndexOf('.'));
        syncedTime = new Date();
        return {
            img,
            sub
        };
    }
}

async function getRid(params) {
    const wbiKeys = await getWBIKeys();
    const npi = wbiKeys.img + wbiKeys.sub;
    const o = getMixinKey(npi);
    const l = Object.keys(params).sort();
    let c = [];
    for (let d = 0, u = /[!'\(\)*]/g; d < l.length; ++d) {
        let [h, p] = [l[d], params[l[d]]];
        if (typeof p === "number" || typeof p === "boolean") {
            p = String(p);
        }
        if (p && "string" == typeof p) {
            p = p.replace(u, "");
        }
        // 跳过空字符串，避免 WBI 签名与浏览器不一致
        if (p != null && p !== "") {
            c.push("".concat(encodeURIComponent(h), "=").concat(encodeURIComponent(p)));
        }
    }
    const f = c.join("&");
    const w_rid = CryptoJs.MD5(f + o).toString();
    return w_rid;
}

async function getWWebId(id) {
    if (w_webid && w_webid_date && (Date.now() - w_webid_date.getTime() < 1000 * 60 * 60)) {
        return w_webid;
    }
    const html = (await axios_1.default.get("https://space.bilibili.com/" + id, {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
        }
    })).data;
    const $ = load(html);
    const content = $("#__RENDER_DATA__").text();
    const jsonContent = JSON.parse(decodeURIComponent(content));
    w_webid = jsonContent.access_id;
    w_webid_date = new Date();
    return w_webid;
}

async function searchBase(keyword, page, searchType) {
    await getCookie();
    const params = {
        context: "",
        page: page,
        order: "",
        page_size: pageSize,
        keyword: keyword,
        duration: "",
        tids_1: "",
        tids_2: "",
        __refresh__: true,
        _extra: "",
        highlight: 1,
        single_column: 0,
        platform: "pc",
        from_source: "",
        search_type: searchType,
        dynamic_offset: 0,
    };
    const res = (await axios_1.default.get("https://api.bilibili.com/x/web-interface/search/type", {
        headers: { ...searchHeaders, ...{ cookie: buildCookieHeader() } },
        params: params,
    })).data;
    return res.data;
}

async function searchAlbum(keyword, page) {
    await getCookie();
    const resultData = await searchBase(keyword, page, "video");
    const albums = (resultData?.result || []).map(formatMedia);

    return {
        isEnd: !resultData?.numResults || resultData.numResults <= page * pageSize,
        data: albums,
    };
}

async function searchArtist(keyword, page) {
    const resultData = await searchBase(keyword, page, "bili_user");
    const artists = (resultData?.result || []).map((result) => {
        var _a;
        return ({
            name: result.uname,
            id: result.mid,
            fans: result.fans,
            description: result.usign,
            avatar: ((_a = result.upic) === null || _a === void 0 ? void 0 : _a.startsWith("//"))
                ? `https://${result.upic}`
                : result.upic,
            worksNum: result.videos,
        });
    });
    return {
        isEnd: !resultData?.numResults || resultData.numResults <= page * pageSize,
        data: artists,
    };
}

async function getMediaSource(musicItem, quality) {
    var _a;
    let cid = musicItem.cid;
    if (!cid) {
        cid = (await getCid(musicItem.bvid, musicItem.aid)).data.cid;
    }

    const res = await getPlayurlData(musicItem.bvid, musicItem.aid, cid);

    let url;

    if (res.data && res.data.dash) {
        const dash = res.data.dash;

        if (quality === "dolby" && dash.dolby && dash.dolby.audio && dash.dolby.audio.length > 0) {
            url = dash.dolby.audio[0].baseUrl || dash.dolby.audio[0].base_url;
        }

        if (!url && (quality === "dolby" || quality === "hires") && dash.flac && dash.flac.audio) {
            url = dash.flac.audio.baseUrl || dash.flac.audio.base_url;
        }

        if (!url && dash.audio && dash.audio.length > 0) {
            const audios = [...dash.audio];
            audios.sort((a, b) => b.id - a.id);

            const targetQualityId = QualityMap[quality];
            let audio = null;

            if (targetQualityId) {
                audio = audios.find(a => a.id === targetQualityId);
                if (!audio) {
                    audio = audios[0];
                }
            } else {
                audio = audios[0];
            }

            if (audio) {
                url = audio.baseUrl || audio.base_url;
            }
        }
    } else if (res.data && res.data.durl && res.data.durl.length > 0) {
        url = res.data.durl[0].url;
    }

    if (!url) {
        throw new Error("无法获取音频地址");
    }

    const hostUrl = url.substring(url.indexOf("/") + 2);
    const _headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
        accept: "*/*",
        host: hostUrl.substring(0, hostUrl.indexOf("/")),
        "accept-encoding": "gzip, deflate, br",
        connection: "keep-alive",
        referer: "https://www.bilibili.com/video/".concat((_a = (musicItem.bvid !== null && musicItem.bvid !== undefined
            ? musicItem.bvid
            : musicItem.aid)) !== null && _a !== void 0 ? _a : ""),
    };
    return {
        url: url,
        headers: _headers,
    };
}

async function getMusicInfo(musicBase) {
    if (musicBase.artwork && musicBase.qualities && Object.keys(musicBase.qualities).length > 0) {
        return {
            id: musicBase.id,
            bvid: musicBase.bvid,
            aid: musicBase.aid,
            cid: musicBase.cid,
            title: musicBase.title,
            artist: musicBase.artist,
            album: musicBase.album,
            artwork: musicBase.artwork,
            duration: musicBase.duration,
            qualities: musicBase.qualities,
            platform: 'bilibili',
        };
    }

    const bvid = musicBase.bvid || (typeof musicBase.id === 'string' && musicBase.id.startsWith('BV') ? musicBase.id : null);
    const aid = musicBase.aid || (typeof musicBase.id === 'number' || (typeof musicBase.id === 'string' && /^\d+$/.test(musicBase.id)) ? musicBase.id : null);

    if (!bvid && !aid) {
        console.error('[bilibili] getMusicInfo: 缺少有效的bvid或aid');
        return null;
    }

    try {
        const cidRes = await getCid(bvid, aid);

        if (!cidRes || !cidRes.data) {
            console.error('[bilibili] getMusicInfo: 未找到视频信息');
            return null;
        }

        const videoData = cidRes.data;
        const cid = videoData.cid;

        const res = await getPlayurlData(bvid, aid, cid);

        const qualities = {};

        if (res.data && res.data.dash) {
            const dash = res.data.dash;
            const duration = dash.duration || 0;

            if (dash.audio && dash.audio.length > 0) {
                for (const audio of dash.audio) {
                    const size = formatFileSize(audio.bandwidth * duration / 8);
                    switch (audio.id) {
                        case AudioQuality.Audio64K:
                            qualities["128k"] = { size: size };
                            break;
                        case AudioQuality.Audio132K:
                            qualities["192k"] = { size: size };
                            break;
                        case AudioQuality.Audio192K:
                            qualities["320k"] = { size: size };
                            break;
                    }
                }
            }

            if (dash.flac && dash.flac.audio) {
                const flacAudio = dash.flac.audio;
                qualities["hires"] = {
                    size: formatFileSize(flacAudio.bandwidth * duration / 8),
                };
            }

            if (dash.dolby && dash.dolby.audio && dash.dolby.audio.length > 0) {
                const dolbyAudio = dash.dolby.audio[0];
                qualities["dolby"] = {
                    size: formatFileSize(dolbyAudio.bandwidth * duration / 8),
                };
            }
        }

        if (Object.keys(qualities).length === 0) {
            qualities["128k"] = {};
        }

        let artwork = videoData.pic;
        if (artwork && artwork.startsWith("//")) {
            artwork = "http:" + artwork;
        }

        const owner = videoData.owner || {};
        const singerList = (owner.mid || owner.name) ? [{
            id: owner.mid,
            name: owner.name,
            avatar: owner.face || "",
        }] : [];

        return {
            id: cid || bvid || aid,
            bvid: videoData.bvid,
            aid: videoData.aid,
            cid: cid,
            title: videoData.title || '',
            artist: videoData.owner?.name || '',
            singerList: singerList,
            album: videoData.bvid || videoData.aid,
            artwork: artwork,
            duration: videoData.duration,
            qualities: qualities,
            platform: 'bilibili',
        };
    } catch (error) {
        console.error('[bilibili] getMusicInfo 错误:', error.message);
        return null;
    }
}

async function getArtistWorks(artistItem, page, type) {
    // 空间投稿 /x/space/wbi/arc/search：
    // - 缺 dm_img_* → code -352 风控
    // - 缺 bili_ticket / 旧 web_location → HTTP 412 banned
    // - 需 WBI(wts/w_rid) + buvid3/4 + bili_ticket + dm_img_* + web_location=333.1387
    try {
        await getCookie();
        await getWBIKeys();

        const mid = String(artistItem.id || artistItem.mid || "");
        if (!mid) {
            return { isEnd: true, data: [] };
        }

        const queryHeaders = {
            "user-agent": CHROME_UA,
            accept: "application/json, text/plain, */*",
            origin: "https://space.bilibili.com",
            referer: `https://space.bilibili.com/${mid}/video`,
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            cookie: buildCookieHeader(),
        };

        const now = Math.floor(Date.now() / 1000);
        const params = {
            mid,
            pn: String(page || 1),
            ps: "30",
            index: "1",
            order: "pubdate",
            order_avoided: "true",
            platform: "web",
            web_location: "333.1387",
            // WebGL/GPU 指纹占位（浏览器侧同款字段）；必须参与签名
            dm_img_list: "[]",
            dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
            dm_cover_img_str:
                "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDE2NTAgKDB4MDAwMDFGOTEpIERpcmVjdDNEMTEgdnNfNV8wIHBzXzVfMCwgRDNEMTEpR29vZ2xlIEluYy4gKE5WSURJQS",
            dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
            wts: String(now),
        };
        const w_rid = await getRid(params);

        const res = (
            await axios_1.default.get(
                "https://api.bilibili.com/x/space/wbi/arc/search",
                {
                    headers: queryHeaders,
                    params: { ...params, w_rid },
                    timeout: 15000,
                    validateStatus: (status) => status < 500,
                }
            )
        ).data;

        if (!res || res.code !== 0 || !res.data?.list?.vlist) {
            console.error(
                "[bilibili] getArtistWorks 失败:",
                res?.code,
                res?.message || res
            );
            return { isEnd: true, data: [] };
        }

        const resultData = res.data;
        const albums = resultData.list.vlist.map(formatMedia);
        return {
            isEnd:
                resultData.page.pn * resultData.page.ps >= resultData.page.count,
            data: albums,
        };
    } catch (error) {
        console.error("[bilibili] getArtistWorks 错误:", error.message);
        return { isEnd: true, data: [] };
    }
}

async function getFavoriteList(id) {
    const result = [];
    const pageSize = 20;
    let page = 1;
    while (true) {
        try {
            const { data: { data: { medias, has_more }, }, } = await axios_1.default.get("https://api.bilibili.com/x/v3/fav/resource/list", {
                params: {
                    media_id: id,
                    platform: "web",
                    ps: pageSize,
                    pn: page,
                },
            });
            result.push(...medias);
            if (!has_more) {
                break;
            }
            page += 1;
        }
        catch (error) {
            console.warn(error);
            break;
        }
    }
    return result;
}

async function importMusicSheet(urlLike) {
    var _a, _b, _c, _d;
    let id;
    if (!id) {
        id = (_a = urlLike.match(/^\s*(\d+)\s*$/)) === null || _a === void 0 ? void 0 : _a[1];
    }
    if (!id) {
        id = (_b = urlLike.match(/^(?:.*)fid=(\d+).*$/)) === null || _b === void 0 ? void 0 : _b[1];
    }
    if (!id) {
        id = (_c = urlLike.match(/\/playlist\/pl(\d+)/i)) === null || _c === void 0 ? void 0 : _c[1];
    }
    if (!id) {
        id = (_d = urlLike.match(/\/list\/ml(\d+)/i)) === null || _d === void 0 ? void 0 : _d[1];
    }
    if (!id) {
        return;
    }
    const musicSheet = await getFavoriteList(id);
    return musicSheet.map((_) => {
        var _a, _b;
        return ({
            id: _.id,
            aid: _.aid,
            bvid: _.bvid,
            artwork: _.cover,
            title: _.title,
            artist: (_a = _.upper) === null || _a === void 0 ? void 0 : _a.name,
            album: (_b = _.bvid) !== null && _b !== void 0 ? _b : _.aid,
            duration: durationToSec(_.duration),
            qualities: {
                "128k": {},
                "192k": {},
                "320k": {},
            },
        });
    });
}

async function getTopLists() {
    const precious = {
        title: "入站必刷",
        data: [
            {
                id: "popular/precious?page_size=100&page=1",
                title: "入站必刷",
                coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_history.png",
            },
        ],
    };
    const weekly = {
        title: "每周必看",
        data: [],
    };
    const weeklyRes = await axios_1.default.get("https://api.bilibili.com/x/web-interface/popular/series/list", {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
    });
    weekly.data = weeklyRes.data.data.list.slice(0, 8).map((e) => ({
        id: `popular/series/one?number=${e.number}`,
        title: e.subject,
        description: e.name,
        coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_weekly.png",
    }));
    const boardKeys = [
        {
            id: "ranking/v2?rid=0&type=all",
            title: "全站",
        },
        {
            id: "ranking/v2?rid=3&type=all",
            title: "音乐",
        },
        {
            id: "ranking/v2?rid=1&type=all",
            title: "动画",
        },
        {
            id: "ranking/v2?rid=119&type=all",
            title: "鬼畜",
        },
        {
            id: "ranking/v2?rid=168&type=all",
            title: "国创相关",
        },
        {
            id: "ranking/v2?rid=129&type=all",
            title: "舞蹈",
        },
        {
            id: "ranking/v2?rid=4&type=all",
            title: "游戏",
        },
        {
            id: "ranking/v2?rid=36&type=all",
            title: "知识",
        },
        {
            id: "ranking/v2?rid=188&type=all",
            title: "科技",
        },
        {
            id: "ranking/v2?rid=234&type=all",
            title: "运动",
        },
        {
            id: "ranking/v2?rid=223&type=all",
            title: "汽车",
        },
        {
            id: "ranking/v2?rid=160&type=all",
            title: "生活",
        },
        {
            id: "ranking/v2?rid=211&type=all",
            title: "美食",
        },
        {
            id: "ranking/v2?rid=217&type=all",
            title: "动物圈",
        },
        {
            id: "ranking/v2?rid=155&type=all",
            title: "时尚",
        },
        {
            id: "ranking/v2?rid=5&type=all",
            title: "娱乐",
        },
        {
            id: "ranking/v2?rid=181&type=all",
            title: "影视",
        },
        {
            id: "ranking/v2?rid=0&type=origin",
            title: "原创",
        },
        {
            id: "ranking/v2?rid=0&type=rookie",
            title: "新人",
        },
    ];
    const board = {
        title: "排行榜",
        data: boardKeys.map((_) => ({ ..._, ...{ coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_rank.png" } })),
    };
    return [weekly, precious, board];
}

async function getTopListDetail(topListItem) {
    await getCookie();
    const [path, queryString] = topListItem.id.split('?');
    const queryParams = {};
    if (queryString) {
        queryString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            queryParams[key] = value;
        });
    }
    const needsWbi = path.includes('popular/series') || path.includes('ranking');
    let params = queryParams;
    if (needsWbi) {
        const now = Math.round(Date.now() / 1e3);
        params = { ...queryParams, ...{ wts: now.toString() } };
        const w_rid = await getRid(params);
        params.w_rid = w_rid;
    }
    const res = await axios_1.default.get(`https://api.bilibili.com/x/web-interface/${path}`, {
        headers: { ...headers, ...{
            referer: "https://www.bilibili.com/",
            cookie: buildCookieHeader()
        } },
        params: params,
    });
    return { ...topListItem, musicList: res.data.data.list.map(formatMedia) };
}

async function getMusicComments(musicItem) {
    var _a, _b;
    const params = {
        type: 1,
        mode: 3,
        oid: musicItem.aid,
        plat: 1,
        web_location: 1315875,
        wts: Math.floor(Date.now() / 1000)
    };
    const w_rid = await getRid(params);
    const res = (await (axios_1.default.get("https://api.bilibili.com/x/v2/reply/wbi/main", {
        params: { ...params, ...{ w_rid } }
    }))).data;
    const data = res.data.replies;
    const comments = [];
    for (let i = 0; i < data.length; ++i) {
        comments[i] = formatComment(data[i]);
        if ((_a = data[i].replies) === null || _a === void 0 ? void 0 : _a.length) {
            comments[i].replies = (_b = data[i]) === null || _b === void 0 ? void 0 : _b.replies.map(formatComment);
        }
    }
    return {
        isEnd: true,
        data: comments
    };
}

function getMusicDetailPageUrl(musicItem) {
    const bvid = musicItem.bvid || musicItem._bilibiliData?.bvid ||
        (typeof musicItem.id === "string" && musicItem.id.startsWith("BV") ? musicItem.id : "");
    if (bvid) {
        return `https://www.bilibili.com/video/${bvid}`;
    }

    const aid = musicItem.aid || musicItem._bilibiliData?.aid ||
        (musicItem.id && /^\d+$/.test(String(musicItem.id)) ? musicItem.id : "");
    return aid ? `https://www.bilibili.com/video/av${aid}` : "";
}

module.exports = {
    platform: "bilibili",
    author: "Toskysun",
    version: "1.0.2",
    appVersion: ">=0.0",
    srcUrl: "https://music.cwo.cc.cd/plugins/bilibili.js",
    cacheControl: "no-cache",
    primaryKey: ["id", "aid", "bvid", "cid"],
    supportedQualities: ["128k", "192k", "320k", "hires", "dolby"],
    userVariables: [
        {
            key: "SESSDATA",
            name: "登录Cookie",
            hint: "填写SESSDATA可获取更高音质(Hi-Res/杜比)和会员内容。从浏览器Cookie中获取SESSDATA值",
        },
    ],
    hints: {
        importMusicSheet: [
            "bilibili 移动端：APP点击我的，空间，右上角分享，复制链接，浏览器打开切换桌面版网站，点击播放全部视频，复制链接",
            "bilibili H5/PC端：复制收藏夹URL，或者直接输入ID即可",
            "非公开收藏夹无法导入，编辑收藏夹改为公开即可",
            "导入时间和歌单大小有关，请耐心等待",
        ],
    },
    supportedSearchType: ["music", "album", "artist"],
    async search(keyword, page, type) {
        if (type === "album" || type === "music") {
            return await searchAlbum(keyword, page);
        }
        if (type === "artist") {
            return await searchArtist(keyword, page);
        }
    },
    getMediaSource,
    getMusicInfo,
    getMusicDetailPageUrl,
    async getAlbumInfo(albumItem) {
        var _a;
        const cidRes = await getCid(albumItem.bvid, albumItem.aid);
        const _ref2 = (_a = cidRes === null || cidRes === void 0 ? void 0 : cidRes.data) !== null && _a !== void 0 ? _a : {};
        const cid = _ref2.cid;
        const pages = _ref2.pages;
        let musicList;
        if (pages.length === 1) {
            musicList = [{ ...albumItem, cid: cid }];
        }
        else {
            musicList = pages.map(function (_) {
                return { ...albumItem, cid: _.cid, title: _.part, duration: durationToSec(_.duration), id: _.cid };
            });
        }
        return {
            musicList,
        };
    },
    getArtistWorks,
    importMusicSheet,
    getTopLists,
    getTopListDetail,
    getMusicComments,
};
