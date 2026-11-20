<img src="assets/icon.png" width="80" height="80" alt="Bili Lite 图标">

# Bili Lite

一款面向 Windows 的非官方哔哩哔哩桌面客户端。用独立界面浏览推荐、搜索视频、追番和管理收藏，在桌面上接着上次的进度观看。

支持 **Windows 10 / 11 x64**，提供浅色与深色主题。

[下载应用](https://github.com/chtion/bili-desktop-lite/releases/latest) · [更新日志](CHANGELOG.md) · [反馈问题](https://github.com/chtion/bili-desktop-lite/issues)

## 可以做什么

| 功能 | 说明 |
| --- | --- |
| 发现内容 | 浏览首页推荐与榜单，按关键词、BV 号或 B站视频链接搜索；搜索结果包含视频、用户和番剧。 |
| 刷视频 | 逐条播放推荐内容，滚轮切换上一条或下一条；进入详情页时接着当前进度播放。 |
| 观看视频 | 内置播放器支持倍速、画质切换、字幕、弹幕、全屏、网页全屏和画中画。 |
| 浏览番剧 | 探索番剧与国创目录，按条件筛选；登录后查看自己的追番、追剧和剧集列表。 |
| 使用账号 | 通过 B站官方登录页登录，在应用内查看个人空间、关注、粉丝、动态和收藏夹，支持点赞、投币、收藏和关注。 |
| 收藏与续播 | 保存本地收藏，记录视频、分 P 和剧集的观看进度；登录后可同步实际进度到 B站播放历史。 |
| 调整桌面体验 | 折叠侧栏、收起播放详情、切换主题，使用窗口置顶、老板键和自定义快捷键；可分别设置刷视频与详情页自动连播。 |
| 使用拓展 | 从侧栏打开红果短剧或内置浏览器。短剧可分批获取剧库、暂停后续取，或导入 JSON、M3U 和 HTTPS 订阅。浏览器支持多标签页、网址输入和搜索。 |

可用画质、字幕与剧集取决于平台返回的内容和当前账号权限。红果部分内容需要登录或前往官方 App 观看，具体提示以应用内显示为准。

## 下载与运行

前往 [GitHub Releases](https://github.com/chtion/bili-desktop-lite/releases/latest)，在附件中选择一个版本：

| 文件名 | 适用场景 |
| --- | --- |
| `Bili-Desktop-Lite-<版本号>-Portable-x64.exe` | 免安装，双击运行。首次启动需要等待运行环境解压。 |
| `Bili-Desktop-Lite-<版本号>-Setup-x64.exe` | 安装使用，可选择安装目录并创建快捷方式。 |

私有仓库的下载页需要使用有仓库访问权限的 GitHub 账号登录。发布包目前未做数字签名。

### 第一次使用

1. 启动应用，从首页推荐、榜单或「番剧探索」选择内容，也可以直接搜索关键词、BV 号或 B站视频链接。
2. 点击视频进入播放页，在右侧切换推荐、评论与分集；网页全屏时可按需收起详情栏。
3. 需要账号功能时，点击左下角头像，在打开的 B站官方登录页完成登录。
4. 点击左下角齿轮调整播放习惯、主题与快捷键，也可以在这里检查更新。

视频卡片上的爱心加入「本地收藏」，仅保存在当前电脑；视频详情中的「收藏」操作对应 B站账号收藏夹。

### 常用快捷键

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl + K` / `Ctrl + L` | 展开搜索；在内置浏览器中聚焦地址栏 |
| `Alt + ←` | 返回上一页 |
| `F5` | 刷新当前页面 |
| `F11` | 切换窗口全屏 |
| `Esc` | 关闭当前弹层、退出播放全屏或返回，取决于当前界面 |
| `空格` / `方向键` | 播放器激活时控制播放、进度和音量 |
| `Ctrl + Alt + B` | 老板键：隐藏 / 恢复窗口，隐藏时静音，默认同时暂停 |
| `Ctrl + Alt + P` | 在视频页切换窗口置顶 |

老板键与置顶快捷键可以在设置中修改或清除。通过老板键恢复窗口后，可手动继续播放。

## 数据与更新

登录状态、偏好设置、本地收藏和观看进度保存在本机用户资料目录：

```text
%APPDATA%\Bili Desktop Lite
```

升级会沿用这份资料。登录后默认向 B站同步实际观看进度，可在设置中关闭；关闭后仍会保存本机续播记录。

打开「设置 → 应用更新 → 检查 GitHub 更新」获取新版。读取私有仓库的发布时，应用使用本机 Git Credential Manager 已保存且有仓库读取权限的 GitHub 登录。更新文件通过大小与 SHA-256 校验后才会启动。

也可以选择包含 `bili-release.json` 与对应 EXE 的本地发布文件夹更新，或退出旧版后直接运行从 Releases 下载的新版。

## 从源码运行

准备 Windows、Git 和 Node.js（附带 npm），然后执行：

```powershell
git clone https://github.com/chtion/bili-desktop-lite.git
cd bili-desktop-lite
npm ci
npm run vendor
npm start
```

播放器依赖在构建前复制到 `src/vendor/`，运行时加载本地脚本。具体依赖版本见 [package.json](package.json)。

### 检查与打包

```powershell
# JavaScript 语法检查与 Node.js 单元测试
npm run check

# 播放器、账号、桌面交互与服务回归
npm run smoke
npm run test:account
npm run test:desktop
npm run test:features
npm run test:services

# 生成 Windows x64 安装版、免安装版和校验文件
npm run pack:win
```

Electron 回归需要桌面环境，涉及真实内容的检查还需要网络连接。打包产物保存在 `dist/`，不提交到 Git。发布步骤见 [发行流程](RELEASING.md)。

### 代码结构

```text
assets/             应用图标
src/                主进程、界面与功能模块
src/vendor/         播放器脚本与第三方许可证
scripts/            依赖复制、检查、打包清单与发布脚本
test/               单元测试与 Electron 回归
```

## 使用说明与反馈

本项目由第三方开发，与哔哩哔哩官方无关联。弹幕与评论目前为只读展示；视频播放和账号功能遵循平台现有权限。平台接口、网络或登录状态变化可能影响部分功能。

遇到问题可在 [Issues](https://github.com/chtion/bili-desktop-lite/issues) 中提供应用版本、Windows 版本、复现步骤与截图；请勿附上 Cookie 或其他登录凭据。

项目使用 [Electron](https://github.com/electron/electron)、[Artplayer](https://github.com/zhw2590582/ArtPlayer)、[弹幕插件](https://github.com/zhw2590582/artplayer-plugin-danmuku) 和 [Shaka Player](https://github.com/shaka-project/shaka-player)。播放器组件的许可证保留在 [src/vendor](src/vendor/) 中。
