const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { SOURCE_CONFIG } = require('../functions/source-config');

// Point to extracted official zip-it-and-ship-it bundles. These handlers must
// work without access to the repository or its unbundled generator/templates.
const bundles = process.env.BAKA_NETLIFY_BUNDLES;
test('isolated Netlify bundles serve every configured V2 subscription and provider', { skip: !bundles }, async () => {
  const subscription = require(path.join(bundles, 'v2-subscription', 'v2-subscription.js'));
  const plugin = require(path.join(bundles, 'v2-plugin', 'v2-plugin.js'));
  for (const source of Object.keys(SOURCE_CONFIG)) {
    const key = source === 'oi' ? '0123456789abcdef0123456789abcdef' : 'key&value.json';
    const query = { source, key };
    const sub = await subscription.handler({ httpMethod: 'GET', queryStringParameters: query });
    assert.equal(sub.statusCode, 200, sub.body);
    assert.match(sub.headers['Cache-Control'], /no-transform/);
    for (const entry of JSON.parse(sub.body).plugins) {
      const platform = entry.id.split('.').at(-1);
      const response = await plugin.handler({ httpMethod: 'GET', queryStringParameters: { ...query, plugin: platform } });
      assert.equal(response.statusCode, 200, source + '/' + platform);
      assert.equal(response.body.split(/\r?\n/, 1)[0], '// @baka-provider 2');
      assert.match(response.headers['Cache-Control'], /no-transform/);
      const context = { module: { exports: {} } };
      vm.runInNewContext(response.body, context, { timeout: 1000 });
      assert.equal(context.module.exports.manifest.id, entry.id);
      assert.equal(context.module.exports.manifest.srcUrl, entry.url);
      assert.equal(context.module.exports.manifest.version, ['kw', 'mg'].includes(platform) ? '1.0.4' : ['wy', 'kg'].includes(platform) ? '1.0.3' : platform === 'am' ? '1.0.1' : '1.0.2');
    }
  }
});
