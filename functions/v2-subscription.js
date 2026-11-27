/** Public V2 subscription: package metadata comes from the V2 template itself. */
const vm = require('node:vm');
const { FREE_PLUGINS } = require('./source-config');
const { PLATFORMS, selectedSource, pluginUrl, readTemplate } = require('./v2-plugin');
function manifestOf(source, platform) {
  const context = { module: { exports: {} }, UPDATE_URL: '' };
  vm.runInNewContext(source, context, { timeout: 1000 });
  const manifest = context.module.exports.manifest;
  if (manifest?.id !== 'cc.baka.' + platform || manifest?.sourceId !== platform + '.v1' || manifest.apiVersion !== 2 || manifest.kind !== 'provider') throw new Error('Invalid public manifest');
  for (const field of ['name', 'author', 'version']) if (typeof manifest[field] !== 'string' || !manifest[field]) throw new Error('Invalid manifest metadata');
  return manifest;
}
exports.handler = async event => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' };
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'Method Not Allowed' });
  let selected;
  try { selected = selectedSource(event.queryStringParameters); }
  catch (error) { return reply(400, { error: error.message }); }
  const plugins = [];
  try {
    for (const platform of PLATFORMS) {
      if (!FREE_PLUGINS.includes(platform + '.js') && !Object.hasOwn(selected.config.plugins, platform + '.js')) continue;
      const manifest = manifestOf(readTemplate(platform), platform);
      plugins.push({ id: manifest.id, name: manifest.name, author: manifest.author, version: manifest.version, url: pluginUrl(platform, selected) });
    }
  } catch { return reply(500, { error: 'V2 subscription unavailable' }); }
  return reply(200, { plugins });
};
exports.manifestOf = manifestOf;
