# 个人油耗记录

一个面向个人单车使用、手机优先、本地数据优先的油耗记录 APP。

业务数据直接保存在当前浏览器的 IndexedDB 中。日常记录、删除、统计和 JSON 备份不依赖服务器、账号、登录、SQLite 或云服务。

## 功能

- 记录当前里程、加油金额、油价、日期和是否加满
- 自动按 `金额 / 油价` 计算加油升数
- 使用 full-to-full 规则计算真实油耗和用车成本
- 删除记录后从完整记录数组重新计算统计
- 在浏览器本地导出和导入 schemaVersion 1 JSON 备份
- 兼容旧 server 版本导出的 schemaVersion 1 备份

数据只保存在当前设备。建议定期导出 JSON 备份；清除浏览器数据或卸载未来 APK 前必须先导出备份。

## 本地开发

需要 Node.js 22.6 或更高版本。

```bash
npm install
npm test
npm run lint
npm run dev
```

打开开发服务器显示的本地地址即可。无需数据库、环境变量或认证配置。

`npm run dev` 只用于本地开发。生成完全静态、无需 Node server 的生产产物：

```bash
npm run build
```

构建结果位于 `out/`，可由普通静态文件服务器提供，也可在后续阶段打包进本地 APP。生产运行不使用 `next start`，不需要 Node.js、数据库、环境变量或服务器 API。

例如可在构建后临时预览：

```bash
python -m http.server 8000 --directory out
```

然后访问 `http://127.0.0.1:8000/`。

## Android 构建

Android 包使用 Capacitor 8，把 `out/` 静态资源打包进 WebView。应用标识固定为
`com.woynkl.fueltracker`，日常使用不需要 Node.js、服务器或网络。

开发机需准备 JDK 21 和 Android SDK（compile/target SDK 36，min SDK 24）。同步 Web
资源后可直接用 Gradle wrapper 构建：

```bash
npm install
npm run cap:sync
cd android
./gradlew assembleRelease
```

Windows 最后一条命令使用 `gradlew.bat assembleRelease`。release 构建必须在仓库外的
`~/.fuel-tracker/signing/signing.properties` 提供长期签名配置；配置缺失时构建会明确失败，
不会退回临时 signer。私钥、密码、APK、`local.properties` 和构建目录均不会进入 Git。

签名 keystore 必须单独、安全地长期备份。若丢失它，未来 APK 将无法覆盖安装升级。
每次升级前也应先从 APP 导出 JSON 备份；卸载 APP 会删除其本地 IndexedDB 数据。

给非开发用户的初装、离线、备份和覆盖升级步骤见 [ANDROID_TEST.md](ANDROID_TEST.md)。

## 技术栈

- Next.js + React + TypeScript
- IndexedDB LocalRepository
- 纯 TypeScript fuel / backup 业务逻辑
- 轻量 Material 风格移动端 UI

## License

本项目沿用原项目的 MIT License 与原作者版权。此仓库是基于 `jyh9521/fuel-tracker` 修改的个人 fork。
