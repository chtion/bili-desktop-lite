# Bili Lite 发行流程

开发期间使用 `0.x.y`。每次发布默认只将末位 `y` 加 1，例如 `0.10.1` → `0.10.2`。只有用户明确要求时才调整 `x`。Git 标签使用 `v` 加完整版本号，例如 `v0.10.1`。应用从当前仓库的 GitHub Releases 读取已发布的正式附件，版本说明可标为开发版，GitHub 的预发布标记保持关闭。

## 文档维护

- [README.md](README.md) 用于介绍项目、功能、下载、使用和开发方式。标题不带版本号，不按版本追加更新记录；仅在用户使用方式或项目能力变化时调整相关说明。下载链接使用 Releases 的最新版本入口，文件名示例用 `<版本号>` 占位。
- [CHANGELOG.md](CHANGELOG.md) 按版本保留历史变化与迁移说明。开发中的条目标记为「未发布」，正式发布时再改为对应版本。
- [RELEASE_NOTES.md](RELEASE_NOTES.md) 只保存本次发行说明，发布脚本会将它用作 GitHub Release 正文。

## 发布步骤

1. 更新 `package.json` 和 `package-lock.json` 的版本号，并更新 [CHANGELOG.md](CHANGELOG.md) 与 [RELEASE_NOTES.md](RELEASE_NOTES.md)。
2. 运行 `npm run check` 和相关 Electron 回归测试，再运行 `npm run pack:win`。打包会校验并附带 FFmpeg，在 `dist` 中生成安装版、免安装版、FFmpeg 源码归档、SHA-256 和发布清单。
3. 提交源码并创建同版本的 Git 标签。将分支和标签推送到 GitHub。
4. 登录有发布权限的 GitHub 账号后，运行 `node scripts/publish-release.cjs --publish`。脚本先核对远程标签和本地校验值，再创建草稿并上传两个 EXE 和 FFmpeg 源码归档。附件大小与 GitHub 的 SHA-256 匹配后才正式发布。
5. 使用有仓库读取权限的 GitHub 登录，在应用中检查更新。私有仓库需要 Git Credential Manager 已保存的登录。`dist` 和旧安装包保持在本机，Git 只跟踪源码，EXE 由 Releases 分发。
