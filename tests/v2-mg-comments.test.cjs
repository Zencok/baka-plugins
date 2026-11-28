const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const stackUrl = 'https://u.musicapp.migu.cn/MIGUM3.0/user/comment/stack/v1.0';
const resourceUrl = 'https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do';
const source = () => fs.readFileSync(path.join(__dirname, '../plugins/v2/mg.js'), 'utf8');
function load() {
  const context = { module: { exports: {} } };
  vm.runInNewContext(source(), context);
  return context.module.exports;
}
function sdkFor(respond) {
  return {
    settings: {},
    bytes: { encode: value => Buffer.from(value).toString('hex') },
    crypto: { hash: (algorithm, value) => crypto.createHash(algorithm).update(Buffer.from(value, 'hex')).digest('hex') },
    log: { error() {}, warn() {}, info() {}, debug() {} },
    http: { request: async request => ({ status: 200, headers: {}, body: JSON.stringify(await respond(request)) }) },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
const comment = id => ({
  commentId: id, commentInfo: 'Comment ' + id, commentTime: '2026-11-24 22:10',
  user: { nickName: 'Listener', middleIcon: '//fixture/avatar.jpg' },
  opNumItem: { thumbNum: 7 }, replyComments: [],
});
const body = (comments = [], total = comments.length) => ({
  code: '000000', data: { commentNums: String(total), comments, hotComments: [comment('999')] },
});

test('MG comments use native song IDs, current response fields, replies, and commentId pagination', async () => {
  const firstComment = comment('30');
  firstComment.replyComments = [{
    replyId: '31', replyInfo: 'Reply', replyTime: '2026-11-25 01:02',
    user: { nickName: 'Reply listener', smallIcon: 'https://fixture/reply.jpg' },
  }];
  const calls = [];
  const sdk = sdkFor(request => {
    const url = new URL(request.url);
    assert.equal(url.origin + url.pathname, stackUrl);
    assert.equal(url.searchParams.get('resourceId'), '1125329711');
    assert.equal(url.searchParams.get('resourceType'), '2');
    assert.equal(url.searchParams.get('queryType'), '1');
    assert.equal(url.searchParams.get('pageSize'), '2');
    assert.equal(url.searchParams.has('pageNo'), false);
    calls.push(url.searchParams.get('commentId'));
    return calls.length === 1 ? body([firstComment, comment('20')], 3) : body([comment('10')], 3);
  });
  const plugin = load();
  const request = { sort: 'latest', entity: { id: '1125329711', copyrightId: '60054704101' }, limit: 2 };
  const first = await plugin.handlers.comments.list(request, sdk);
  assert.equal(first.total, 3);
  assert.deepEqual(plain(first.items[0]), {
    replyContext: { v: 1, provider: 'cc.baka.mg', entityId: '1125329711', rootId: '30' },
    id: '30', nickName: 'Listener', avatar: 'https://fixture/avatar.jpg', comment: 'Comment 30',
    like: 7, createAt: Date.parse('2026-11-24T22:10:00+08:00'),
    replies: [{ id: '31', nickName: 'Reply listener', avatar: 'https://fixture/reply.jpg',
      comment: 'Reply', like: 0, createAt: Date.parse('2026-11-25T01:02:00+08:00') }],
  });
  assert.deepEqual(plain(first.items.map(item => item.id)), ['30', '20']);
  assert.ok(first.nextCursor);
  const last = await plugin.handlers.comments.list({ ...request, cursor: first.nextCursor }, sdk);
  assert.deepEqual(plain(last.items.map(item => item.id)), ['10']);
  assert.equal(last.nextCursor, null);
  assert.deepEqual(calls, ['0', '20']);
});

test('MG resolves copyright-only tracks to native song identity and rejects failed resolution', async () => {
  const plugin = load();
  const request = { sort: 'latest', entity: { id: '60054701923', copyrightId: '60054701923' }, limit: 20 };
  const calls = [];
  const sdk = sdkFor(request => {
    const url = new URL(request.url);
    calls.push(url.pathname);
    if (url.origin + url.pathname === resourceUrl) {
      assert.equal(url.searchParams.get('copyrightId'), '60054701923');
      return { code: '000000', resource: [{ songId: '3790007' }] };
    }
    assert.equal(url.searchParams.get('resourceId'), '3790007');
    return body();
  });
  assert.deepEqual(plain(await plugin.handlers.comments.list(request, sdk)), { items: [], nextCursor: null, total: 0 });
  assert.equal(calls.length, 2);
  for (const failure of [{ code: 'FAILED' }, { code: '000000', resource: [] }]) {
    await assert.rejects(plugin.handlers.comments.list(request, sdkFor(() => failure)));
  }
  await assert.rejects(plugin.handlers.comments.list({ entity: {} }, sdkFor(() => { throw new Error('No request expected'); })));
});

test('MG malformed/service/HTML responses cannot become confirmed empty comment pages', async () => {
  const request = { sort: 'latest', entity: { id: '1125329711' } };
  const plugin = load();
  for (const failure of [
    '<html>new site</html>', { code: 'FAILED' }, { code: '000000', data: {} },
    { code: '000000', data: { comments: [], commentNums: 'unknown' } },
    { code: '000000', data: { comments: [], commentNums: false } },
    body([], 1), body([{ commentInfo: 'No ID' }], 1),
    { returnCode: '000000', data: { items: [], itemTotal: 0 } },
  ]) await assert.rejects(plugin.handlers.comments.list(request, sdkFor(() => failure)));
  assert.deepEqual(plain(await plugin.handlers.comments.list(request, sdkFor(() => body()))), {
    items: [], nextCursor: null, total: 0,
  });
});

test('MG rejects a repeated native comment page rather than looping cursors', async () => {
  const plugin = load();
  const sdk = sdkFor(() => body([comment('30'), comment('20')], 4));
  const request = { sort: 'latest', entity: { id: '1125329711' }, limit: 2 };
  const first = await plugin.handlers.comments.list(request, sdk);
  await assert.rejects(plugin.handlers.comments.list({ ...request, cursor: first.nextCursor }, sdk), /advance|cursor/);
});

test('MG rejects nonprimitive comment totals before numeric coercion', async () => {
  const plugin = load();
  const request = { sort: 'latest', entity: { id: '1125329711' } };
  for (const commentNums of [[0], ['0'], {}, null]) {
    await assert.rejects(plugin.handlers.comments.list(request, sdkFor(() => ({
      code: '000000', data: { comments: [], commentNums },
    }))));
  }
  const page = await plugin.handlers.comments.list(request, sdkFor(() => ({
    code: '000000', data: { comments: [], commentNums: 0 },
  })));
  assert.deepEqual(plain(page), { items: [], nextCursor: null, total: 0 });
});

test('MG rejects upstream comment pages wider than the requested bounded page size', async () => {
  const plugin = load();
  for (const [limit, count] of [[1, 2], [100, 21]]) {
    const comments = Array.from({ length: count }, (_, index) => comment(String(count - index)));
    await assert.rejects(plugin.handlers.comments.list({ entity: { id: '1125329711' }, limit },
      sdkFor(() => body(comments, count))));
  }
});

test('MG current comment protocol runs through the actual lean QuickJS HTTP SDK', { skip: !process.env.BAKA_V2_PROBE }, async () => {
  const http = require('node:http');
  const os = require('node:os');
  const { promisify } = require('node:util');
  const run = promisify(require('node:child_process').execFile);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-mg-comments-'));
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(url.searchParams.get('commentId') === '0' ? body([comment('30'), comment('20')], 3) : body([comment('10')], 3)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = path.join(directory, 'mg.js');
    const requestFile = path.join(directory, 'request.json');
    const resultFile = path.join(directory, 'result.json');
    const stackPrefix = stackUrl.slice(0, -'v1.0'.length);
    const prepared = source().replaceAll(stackPrefix, `http://127.0.0.1:${server.address().port}/comments/`);
    assert.equal(prepared.includes(stackPrefix), false, 'native fixture must redirect the real provider endpoint');
    fs.writeFileSync(provider, prepared);
    let cursor = null;
    const ids = [];
    do {
      fs.writeFileSync(requestFile, JSON.stringify({ sort: 'latest', entity: { id: '1125329711' }, limit: 2, cursor }));
      const result = await run(process.env.BAKA_V2_PROBE, [provider, 'comments.list', requestFile], {
        env: { ...process.env, BAKA_PROVIDER_RESULT_FILE: resultFile },
      });
      assert.equal(JSON.parse(result.stdout).lean, true);
      const page = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      ids.push(...page.items.map(item => item.id));
      assert.equal(page.items[0].createAt, Date.parse('2026-11-24T22:10:00+08:00'));
      cursor = page.nextCursor;
      assert.ok(ids.length <= 3);
    } while (cursor !== null);
    assert.deepEqual(ids, ['30', '20', '10']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
