/** Public V2 source code generation. V1 remains an independent distribution. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Reuse the public V1 wire algorithms at build time, without shipping its host
// adapters. No request executes while this trusted local generator is loaded.
const original = path.join(__dirname, 'plugin.js');
const scope = { exports: {}, require: createRequire(original), __dirname, console, process };
vm.runInNewContext(fs.readFileSync(original, 'utf8') + '\nexports.generate = generateRequestHandler;', scope, { filename: original });

function generateSourceHandler(config, platform, key, updateUrl) {
  let code = scope.exports.generate(config, platform + '.js', config.url, key, updateUrl);
  code = code.replace(/\(axios_1\.default \|\| axios_1\)\.post\(/g, '_sourcePost(sdk, ')
    .replace(/axios_1\.default\.get\(/g, '_sourceGet(sdk, ')
    .replace(/axios_1\.default\.post\(/g, '_sourcePost(sdk, ')
    .replace(/function requestMusicUrl\(source, songId, quality\)/g, 'function _requestSource(sdk, source, songId, quality)')
    .replace(/function requestAppleMusicApi\(path, body\)/g, 'function requestAppleMusicApi(path, body, sdk)')
    .replace('requestAppleMusicApi("/music/url", { source, musicId: String(songId), quality })', 'requestAppleMusicApi("/music/url", { source, musicId: String(songId), quality }, sdk)');
  for (const name of ['_xhEnsureToken', '_xhGet', '_khCheckAudio']) {
    code = code.replace(new RegExp('\\b' + name + '\\(', 'g'), name + '(sdk, ');
  }
  code = code.replace('  var crypto = require("crypto-js");\n', '')
    .replace('crypto.SHA256(identifier + API_KEY).toString(crypto.enc.Hex)', 'sdk.crypto.hash("sha256", sdk.bytes.encode(identifier + API_KEY))')
    .replace('crypto.MD5(encrypted + core + API_KEY).toString(crypto.enc.Hex)', 'sdk.crypto.hash("md5", sdk.bytes.encode(encrypted + core + API_KEY))')
    .replace(/var randomHex = crypto\.lib[\s\S]*?\? crypto\.lib\.WordArray\.random\(5\)\.toString\(crypto\.enc\.Hex\) : "";/, 'var randomHex = sdk.crypto.randomBytes(5);')
    .replace('source=${source}&songId=${songId}&quality=${quality}', 'source=${encodeURIComponent(source)}&songId=${encodeURIComponent(songId)}&quality=${encodeURIComponent(quality)}')
    .replace('/url/${apiSource}/${songId}/${quality}', '/url/${encodeURIComponent(apiSource)}/${encodeURIComponent(songId)}/${encodeURIComponent(quality)}');
  if (/axios|crypto-js|require\(/.test(code)) throw new Error('Unconverted source adapter');
  return code + '\n' + sdkTransport + `
async function requestMusicUrl(item, quality, sdk) {
  const source = ${JSON.stringify(platform === 'qq' ? 'tx' : platform)};
  let id = ${platform === 'qq' ? 'item.songmid' : platform === 'kg' ? '(quality === "flac" ? item.sqhash : quality === "320k" ? item["320hash"] : null) || item.hash || item.id' : 'item.id'};
  ${platform === 'kw' ? 'if (typeof id === "string") id = id.replace("MUSIC_", "");' : ''}
  const result = await _requestSource(sdk, source, id, quality);
  ${platform === 'am' ? 'return result;' : 'if (!result || Number(result.code) !== 200 || !result.url) return null;\n  return { url: result.url, ...(result.quality ? { quality: result.quality } : {}), ...(result.ekey ? { ekey: result.ekey } : {}) };'}
}
`;
}

const sdkTransport = `
async function _sourceGet(sdk, url, options = {}) {
  if (options.params) {
    const query = Object.keys(options.params).map(key => encodeURIComponent(key) + "=" + encodeURIComponent(options.params[key])).join("&");
    if (query) url += (url.includes("?") ? "&" : "?") + query;
  }
  const binary = options.responseType === "arraybuffer";
  const response = await sdk.http.request({ url, method: "GET", headers: options.headers || {},
    responseType: binary ? "bytes" : "json", timeoutMs: options.timeout || 10000 });
  if (!(options.validateStatus ? options.validateStatus(response.status) : response.status >= 200 && response.status < 300)) throw new Error("Source HTTP " + response.status);
  let data = response.body;
  if (binary) {
    if (typeof data !== "string" || data.length % 2) throw new Error("Invalid source bytes");
    if (options.maxContentLength && data.length / 2 > options.maxContentLength) throw new Error("Source body exceeds byte limit");
    data = Uint8Array.from(data.match(/../g) || [], byte => parseInt(byte, 16));
  }
  return { data };
}
async function _sourcePost(sdk, url, body, options = {}) {
  const response = await sdk.http.request({ url, method: "POST", headers: options.headers || {},
    body: JSON.stringify(body), responseType: "json", timeoutMs: options.timeout || 10000 });
  if (response.status < 200 || response.status >= 300) throw new Error("Source HTTP " + response.status);
  return { data: response.body };
}
`;
module.exports = { generateSourceHandler };
