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

Production build 检查：

```bash
npm run build
```

本阶段仍使用 Next.js 开发和构建流程；static export、Capacitor 和 Android APK 属于后续阶段。

## 技术栈

- Next.js + React + TypeScript
- IndexedDB LocalRepository
- 纯 TypeScript fuel / backup 业务逻辑
- 轻量 Material 风格移动端 UI

## License

本项目沿用原项目的 MIT License 与原作者版权。此仓库是基于 `jyh9521/fuel-tracker` 修改的个人 fork。
