/**
 * BakaMusic 插件订阅服务 - Express 服务器 (Vercel 部署)
 */

// ── 最早期日志，在任何 require 之前 ──
console.log('[INIT] Node.js:', process.version);
console.log('[INIT] PORT env:', process.env.PORT);
console.log('[INIT] __dirname:', __dirname);

// ── 进程级别事件，防止无声崩溃 ──
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
});
process.on('exit', (code) => {
  console.log('[EXIT] Process exit with code:', code);
});
process.on('SIGTERM', () => {
  console.log('[SIGNAL] SIGTERM received, shutting down');
  process.exit(0);
});

// ── 加载模块 ──
const express = require('express');
const path = require('path');
const fs = require('fs');
console.log('[INIT] core modules loaded');

let subscriptionHandler, pluginHandler;

try {
  subscriptionHandler = require('./functions/subscription').handler;
  console.log('[INIT] subscription handler OK');
} catch (e) {
  console.error('[INIT] subscription handler FAILED:', e.message);
}

try {
  pluginHandler = require('./functions/plugin').handler;
  console.log('[INIT] plugin handler OK');
} catch (e) {
  console.error('[INIT] plugin handler FAILED:', e.message);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── 适配器 ──
async function callHandler(handler, req, res) {
  const event = {
    httpMethod: req.method,
    path: req.path,
    rawUrl: req.originalUrl,
    queryStringParameters: req.query,
    headers: req.headers,
  };
  const result = await handler(event, {});
  if (result.headers) {
    Object.entries(result.headers).forEach(([k, v]) => res.set(k, v));
  }
  res.status(result.statusCode).send(result.body);
}

// ── 请求日志（每条请求都记录） ──
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

// ── 路由 ──
app.get('/api/subscription.json', (req, res, next) =>
  callHandler(subscriptionHandler, req, res).catch(next)
);

app.get(['/plugins/:plugin', '/plugin/:plugin'], (req, res, next) =>
  callHandler(pluginHandler, req, res).catch(next)
);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));

app.use((req, res) => {
  const p = path.join(__dirname, '404.html');
  fs.existsSync(p) ? res.status(404).sendFile(p) : res.status(404).json({ error: 'Not Found' });
});

// Express 错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── 启动（本地开发）/ 导出（Vercel serverless）──
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[READY] BakaMusic 插件服务运行在端口 ${PORT}`);
  });
}

module.exports = app;
