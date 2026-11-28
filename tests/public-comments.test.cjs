const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const providers = ['wy', 'qq', 'kg', 'kw', 'mg', 'bilibili'];
const entity = { id: '123', songId: '123' };
const rawText = 'first\\nsecond/nthird\r\nfourth<br>fifth https://fixture.test/new www.example/news C:\\new\\rock /notes';
const text = 'first\nsecond\nthird\nfourth\nfifth https://fixture.test/new www.example/news C:\\new\\rock /notes';
const plain = value => JSON.parse(JSON.stringify(value));
const requestOf = (url, options = {}, data) => {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(options.params || {})) parsed.searchParams.set(key, value);
  return { url: parsed.toString(), body: data == null ? undefined : typeof data === 'string' ? data : JSON.stringify(data) };
};
function load(provider, version, respond) {
  let source = fs.readFileSync(path.join(__dirname, '../plugins', version === 2 ? 'v2' : '', provider + '.js'), 'utf8');
  const overrides = {
    getParamsAndEnc: value => ({ params: value }),
    getMusicInfoForComment: async () => 123,
    getMusicInfoRaw: async () => ({ classification: [{ res_id: '456' }] }),
    signatureParams: () => 'fixture-signature',
    apiGet: async (url, options) => respond(requestOf('https://api.bilibili.com' + url, { params: options })),
  };
  const names = { wy: ['getParamsAndEnc'], qq: ['getMusicInfoForComment'], kg: ['getMusicInfoRaw', 'signatureParams'], kw: [], mg: [], bilibili: ['apiGet'] }[provider];
  const assignments = names.map(name => `${name} = overrides.${name};`).join('\n');
  if (version === 2) source = source.replace(/return \{\s*search,/, `${assignments}\nreturn { search,`);
  const axios = async options => ({ status: 200, data: await respond(requestOf(options.url, options, options.data)) });
  axios.get = (url, options = {}) => axios({ ...options, url });
  axios.post = (url, data, options = {}) => axios({ ...options, url, data });
  axios.default = axios;
  const module = { exports: {} };
  const scope = vm.createContext({ module, exports: module.exports, overrides, UPDATE_URL: '', console: { log() {}, error() {}, warn() {} },
    require: name => name === 'axios' ? axios : name === 'buffer' ? { Buffer } : name === 'crypto' ? crypto : name === 'crypto-js' ? { MD5: value => ({ toString: () => crypto.createHash('md5').update(value).digest('hex') }) } : name === 'qs' ? { stringify: value => new URLSearchParams(value).toString() } : {},
  });
  vm.runInContext(source, scope);
  if (version === 1) vm.runInContext(assignments, scope);
  const sdk = {
    settings: {}, log: { error() {}, warn() {}, info() {}, debug() {} },
    bytes: { encode: value => Buffer.from(value).toString('hex') },
    crypto: { hash: (algorithm, value) => crypto.createHash(algorithm).update(Buffer.from(value, 'hex')).digest('hex') },
    http: { request: async request => ({ status: 200, headers: {}, body: JSON.stringify(await respond(request)) }) },
  };
  const plugin = module.exports;
  return {
    plugin,
    list: async request => version === 2
      ? plugin.handlers.comments.list({ entity, ...request }, sdk)
      : plugin.getMusicComments(request.entity || entity, request.page || 1, request),
  };
}
function row(provider, id = '100', root = true) {
  const replies = root ? [row(provider, '101', false), row(provider, '102', false)] : [];
  const avatar = `//fixture.test/${id}.jpg`;
  switch (provider) {
    case 'wy': return { commentId: id, content: rawText, time: 1700000000000, user: { nickname: id, avatarUrl: avatar }, beReplied: root ? [{ beRepliedCommentId: '99', content: 'quoted', user: { nickname: 'quote', avatarUrl: '//fixture.test/99.jpg' } }] : [], showFloorComment: { replyCount: root ? 21 : 0 } };
    case 'qq': return { CmId: id, SeqNo: id + '0', Content: rawText, Nick: id, Avatar: avatar, PubTime: 1700000000, ReplyCnt: root ? 21 : 0, RepliedComments: root ? [{ CmId: 'quote!.*', Nick: 'quote', Content: 'quoted' }] : [], SubComments: replies };
    case 'kg': return { id, content: rawText, user_name: id, user_pic: avatar, addtime: '2026-11-24 22:10:00', like: { likenum: 3 }, reply_num: root ? 21 : 0, replys: replies, ...(root ? { pcontent: 'quoted', puser: 'quote', puser_id: '99' } : {}) };
    case 'kw': return { id, msg: rawText, u_name: id, u_pic: avatar, time: 1700000000, child_comments: replies, child_comments_count: root ? 21 : 0 };
    case 'mg': return { commentId: id, replyId: id, commentInfo: rawText, replyInfo: rawText, commentTime: '2026-11-24 22:10', replyTime: '2026-11-24 22:10', user: { nickName: id, middleIcon: avatar }, opNumItem: { thumbNum: 3 }, replyComments: replies, replyTotalCount: root ? 21 : 0 };
    case 'bilibili': return { rpid: id, content: { message: rawText }, member: { uname: id, avatar }, ctime: 1700000000, rcount: root ? 21 : 0, replies };
  }
}
function response(provider, order, rows, { thread = false, more = false } = {}) {
  switch (provider) {
    case 'wy': return thread ? { code: 200, data: { comments: rows, totalCount: 21, hasMore: more, time: 1700000000000 } } : { code: 200, hotComments: order === 'hot' ? rows : [], comments: order === 'latest' ? rows : [], total: rows.length, hasMore: more, more };
    case 'qq': return { code: 0, req: { code: 0, data: { CommentList: { Comments: rows, Total: thread ? 21 : rows.length } } } };
    case 'kg': return { err_code: 0, childrenid: '789', list: rows, count: rows.length, comments_num: thread ? 21 : rows.length, current_page: 1 };
    case 'kw': return thread ? { code: '200', child_comments: rows, child_comments_count: 21 } : { code: '200', comments: order === 'latest' ? rows : [], comments_counts: rows.length, hot_comments: order === 'hot' ? rows : [], hot_comments_counts: rows.length };
    case 'mg': return { code: '000000', data: thread ? { replyTotalCount: 21, mainCommentItem: { replyComments: rows } } : { comments: order === 'latest' ? rows : [], commentNums: String(rows.length), hotComments: order === 'hot' ? rows : [], cfgHotCount: String(rows.length) } };
    case 'bilibili': return { code: 0, data: { replies: rows, page: { count: 21 }, cursor: { is_end: !more, all_count: 21, pagination_reply: { next_offset: more ? 'opaque-offset' : '' } } } };
  }
}
function assertOrder(provider, order, request, thread = false) {
  const url = new URL(request.url);
  const body = request.body && JSON.parse(request.body.startsWith('{') ? request.body : '{}');
  switch (provider) {
    case 'wy': assert.match(url.pathname, thread ? /comment\/floor\/get$/ : order === 'hot' ? /\/hotcomments\// : /\/comments\//); break;
    case 'qq': assert.equal(body.req.method, thread ? 'GetReplyCommentList' : order === 'hot' ? 'GetHotCommentList' : 'GetNewCommentList'); break;
    case 'kg': assert.match(request.url, thread ? /getReplyWithLike/ : new RegExp('/rank/' + (order === 'hot' ? 'topliked' : 'newest'))); break;
    case 'kw': assert.equal(url.searchParams.get('type'), thread ? 'get_child_comment' : order === 'hot' ? 'get_rec_comment' : 'get_comment'); break;
    case 'mg': assert.equal(url.searchParams.get('queryType'), thread || order === 'hot' ? '2' : '1'); if (thread) assert.match(url.pathname, /\/stack\/100\/v1\.0$/); break;
    case 'bilibili': if (thread) assert.match(url.pathname, /\/reply\/reply$/); else assert.equal(url.searchParams.get('mode'), order === 'hot' ? '3' : '2'); break;
  }
}
for (const provider of providers) for (const version of [1, 2]) {
  for (const sort of [undefined, 'hot', 'latest', 'newest']) test(`${provider} V${version}: ${sort || 'default'} uses upstream order and preserves text/avatars`, async () => {
    const order = sort === 'latest' || sort === 'newest' ? 'latest' : 'hot';
    const loaded = load(provider, version, request => { assertOrder(provider, order, request); return response(provider, order, [row(provider)]); });
    const page = await loaded.list({ sort });
    const first = (page.items || page.data)[0];
    assert.ok(first, 'expected a real comment');
    assert.equal(first.comment, text);
    assert.equal(first.avatar, 'https://fixture.test/100.jpg');
    assert.ok(first.replyContext && first.replyContext.provider === 'cc.baka.' + provider);
    if (provider === 'wy') { assert.equal(first.replies.length, 0); assert.equal(first.quote.comment, 'quoted'); }
    else {
      assert.equal(first.replies.length, 2);
      assert.deepEqual(plain(first.replies.map(item => item.avatar)), ['https://fixture.test/101.jpg', 'https://fixture.test/102.jpg']);
      assert.ok(first.replies.every(item => item.comment === text));
    }
    if (provider === 'kg' || provider === 'qq') assert.equal(first.quote.comment, 'quoted');
    if (provider === 'qq') assert.equal(first.replyCount, 21);
  });
  test(`${provider} V${version}: thread context loads real replies and rejects another entity`, async () => {
    let thread = false;
    let calls = 0;
    const loaded = load(provider, version, request => { calls++; assertOrder(provider, 'hot', request, thread); return response(provider, 'hot', thread ? [row(provider, '201', false), row(provider, '202', false)] : [row(provider)], { thread }); });
    const root = (await loaded.list({}));
    const replyContext = (root.items || root.data)[0].replyContext;
    assert.ok(replyContext);
    thread = true;
    const replies = await loaded.list({ replyContext });
    assert.deepEqual(plain((replies.items || replies.data).map(item => item.id)), ['201', '202']);
    const before = calls;
    await assert.rejects(loaded.list({ entity: { id: 'other' }, replyContext }), /context|scope|identity/i);
    for (const invalid of [{ ...replyContext, rootId: '../escape' }, { ...replyContext, provider: 'different' }, []]) {
      await assert.rejects(loaded.list({ replyContext: invalid }), /context|scope|identity/i);
    }
    assert.equal(calls, before, 'mismatched scope must fail before HTTP');
  });
  test(`${provider} V${version}: expanded replies use native continuation through the final page`, async () => {
    let thread = false;
    let page = 0;
    const calls = [];
    const loaded = load(provider, version, request => {
      if (!thread) return response(provider, 'hot', [row(provider)]);
      calls.push(request);
      const rows = page++ === 0 ? Array.from({ length: 20 }, (_, index) => row(provider, String(201 + index), false)) : [row(provider, '221', false)];
      return response(provider, 'hot', rows, { thread: true, more: page === 1 });
    });
    const root = await loaded.list({});
    const replyContext = (root.items || root.data)[0].replyContext;
    assert.equal(calls.length, 0, 'root listing must not eagerly fetch threads');
    thread = true;
    const first = await loaded.list({ replyContext, limit: 20 });
    assert.equal((first.items || first.data).length, 20);
    assert.equal(version === 2 ? Boolean(first.nextCursor) : !first.isEnd, true);
    const last = await loaded.list({ replyContext, limit: 20, cursor: first.nextCursor, page: 2 });
    assert.deepEqual(plain((last.items || last.data).map(item => item.id)), ['221']);
    assert.equal(version === 2 ? last.nextCursor : last.isEnd, version === 2 ? null : true);
    assert.equal(calls.length, 2);
    const second = new URL(calls[1].url);
    if (provider === 'wy') assert.equal(JSON.parse(new URLSearchParams(calls[1].body).get('params')).time, 1700000000000);
    if (provider === 'qq') assert.equal(JSON.parse(calls[1].body).req.param.LastCommentSeqNo, '2200');
    if (provider === 'kg') { assert.equal(second.origin + second.pathname, 'https://gateway.kugou.com/index.php'); assert.equal(second.searchParams.get('p'), '2'); assert.equal(second.searchParams.get('childrenid'), '789'); assert.equal(second.searchParams.get('mixsongid'), '456'); }
    if (provider === 'kw') { assert.equal(second.searchParams.get('start'), '20'); assert.equal(second.searchParams.get('pcid'), '100'); }
    if (provider === 'mg') assert.equal(second.searchParams.get('start'), '20');
    if (provider === 'bilibili') assert.equal(second.searchParams.get('pn'), '2');
  });
}

for (const provider of providers) test(`${provider} V2: comment cursor binds canonical sort, typed identity, limit and reply context`, async () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(provider, String(100 + i), false));
  const loaded = load(provider, 2, request => {
    if (provider !== 'mg') return response(provider, 'hot', rows, { more: true });
    const offset = Number(new URL(request.url).searchParams.get('hotCommentStart'));
    return { code: '000000', data: { hotComments: [row(provider, String(100 + offset), false)], cfgHotCount: '40' } };
  });
  const request = { limit: 1 };
  const first = await loaded.list(request);
  assert.ok(first.nextCursor);
  for (const changed of [{ sort: 'latest' }, { entity: { id: 123 } }, { limit: 2 }, { replyContext: { v: 1, provider: 'cc.baka.' + provider, entityId: '123', rootId: '100' } }]) {
    await assert.rejects(loaded.list({ ...request, ...changed, cursor: first.nextCursor }), /cursor|context|scope/i);
  }
  const next = await loaded.list({ ...request, sort: 'hot', cursor: first.nextCursor });
  assert.equal(next.items.length, 1);
});

test('Apple Music still does not advertise a comment capability or legacy method', () => {
  const scope = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/v2/am.js'), 'utf8'), scope);
  assert.equal(scope.module.exports.manifest.capabilities.includes('comments.list'), false);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../plugins/am.js'), 'utf8'), /getMusicComments/);
});

for (const version of [1, 2]) test(`QQ V${version}: real comment IDs, ReplyCnt, quotes and HasMore drive native continuation`, async () => {
  let rootCalls = 0;
  let threadCalls = 0;
  const loaded = load('qq', version, request => {
    const operation = JSON.parse(request.body).req;
    const thread = operation.method === 'GetReplyCommentList';
    const page = thread ? threadCalls++ : rootCalls++;
    if (thread) assert.equal(operation.param.RootCmId, 'root!.*');
    assert.equal(operation.param.PageNum, page);
    assert.equal(operation.param.LastCommentSeqNo, page ? '2020' : '');
    const rows = page ? [row('qq', '203', false)] : [row('qq', thread ? '201' : 'root!.*', !thread), row('qq', '202', false)];
    return { code: 0, req: { code: 0, data: { CommentList: { Comments: rows, Total: 3, HasMore: page === 0 } } } };
  });
  const root = await loaded.list({ limit: 20 });
  const first = (root.items || root.data)[0];
  assert.equal(first.replyCount, 21);
  assert.equal(first.quote.id, 'quote!.*');
  assert.equal(first.quote.avatar, undefined, 'a quoted parent must not borrow the root avatar');
  assert.equal(first.replies.length, 2, 'quoted parents must not become actual replies');
  assert.equal(version === 2 ? Boolean(root.nextCursor) : !root.isEnd, true, 'short native pages must respect HasMore');
  const rootEnd = await loaded.list({ limit: 20, cursor: root.nextCursor, page: 2 });
  assert.equal(version === 2 ? rootEnd.nextCursor : rootEnd.isEnd, version === 2 ? null : true);
  const thread = await loaded.list({ limit: 20, replyContext: first.replyContext });
  const threadEnd = await loaded.list({ limit: 20, replyContext: first.replyContext, cursor: thread.nextCursor, page: 2 });
  assert.equal(version === 2 ? threadEnd.nextCursor : threadEnd.isEnd, version === 2 ? null : true);
  assert.equal(rootCalls, 2);
  assert.equal(threadCalls, 2);
});

for (const version of [1, 2]) test(`KG V${version}: opaque thread identity comes from root childrenid and rejects malformed context`, async () => {
  let calls = 0;
  const loaded = load('kg', version, request => { calls++; return response('kg', 'hot', [row('kg')]); });
  const root = await loaded.list({});
  const context = (root.items || root.data)[0].replyContext;
  assert.equal(context.childrenId, '789');
  assert.equal(context.mixsongId, '456');
  for (const invalid of [{ ...context, childrenId: undefined }, { ...context, childrenId: '../456' }, { ...context, mixsongId: 'not-numeric' }]) {
    await assert.rejects(loaded.list({ replyContext: invalid }), /context|scope|identity/i);
  }
  assert.equal(calls, 1);
});

for (const version of [1, 2]) test(`KG V${version}: missing thread identity preserves real root and preview comments`, async () => {
  for (const replyCount of [0, 21]) {
    const root = row('kg');
    root.reply_num = replyCount;
    if (!replyCount) root.replys = [];
    const loaded = load('kg', version, () => {
      const body = response('kg', 'hot', [root]);
      delete body.childrenid;
      return body;
    });
    const page = await loaded.list({});
    const item = (page.items || page.data)[0];
    assert.equal(item.id, '100');
    assert.equal(item.comment, text);
    assert.equal(item.replyCount, replyCount);
    assert.equal(item.replies.length, replyCount ? 2 : 0);
    assert.equal(item.replyContext, undefined, 'missing native identity must not fabricate a thread context');
  }
});
