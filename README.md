# 个人油耗记录

这是一个面向个人单车使用的手机油耗记录 MVP，基于 [`jyh9521/fuel-tracker`](https://github.com/jyh9521/fuel-tracker) 修改。

每次加油只需录入：

- 当前表显里程
- 实际支付金额
- 当前每升油价
- 日期与是否加满

应用会自动计算加油升数、行驶距离、真实油耗（L/100km）、每公里费用和百公里费用。数据保存在本地 SQLite 数据库中，无需注册或云账号；部署到公网时使用单个 APP 密码保护个人数据。应用保留 PWA 能力，可从手机浏览器添加到主屏幕。

## 油耗规则

第一条加满记录只作为计算基准，不计入平均油耗。完整周期必须从一条“加满”记录开始，到下一条“加满”记录结束；期间的未加满记录会累加到该周期：

```text
加油升数 = 支付金额 / 每升油价
周期油耗 = 周期内加油升数 / 周期行驶距离 × 100
每公里费用 = 周期内加油金额 / 周期行驶距离
百公里费用 = 每公里费用 × 100
```

## 本地开发

需要 Node.js 22.6 或更高版本（Docker 镜像使用 Node.js 22）。

先生成密码 hash 和 session 签名 secret：

```bash
npm run auth:generate
```

将命令输出的 `APP_PASSWORD_HASH` 和 `SESSION_SECRET` 原样保存到本地 `.env`、`.env.local`、Docker environment 或部署平台环境变量，无需手工转义。明文密码不会写入源码或数据库，实际 hash、secret 和 `.env` 文件都不应提交到 git；变量格式可参考 `.env.example`。

```bash
npm install
set DATABASE_URL=file:./dev.db
npx prisma generate
npx prisma migrate dev
npm test
npm run lint
npm run build
```

PowerShell 可使用 `$env:DATABASE_URL='file:./dev.db'` 设置数据库地址。

## 公网部署

仓库提供 Docker Compose + Traefik HTTPS 部署方案。先运行 `npm run auth:generate` 生成认证配置，再按照 [DEPLOY.md](DEPLOY.md) 配置域名、持久化 SQLite 和 Let's Encrypt。

## 技术栈

- Next.js + TypeScript
- Prisma + SQLite
- 轻量 Material 风格移动端 UI
- Web App Manifest / PWA 主屏幕支持

## License

本项目沿用原项目的 MIT License 与原作者版权。此仓库是基于 `jyh9521/fuel-tracker` 修改的个人 fork。
