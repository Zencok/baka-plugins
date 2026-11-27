/** Separate public V2 provider endpoint; V1 routes and templates are untouched. */
const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_CONFIG, FREE_PLUGINS, DEFAULT_SOURCE } = require('./source-config');
const { generateSourceHandler } = require('./v2-source-handler');
const PLATFORMS = ['am', 'wy', 'qq', 'kg', 'kw', 'mg', 'bilibili'];
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
function selectedSource(query = {}) {
  const source = query.source === undefined ? DEFAULT_SOURCE : query.source;
  if (typeof source !== 'string' || !Object.hasOwn(SOURCE_CONFIG, source)) throw new Error('Invalid source');
  const config = SOURCE_CONFIG[source];
  const supplied = query.key === undefined ? '' : query.key;
  if (typeof supplied !== 'string') throw new Error('Invalid key');
  const key = config.requiresKey ? supplied : config.builtinKey || '';
  if (config.requiresKey && !key.trim()) throw new Error('Source key required');
  if (source === 'oi' && !/^[0-9a-f]{32}$/.test(key)) throw new Error('OI key must be 32 lowercase hexadecimal characters');
  return { source, config, key };
}
function pluginUrl(platform, selected) {
  const base = (process.env.BASE_URL || process.env.URL || 'https://music.cwo.cc.cd').replace(/\/$/, '');
  let url = base + '/v2/plugins/' + platform + '.js';
  if (!FREE_PLUGINS.includes(platform + '.js')) {
    url += '?source=' + encodeURIComponent(selected.source);
    if (selected.config.requiresKey) url += '&key=' + encodeURIComponent(selected.key);
  }
  return url;
}
function readTemplate(platform) {
  return fs.readFileSync(path.join(__dirname, '../plugins/v2', platform + '.js'), 'utf8');
}
exports.handler = async event => {
  const reply = (statusCode, body, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body });
  if (event.httpMethod === 'OPTIONS') return reply(200, '');
  if (event.httpMethod !== 'GET') return reply(405, JSON.stringify({ error: 'Method Not Allowed' }));
  const query = event.queryStringParameters || {};
  const raw = query.plugin || (event.path || '').match(/^\/v2\/plugins\/([^/?]+)$/)?.[1];
  const platform = typeof raw === 'string' ? raw.replace(/\.js$/, '') : '';
  if (!PLATFORMS.includes(platform)) return reply(400, JSON.stringify({ error: 'Invalid V2 plugin' }));
  const free = FREE_PLUGINS.includes(platform + '.js');
  let selected;
  try { if (!free) selected = selectedSource(query); }
  catch (error) { return reply(400, JSON.stringify({ error: error.message })); }
  if (!free && !Object.hasOwn(selected.config.plugins, platform + '.js')) return reply(404, JSON.stringify({ error: 'Source does not support this provider' }));
  let template;
  try { template = readTemplate(platform); }
  catch { return reply(404, JSON.stringify({ error: 'V2 provider unavailable' })); }
  const url = pluginUrl(platform, selected);
  const injection = free ? 'const UPDATE_URL = ' + JSON.stringify(url) + ';' : generateSourceHandler(selected.config, platform, selected.key, url);
  if (!template.includes('// {{REQUEST_HANDLER}}')) return reply(500, JSON.stringify({ error: 'Invalid V2 template' }));
  let body = template.replace('// {{REQUEST_HANDLER}}', () => injection);
  const qualities = selected?.config.plugins[platform + '.js'];
  if (qualities) body = body.replace(/("?supportedQualities"?\s*:\s*)\[[^\]]*\]/, (_, prefix) => prefix + JSON.stringify(qualities));
  return reply(200, body, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Disposition': 'inline; filename=' + platform + '.js', 'Cache-Control': 'no-cache' });
};
exports.PLATFORMS = PLATFORMS;
exports.selectedSource = selectedSource;
exports.pluginUrl = pluginUrl;
exports.readTemplate = readTemplate;
