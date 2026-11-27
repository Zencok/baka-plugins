const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const probe = process.env.BAKA_V2_PROBE;

test('every distributed source/provider passes native V2 inspection and loading', { skip: !probe }, async () => {
  const { SOURCE_CONFIG } = require('../functions/source-config');
  const subscription = require('../functions/v2-subscription');
  const plugin = require('../functions/v2-plugin');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-v2-distribution-'));
  try {
    for (const source of Object.keys(SOURCE_CONFIG)) {
      const key = source === 'oi' ? '0123456789abcdef0123456789abcdef' : 'key&value.json';
      const sub = await subscription.handler({ httpMethod: 'GET', queryStringParameters: { source, key } });
      assert.equal(sub.statusCode, 200, source);
      for (const entry of JSON.parse(sub.body).plugins) {
        const platform = entry.id.split('.').at(-1);
        const response = await plugin.handler({ httpMethod: 'GET', queryStringParameters: { plugin: platform, source, key } });
        assert.equal(response.statusCode, 200, source + '/' + platform);
        const file = path.join(directory, platform + '.js');
        fs.writeFileSync(file, response.body);
        const result = await run(probe, [file]);
        const summary = JSON.parse(result.stdout.trim());
        assert.equal(summary.providerId, entry.id);
        assert.equal(summary.version, entry.version);
        assert.equal(summary.lean, true);
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('public providers load and paginate through the actual QuickJS HTTP SDK', { skip: !probe }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-public-v2-native-'));
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw);
      assert.equal(input.req.method, 'uniform_get_Dissinfo');
      const { song_begin: begin, song_num: size } = input.req.param;
      requests.push(begin);
      const songs = Array.from({ length: Math.min(size, 250 - begin) }, (_, index) => ({
        id: begin + index + 1, mid: 'mid' + (begin + index + 1),
        title: 'Track', singer: [{ name: 'Fixture' }],
      }));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ code: 0, req: { code: 0, data: {
        code: 0, dirinfo: { disstid: '123', dissname: 'Public fixture', songnum: 250 }, songlist: songs,
      } } }));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/qq`;
    const paths = {};
    for (const platform of ['am', 'wy', 'qq', 'kg', 'kw', 'mg', 'bilibili']) {
      const source = fs.readFileSync(path.join(__dirname, '../plugins/v2', platform + '.js'), 'utf8')
        .replace('// {{REQUEST_HANDLER}}', 'const UPDATE_URL = "";')
        .replaceAll('https://u.y.qq.com/cgi-bin/musicu.fcg', endpoint);
      paths[platform] = path.join(directory, platform + '.js');
      fs.writeFileSync(paths[platform], source);
      const result = await run(probe, [paths[platform]]);
      const summary = JSON.parse(result.stdout.trim());
      assert.equal(summary.providerId, 'cc.baka.' + platform);
      assert.equal(summary.version, platform === 'kw' ? '1.0.3' : platform === 'am' ? '1.0.1' : '1.0.2');
      assert.equal(summary.lean, true);
    }
    const requestFile = path.join(directory, 'request.json');
    const resultFile = path.join(directory, 'result.json');
    const ids = [];
    let cursor = null;
    do {
      fs.writeFileSync(requestFile, JSON.stringify({
        entity: { id: '123', type: 'sheet' }, kind: 'music', limit: 30, cursor,
      }));
      await run(probe, [paths.qq, 'collections.members', requestFile], {
        env: { ...process.env, BAKA_PROVIDER_RESULT_FILE: resultFile },
      });
      const page = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      assert.ok(page.items.length <= 30);
      ids.push(...page.items.map(item => item.id));
      cursor = page.nextCursor;
      assert.ok(ids.length <= 250);
    } while (cursor !== null);
    assert.deepEqual(ids, Array.from({ length: 250 }, (_, index) => index + 1));
    assert.ok(requests.includes(0) && requests.includes(100) && requests.includes(200));
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
