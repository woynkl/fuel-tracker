# 个人油耗记录公网部署指南

本指南使用仓库内的 `Dockerfile` 构建 APP，并通过 Traefik 提供 HTTPS。APP 的 9521 端口不会发布到宿主机或公网。

```text
Internet
   ↓
Traefik :443
   ↓
Docker internal network
   ↓
Next.js :9521
```

## 前提

- Docker Engine
- Docker Compose v2.24 或更高版本
- Node.js 22.6 或更高版本（用于生成认证配置）
- 一个域名
- 域名的 DNS A/AAAA 记录已指向部署服务器
- 公网 TCP 80 和 443 可以访问该服务器

Traefik 使用固定的 `traefik:v3.7.1` 镜像。Docker provider 默认不暴露容器，dashboard 未公开，公网只开放 80/443。

## 初始化

在仓库根目录执行：

```bash
cp .env.production.example .env.production
npm run auth:generate
mkdir -p data traefik/letsencrypt
touch traefik/letsencrypt/acme.json
chmod 600 .env.production traefik/letsencrypt/acme.json
```

将 `npm run auth:generate` 输出的值原样填入 `.env.production`。至少填写：

- `APP_DOMAIN`：只填写域名，例如 `fuel.example.com`，不要包含协议或路径
- `ACME_EMAIL`：Let's Encrypt 到期通知邮箱
- `APP_PASSWORD_HASH`：生成器输出的 scrypt hash
- `SESSION_SECRET`：生成器输出的 session 签名 secret

保留：

```text
DATABASE_URL=file:/app/prisma/db/dev.db
```

真实 `.env.production` 已被 git 和 Docker build context 忽略。认证 secret 只通过容器环境变量传入，不会写入 Docker labels。

让当前 shell 的 Compose 命令使用该文件：

```bash
export COMPOSE_ENV_FILES=.env.production
```

PowerShell 使用：

```powershell
$env:COMPOSE_ENV_FILES='.env.production'
```

每次打开新的部署 shell 都应先设置该变量；也可以在每条命令中显式使用 `docker compose --env-file .env.production ...`。

在启动前检查 Compose 配置：

```bash
docker compose config
```

## 启动

```bash
docker compose up -d --build
```

首次启动时，现有 entrypoint 会执行已提交 migration 的非交互式部署命令：

```text
prisma migrate deploy
```

部署流程不使用 `prisma db push`、`prisma migrate reset` 或 `--accept-data-loss`。

## 查看状态

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f traefik
```

APP healthcheck 请求容器内部的 `GET /api/health`。该接口无需登录，只返回：

```json
{
  "status": "ok"
}
```

它不会访问或修改数据库，也不会返回 secret、数据库路径、环境变量或用户数据。

## HTTPS 与登录限速

Traefik 会把 HTTP 自动重定向到 HTTPS，并通过 Let's Encrypt HTTP challenge 申请证书。ACME 数据保存在宿主机：

```text
./traefik/letsencrypt/acme.json
```

删除或重建容器不会删除该文件。它包含证书私钥，应保持 `0600` 权限、纳入服务器备份并且绝不能提交到 git。

`POST /api/auth/login` 使用单独的高优先级 router，并应用以下 RateLimit：

- average：5
- period：1 分钟
- burst：5

登录 router 和普通 APP router 都指向同一个 APP service。普通页面和其他 API 不使用这条严格的登录限速。

## 网络与 Forwarded headers

APP 只加入 `fuel-tracker-internal` 内部网络，只通过 `expose: 9521` 对 Traefik 可见；Compose 没有为 APP 配置宿主机 `ports`。Traefik 同时加入内部网络和外联网络，以便接收 80/443 流量并访问 ACME 服务。

默认拓扑要求 Traefik 直接面向 Internet。配置没有启用不安全的 forwarded-header 信任模式，外部请求不能绕过 Traefik直接访问 APP 9521。

如果 Traefik 前面还有 Cloudflare、CDN 或负载均衡器，只能为实际代理商公布的固定 CIDR 配置可信代理，例如在 Traefik 的 `web` 和 `websecure` entrypoint 上设置对应的 `forwardedHeaders.trustedIPs`。代理地址变化时必须同步更新。不要信任 `0.0.0.0/0`、`::/0` 或任意来源提供的 `X-Forwarded-*` header。

## SQLite 持久化

宿主机目录：

```text
./data
```

挂载到容器：

```text
/app/prisma/db
```

正式 SQLite 使用明确的 bind mount，不使用匿名 volume。删除或重建容器以及执行普通的 `docker compose down` 都不会删除 `./data/dev.db`；不要手动删除 `./data`。

## 数据备份

### APP 内 JSON 备份

适合：

- 用户手动导出
- 在不同部署间迁移数据
- 恢复车辆与油耗业务记录

JSON 备份是应用层数据，不包含完整 SQLite 文件状态。

### SQLite 文件备份

适合：

- 部署升级前
- 服务器级灾难恢复
- 保留与 schema migration 对应的完整数据库状态

复制 SQLite 文件前，优先停止 APP，避免复制到写入中的不一致状态：

```bash
docker compose stop app
cp data/dev.db data/dev.db.backup
docker compose start app
```

如果不能停机，应使用 SQLite 官方 backup API 或 `sqlite3` 的 `.backup` 命令，而不是在数据库大量写入时直接复制正在使用的文件。

备份文件也包含个人数据，应限制权限并保存到安全位置。

## 更新

先停止 APP 并备份 SQLite：

```bash
docker compose stop app
cp data/dev.db data/dev.db.backup
```

然后更新代码、重新构建并启动：

```bash
git pull
docker compose build
docker compose up -d
```

确认服务与 healthcheck 正常后，再按照你的备份保留策略处理旧备份。不要在未验证新版本前删除升级前备份。

## 回滚

1. 保留当前 `data/dev.db` 和升级前 SQLite 备份，不要用旧代码目录中的数据库覆盖它。
2. 将代码切换到已知可用的 tag 或 commit。
3. 重新构建并启动 APP 镜像：

   ```bash
   docker compose build app
   docker compose up -d
   ```

4. 检查 APP 日志和 healthcheck。

代码回滚不等于数据库回滚。若新版本已经执行 schema migration，旧代码可能无法读取新 schema；应先审查 migration 的兼容性。只有在明确需要恢复数据库且已停止 APP 时，才使用匹配时间点的 SQLite 备份。不要把 SQLite 数据跟随代码目录一起盲目回滚或覆盖。

## 停止服务

```bash
docker compose down
```

该命令停止并删除容器与 Compose 网络，但不会删除 `./data` 或 `./traefik/letsencrypt` 中的 bind-mounted 文件。

## 故障排查

- 证书无法签发：确认 DNS 已生效，公网 80/443 未被防火墙或其他服务占用，并查看 `docker compose logs -f traefik`。
- APP 不健康：查看 `docker compose logs -f app`，确认 `.env.production` 中三个 APP 环境变量均已填写，且 `./data` 可写。
- 登录返回 429：等待限速窗口恢复；普通页面和其他 API 不受登录限速 middleware 影响。
- 修改域名后：更新 `APP_DOMAIN`，再次运行 `docker compose config`，再执行 `docker compose up -d`。
