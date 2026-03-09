# 🎵 BakaMusic 插件订阅服务

一个用于 [BakaMusic](https://github.com/AnyBSS/BakaMusic) 的插件订阅服务，提供网易云音乐、QQ音乐、酷狗音乐、Bilibili、汽水音乐等8大平台支持。

基于 **Vercel** 和纯前端技术构建，提供美观的用户界面和稳定的 API 服务。

## 🌐 在线服务

**订阅地址**: https://music.cnmb.us.ci/

## ✨ 特性

- 🎨 **美观现代的界面**: 响应式设计，支持移动端和桌面端
- 🌓 **主题切换**: 支持默认、深色、浅色三种主题
- 🔑 **API Key 管理**: 安全的密钥输入和链接生成
- 📋 **一键复制**: 便捷的复制到剪贴板功能
- 🎼 **8大音乐平台**: 网易云、QQ音乐、酷狗、酷我、咪咕、Bilibili、汽水音乐、Gitcode
- ⚡ **Serverless**: 基于 Vercel，无需服务器维护
- 🚀 **CDN 加速**: 全球 CDN 分发，访问速度快

## 📋 支持的平台

| 平台 | 文件 | 版本 | API Key | 状态 |
|------|------|------|---------|------|
| 网易云音乐 | [wy.js](./plugins/wy.js) | 0.3.1 | ✅ 需要 | ✅ |
| 咪咕音乐 | [mg.js](./plugins/mg.js) | 0.2.8 | ✅ 需要 | ✅ |
| 酷狗音乐 | [kg.js](./plugins/kg.js) | 0.2.8 | ✅ 需要 | ✅ |
| 酷我音乐 | [kw.js](./plugins/kw.js) | 0.2.9 | ✅ 需要 | ✅ |
| QQ音乐 | [qq.js](./plugins/qq.js) | 0.3.4 | ✅ 需要 | ✅ |
| Bilibili | [bilibili.js](./plugins/bilibili.js) | 0.2.7 | ❌ 无需 | ✅ |
| 汽水音乐 | [qishui.js](./plugins/qishui.js) | 0.2.6 | ❌ 无需 | ✅ |
| Gitcode | [git.js](./plugins/git.js) | 0.2.1 | ❌ 无需 | ✅ |

> **注意**：标记为"❌ 无需"的插件可以直接导入使用，无需配置 API Key。

## 🚀 使用方法

### 第 1 步：获取 API Key

访问 API 服务提供商获取你的专属 API Key

### 第 2 步：生成订阅链接

1. 打开 https://music.cnmb.us.ci/
2. 在输入框中输入你的 API Key
3. 点击"生成链接"按钮
4. 复制生成的订阅链接

订阅链接格式：
```
https://music.cnmb.us.ci/api/subscription.json?source=ikun&key=YOUR_API_KEY.json
```

> **注意**：订阅链接的 key 参数后需要添加 `.json` 后缀，这是 BakaMusic 的要求。

### 第 3 步：在 BakaMusic 中添加订阅

#### 方法 1：使用订阅功能（推荐）

1. 打开 **BakaMusic** APP
2. 进入 **设置** → **插件管理**
3. 点击右上角 **➕ 加号**
4. 选择 **订阅**
5. 粘贴订阅链接
6. 点击确认
7. 完成！自动导入 8 个平台插件

#### 方法 2：单个插件安装

1. 打开 **BakaMusic** APP
2. 进入 **设置** → **插件管理**
3. 点击右上角 **➕ 加号**
4. 选择 **从网络安装**
5. 输入单个插件链接，例如：
   ```
   https://music.cnmb.us.ci/plugins/wy.js?source=ikun&key=YOUR_API_KEY
   ```

## 📱 完整示例

**假设你的 API Key 是**: `YOUR_API_KEY_HERE`

**订阅链接**（BakaMusic 要求 key 后加 .json）:
```
https://music.cnmb.us.ci/api/subscription.json?source=ikun&key=YOUR_API_KEY_HERE.json
```

**单个插件链接示例**:
- 网易云音乐（需要 Key）:
  ```
  https://music.cnmb.us.ci/plugins/wy.js?source=ikun&key=YOUR_API_KEY_HERE
  ```
- Bilibili（无需 Key）:
  ```
  https://music.cnmb.us.ci/plugins/bilibili.js
  ```

在 BakaMusic 中添加订阅后，会自动导入所有 8 个平台的插件！

## 📡 API 端点

### 插件订阅接口

```
GET /api/subscription.json?source=ikun&key=YOUR_API_KEY.json
```

> **音源参数说明**：`source` 支持 `ikun` / `linglan` / `suyin`；`ikun` 使用 `POST /music/url`，`linglan` 使用 `GET /url`，`suyin` Key 内置 (无需用户提供)。
> - `suyin` 仅支持 wy / qq / kw / mg (不支持 kg)。
> - `bilibili.js` / `qishui.js` / `git.js` 无需 `source` 参数。

返回所有可用插件列表的 JSON 格式数据。

> **注意**：BakaMusic 要求订阅链接的 key 参数后需要添加 `.json` 后缀。

### 单个插件下载接口

```
GET /plugins/{platform}.js?source=ikun&key=YOUR_API_KEY  (需要 API Key 的插件)
GET /plugins/{platform}.js                    (无需 API Key 的插件，bilibili/qishui/git)
```

支持的平台:
- `wy.js` - 网易云音乐（需要 Key）
- `qq.js` - QQ音乐（需要 Key）
- `kg.js` - 酷狗音乐（需要 Key）
- `kw.js` - 酷我音乐（需要 Key）
- `mg.js` - 咪咕音乐（需要 Key）
- `bilibili.js` - Bilibili（无需 Key）
- `qishui.js` - 汽水音乐（无需 Key）
- `git.js` - Gitcode（无需 Key）

## 🔄 更新插件

当插件更新时：

1. 修改仓库中的插件文件（如 `plugins/wy.js`）
2. 提交到 GitHub
3. Vercel 自动重新部署
4. 用户重新订阅即可获取最新版本

```bash
# 更新插件示例
git add plugins/wy.js
git commit -m "update netease"
git push
```

## 🛠️ 部署到 Vercel

### 快速部署

1. Fork 本仓库
2. 登录 [Vercel](https://vercel.com/)
3. 选择 "Add New Project" → 导入 GitHub 仓库
4. 直接部署即可（无需额外配置）

## 📁 项目结构

```
musicfree-plugins/
├── functions/
│   ├── source-config.js         # 音源配置中心
│   ├── subscription.js          # 订阅接口（自动扫描插件目录）
│   └── plugin.js                # 插件下载接口
├── plugins/                     # 插件目录
│   ├── wy.js                    # 网易云音乐插件（需要 Key）
│   ├── mg.js                    # 咪咕音乐插件（需要 Key）
│   ├── kg.js                    # 酷狗音乐插件（需要 Key）
│   ├── kw.js                    # 酷我音乐插件（需要 Key）
│   ├── qq.js                    # QQ音乐插件（需要 Key）
│   ├── bilibili.js              # Bilibili插件（无需 Key）
│   ├── qishui.js                # 汽水音乐插件（无需 Key）
│   └── git.js                   # Gitcode插件（无需 Key）
├── server.js                    # Express 服务器入口
├── vercel.json                  # Vercel 配置
├── index.html                   # 主页（美观界面）
├── 404.html                     # 404 页面
└── README.md                    # 本文件
```

## 🎨 技术栈

- **前端**: 纯 HTML/CSS/JavaScript（无框架依赖）
- **后端**: Express + Vercel Serverless (Node.js)
- **部署**: Vercel
- **样式**: CSS3 变量、Grid/Flexbox 布局
- **动画**: CSS Animations
- **主题**: LocalStorage 持久化

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
node server.js

# 访问 http://localhost:3000
```

### 测试 API

```bash
# 测试订阅接口（注意 key 后面的 .json）
curl "http://localhost:3000/api/subscription.json?source=ikun&key=test123.json"

# 测试插件下载（插件链接不需要 .json）
curl "http://localhost:3000/plugins/wy.js?source=ikun&key=test123"
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 修改插件文件并测试
4. 提交更改 (`git commit -m 'update plugin'`)
5. 推送到分支 (`git push origin feature/AmazingFeature`)
6. 开启 Pull Request

## 🔒 安全性

- API Key 使用密码输入框（不可见）
- 纯前端生成链接（无后端存储）
- HTTPS 加密传输
- CORS 配置保护

## 📄 许可证

本项目采用 AGPL-3.0 许可证

## ⚠️ 免责声明

本项目仅供学习交流使用，请勿用于商业用途。使用本项目产生的任何后果由使用者自行承担。

## 🙏 致谢

- [BakaMusic](https://github.com/AnyBSS/BakaMusic) - 开源的音乐播放器
- [Vercel](https://vercel.com/) - 提供优秀的 Serverless 平台

## 📞 支持

- 问题反馈: [GitHub Issues](https://github.com/Zencok/baka-plugins/issues)
- BakaMusic 官方文档: https://musicfree.catcat.work
- 插件开发文档: https://musicfree.catcat.work/plugin/introduction.html

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐️ 吧！**

Made with ❤️ by [Zencok](https://github.com/Zencok)

</div>
