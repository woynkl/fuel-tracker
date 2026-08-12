# Fuel Tracker 项目实施计划

## 1. 项目目标

Fuel Tracker 是一个**个人使用、手机优先、本地数据优先的单车油耗记录 APP**。

核心目标：

> 在手机上尽可能简单、快速、离线地记录个人车辆加油数据，并准确计算真实油耗和用车成本。

项目不是公网 SaaS、云端车管平台、多用户系统或服务器运维项目。后续所有技术和产品决策都优先服从：**简单、本地、手机、可靠**。

## 2. 最终产品形态

最终目标是一个可直接安装到 Android 手机的本地 APP：

```text
Android 手机
└── Fuel Tracker APK
    ├── React / Next.js 静态前端
    ├── 油耗计算
    ├── IndexedDB 本地数据
    ├── JSON 导入 / 导出
    └── Capacitor Android 容器
```

正常使用时：

- 不需要服务器
- 不需要登录
- 不需要 Docker
- 不需要数据库服务
- 不需要公网域名
- 不需要网络
- 不需要账号或云同步

Web/PWA 只作为开发、预览或可选使用方式，不作为项目必须依赖的运行环境。手机实机验收统一以 APK 为准。

## 3. 产品范围

保留核心能力：

- 单车加油录入
- 当前里程 km
- 加油金额 CNY
- 当前油价 CNY/L
- 日期
- 是否加满
- 历史记录
- 删除记录
- Dashboard 统计
- JSON 导出 / 导入

默认日期为今天，默认“加满”。

加油升数始终由业务逻辑计算：

```text
liters = amount / unitPrice
```

油耗继续使用 full-to-full 规则。第一条加满记录仅作基准；两个加满节点之间累计所有中间 partial fill 的升数和金额。

```text
distance = endMileage - startMileage
consumption = liters / distance × 100
costPer100km = amount / distance × 100
costPerKm = amount / distance
```

总体平均值只使用已经完成的 full-to-full 周期。

暂不增加编辑历史记录、多车辆、保养、地图、油价趋势、云同步等功能。

## 4. 明确删除的范围

Local-first 转型完成后删除：

- Prisma
- `@prisma/client`
- SQLite server database
- Prisma migrations
- `src/lib/db.ts`
- `/api/fuel*`
- `/api/vehicles*`
- `/api/backup`
- `/login`
- `/api/auth/*`
- `src/lib/auth.ts`
- `src/proxy.ts`
- session / cookie / scrypt / HMAC 认证
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`
- 公网部署相关 Traefik / ACME / RateLimit / Docker Compose 方案

PR #4 不进入最终产品路线。

## 5. 技术路线

继续保留：

- Next.js
- React
- TypeScript

当前不做前端框架迁移。

目标是把 Next.js 从“服务器运行框架”收敛成**静态前端构建工具**，最终输出静态资源，再由 Capacitor 打包到 Android APK。

## 6. 本地数据模型

业务数据使用：

```text
IndexedDB
```

不使用 `localStorage` 保存正式业务记录。

业务代码不在 React 组件中直接散布 IndexedDB 调用，而是统一通过本地 Repository。

建议结构：

```text
src/lib/storage/
  repository.ts
  indexeddb.ts
  types.ts
```

## 7. LocalRepository 职责

统一提供本地数据接口，例如：

```text
initialize()
getVehicle()
saveVehicle()
listFuelRecords()
addFuelRecord()
deleteFuelRecord()
exportData()
importData()
clearAllData()
```

UI 不直接知道 IndexedDB objectStore、request、transaction 等实现细节。

## 8. IndexedDB 数据结构

数据库建议名称：

```text
fuel-tracker
```

初始版本：

```text
1
```

建议 stores：

```text
vehicle
fuelRecords
```

`vehicle` 为单例。

`fuelRecords` 至少包含：

```text
id
vehicleId
mileage
liters
price
unitPrice
date
fullTank
createdAt
```

只保留当前业务需要或旧备份兼容需要的字段。

## 9. 业务规则与存储分离

`src/lib/fuel.ts` 保持纯函数。

禁止把 IndexedDB、React state、浏览器 API 写入油耗计算模块。

目标结构：

```text
IndexedDB
  ↓
LocalRepository
  ↓
FuelRecord[]
  ↓
fuel.ts
  ↓
统计结果
  ↓
React UI
```

这样油耗计算可以独立测试，不依赖浏览器或数据库。

## 10. 备份兼容策略

现有 PR #2 的 JSON 备份格式继续作为正式资产。

尽可能保持：

```text
schemaVersion = 1
vehicle
fuelRecords
```

目标：**当前服务器版导出的 JSON，可以直接导入未来 Local-first / APK 版本。**

Backup 逻辑拆分为：

```text
纯 JSON schema / validation
+
IndexedDB read/write adapter
```

不再依赖 Prisma。

## 11. 数据迁移策略

在删除 Prisma 之前，如果已有实际数据：

1. 从旧版本导出 JSON。
2. 将备份保存到手机或电脑安全位置。
3. 安装 Local-first APK。
4. 在“数据管理”中导入 JSON。
5. 核对历史、累计金额、里程、油耗统计。

IndexedDB 为空时显示正常空状态，不自动伪造业务数据。

## 12. 实施阶段

整个转型拆成多个小 PR，避免一次推倒重写。

原则：

- 每个 PR 范围单一
- 每个阶段 main 保持可运行
- 不在迁移期间顺手增加新功能
- 每个阶段通过 review 后再进入下一阶段

## 13. Phase 1 — Domain 解耦

建议分支：

```text
agent/local-first-domain
```

目标：在不改变当前用户行为的前提下，把业务逻辑从 Prisma 解耦。

建立独立 TypeScript 类型：

```text
Vehicle
FuelRecord
BackupPayload
```

这些类型不能来自 `@prisma/client`。

重构 `fuel.ts`、`backup.ts`，使计算和校验成为纯业务逻辑。

这一阶段 Prisma/API/auth 仍可以存在，main 继续正常工作。

PR 建议：

```text
refactor: decouple fuel domain from Prisma
```

## 14. Phase 2 — IndexedDB Repository

建议分支：

```text
agent/local-first-storage
```

新增：

```text
LocalRepository
IndexedDbRepository
```

实现：

- 初始化
- 默认车辆
- 添加记录
- 删除记录
- 查询记录
- 清空数据
- transaction
- 数据升级入口

强制业务校验：

```text
mileage > 0
amount > 0
unitPrice > 0
newMileage > latestMileage
```

`liters` 必须重新按 `amount / unitPrice` 计算，不能信任外部输入。

至少测试：空数据库、第一条、第二条、递增里程、删除、重新打开后持久化、非法数据拒绝。

PR 建议：

```text
feat: add local IndexedDB storage
```

## 15. Phase 3 — UI 切换 Local-first

建议分支：

```text
agent/local-first-ui
```

首页从服务端 Prisma 数据改成：

```text
Client UI
→ LocalRepository
→ IndexedDB
```

Add Fuel 从 `fetch('/api/fuel')` 改为 `repository.addFuelRecord()`。

Delete 从 API DELETE 改为 `repository.deleteFuelRecord()`。

Backup 从 API 改为浏览器本地：

```text
IndexedDB
→ BackupPayload
→ Blob
→ JSON 下载
```

导入：

```text
File
→ parse
→ validate
→ confirm overwrite
→ IndexedDB transaction
```

## 16. Phase 4 — 删除 Server 架构

只有 Phase 3 已经完全使用本地存储后才清理服务器代码。

删除：

- Prisma 和 migrations
- server SQLite
- 业务 API
- auth / login / logout / proxy
- session / cookie
- auth generator 和认证环境变量

不要整包 `git revert PR #3`，而是按最终架构删除已经无消费者的服务器代码，避免误删其它合理调整。

PR 可与 Phase 3 同步或紧跟一个 cleanup PR：

```text
refactor: remove server persistence and authentication
```

## 17. Phase 5 — Static App

目标：构建产物不需要 Node server。

Next.js 调整为静态输出。

最终运行时不存在：

- `/api/*` 业务接口
- Prisma runtime
- Node server requirement

添加、删除、统计、备份不产生业务网络请求。

## 18. Phase 6 — Android APK 打包

当静态 Local-first 版本稳定后，引入 Capacitor Android 容器。

目标：

```text
Next.js static export
→ Capacitor
→ Android project
→ APK
```

APK 内打包全部静态资源，因此手机日常运行不依赖网站、域名或网络。

要求：

- 固定 applicationId
- 测试 APK 使用稳定签名方式，保证后续 APK 可以覆盖安装
- 私有 signing key 不提交到 Git
- APP 升级不能清空 IndexedDB
- 卸载 APP 前必须提醒先导出 JSON，因为 Android 卸载通常会删除 APP 本地数据

不要求上架 Play Store。

## 19. APP 更新策略

APK 版本升级时：

- applicationId 保持一致
- 签名保持一致
- IndexedDB schema 使用显式版本迁移
- 新版本不能自动清空业务数据
- 升级前建议用户先导出 JSON 备份

每次涉及数据结构升级，都必须测试“旧 APK 有数据 → 覆盖安装新 APK → 数据仍存在”。

## 20. 手机真实验收规则

只要某个阶段需要真实手机验证，就必须先产出可安装 APK，再交给用户测试。

开发侧负责：

- 构建 APK
- 标明版本号 / commit SHA
- 提供 APK 文件
- 提供测试清单
- 说明是否属于覆盖安装测试或全新安装测试

用户负责：

- 在自己的 Android 手机安装 APK
- 按固定流程操作
- 返回通过/失败结果
- 出错时提供截图和复现步骤

不要求用户安装 Node.js、Android Studio、Docker 或连接开发环境。

## 21. 用户手机测试流程

每次需要实机验收时，给用户一份与 APK 对应的测试清单。Local-first MVP 最终验收至少覆盖以下流程。

### A. 安装与启动

1. 下载本次提供的 APK。
2. Android 如提示，允许从当前文件管理器/浏览器安装未知来源 APP。
3. 安装 APK。
4. 打开 Fuel Tracker。
5. 确认没有登录页、服务器配置页或网络配置要求。
6. 确认 390px 左右手机宽度无横向滚动和明显布局错误。

### B. 首条基准记录

录入：

```text
里程：10000 km
金额：380 CNY
油价：7.60 CNY/L
加满：是
```

期望：

- liters = 50 L
- 该条仅为基准
- 油耗显示 `--` 或等价未完成状态

关闭 APP，再重新打开，记录必须仍存在。

### C. 完整 full-to-full 周期

再录入：

```text
里程：10550 km
金额：380 CNY
油价：7.60 CNY/L
加满：是
```

期望：

```text
distance = 550 km
liters = 50 L
consumption ≈ 9.09 L/100km
```

### D. Partial fill

新增一个测试周期：

```text
full
→ partial
→ full
```

确认中间 partial 的升数和金额被计入下一完整周期，而 partial 本身不会提前生成虚假准确油耗。

### E. 删除与重算

删除一条测试记录。

确认：

- 历史记录消失
- 最近周期重新计算
- 平均油耗重新计算
- 累计里程重新计算
- 累计金额重新计算

### F. 完全离线测试

1. 打开 APP 确认正常。
2. 开启飞行模式，并关闭 Wi-Fi。
3. 完全退出 APP。
4. 重新打开 APP。
5. 查看历史。
6. 新增加油记录。
7. 删除测试记录。
8. 查看统计。
9. 导出 JSON。

以上操作全部必须正常，不应要求网络。

### G. JSON 备份恢复

1. 在 APP 中导出 `fuel-backup-YYYY-MM-DD.json`。
2. 确认文件已保存到 APP 外部位置，例如 Downloads。
3. 清空 APP 内测试数据（使用正式清空功能；如果当时还没有该功能，则使用专门测试步骤）。
4. 导入刚才的 JSON。
5. 确认历史记录、里程、金额和油耗统计全部恢复。

同时使用一个 PR #2 时代的 legacy fixture 验证旧格式兼容。

### H. APP 重启与手机重启

1. 记录至少两条数据。
2. 强制关闭 APP。
3. 重新打开，确认数据存在。
4. 重启手机。
5. 再打开 APP，确认数据仍存在。

### I. APK 覆盖升级测试

这是每次涉及存储或 Android 包装修改时的必测项。

1. 在旧测试 APK 中录入几条数据。
2. 导出 JSON 作为额外保险。
3. 不卸载旧 APK。
4. 直接安装新 APK 覆盖旧版本。
5. 打开新版本。
6. 确认旧数据仍存在。
7. 再新增一条记录，确认读写正常。

如果系统要求先卸载旧 APK，说明 applicationId 或签名策略出现问题，不能直接通过验收。

### J. 用户反馈格式

每次测试后按下面格式反馈：

```text
APK 版本/Commit：
手机型号：
Android 版本：
安装方式：全新安装 / 覆盖安装

A 安装启动：通过 / 失败
B 首条基准：通过 / 失败
C Full-to-full：通过 / 失败
D Partial fill：通过 / 失败
E 删除重算：通过 / 失败
F 完全离线：通过 / 失败
G 备份恢复：通过 / 失败
H 重启持久化：通过 / 失败
I 覆盖升级：通过 / 失败 / 本轮不适用

问题描述：
复现步骤：
期望结果：
实际结果：
截图：如有
```

## 22. 数据安全原则

Local-first 不代表永不丢数据。

数据可能因以下情况消失：

- 用户清除 APP 数据
- 卸载 APK
- Android 系统异常
- 存储损坏

所以 JSON backup 是正式功能，不是调试功能。

数据管理页应明确提醒：

> 数据只保存在当前设备。建议定期导出备份；卸载 APP 前必须先导出备份。

当前阶段不做 Google Drive、iCloud、Dropbox 或任何云自动备份。

## 23. 最终依赖关系

目标代码依赖：

```text
React UI
  ↓
LocalRepository
  ↓
IndexedDB

React UI
  ↓
fuel.ts
```

Backup：

```text
IndexedDB
  ↕
backup.ts
  ↕
JSON file
```

Android：

```text
Static Web App
  ↓
Capacitor WebView
  ↓
APK
```

禁止再次形成：

```text
React → Prisma
React → internal API → database
IndexedDB → server
```

## 24. Git 工作流

所有阶段：

```text
main
↓
agent/<feature>
↓
Draft PR
↓
review
↓
fix
↓
Ready
↓
Squash merge
```

不直接在 `main` 开发功能。

每个 PR 必须范围单一、可以独立 review、不自动 merge。

文档类小变更可例外直接提交，但业务与架构变更继续走 PR。

## 25. 每个 PR 的质量 Gate

基础检查至少：

```text
npm test
npm run lint
npm run build
git diff --check
```

涉及 IndexedDB：增加真实浏览器存储测试。

涉及 Android / Capacitor / 本地数据升级：必须产出 APK 并执行第 21 节对应的用户真机测试。

用户真机验收失败时，该阶段不能标记完成。

## 26. 建议 PR 顺序

PR #6
refactor: decouple fuel domain from Prisma

PR #7
feat: add local IndexedDB storage

PR #8
refactor: move app to local-first storage

PR #9
feat: build local Android app

目标：

- Static export
- Capacitor Android
- APK 构建
- 完全离线运行
- 本地数据升级策略
- 用户真机验收

如果 PR #9 过大，可拆成：

PR #9
feat: enable static export

PR #10
feat: package Android APK

但不为了拆 PR 而增加额外产品功能。

## 27. 功能冻结规则

Local-first / APK 转型完成前禁止增加：

- 图表
- 油价趋势
- 编辑历史
- 多车辆
- 保养
- 地图
- 定位
- 云同步
- 登录
- 账号
- 分享
- Play Store 上架

只允许完成 Local-first Android APP 所必需的修改。

## 28. Local-first 完成定义

同时满足以下条件才算完成。

### 数据

- IndexedDB 保存
- APP 关闭不丢
- 手机重启不丢
- APK 覆盖升级不丢
- 无服务器数据库

### 计算

- full-to-full 正确
- partial fill 正确
- delete 重算正确

### Backup

- JSON export
- JSON import
- legacy backup compatible

### Offline

飞行模式下可以：

- 打开 APP
- 录入
- 删除
- 查看
- 备份

### Architecture

不存在：

- Prisma runtime
- Next API business routes
- auth/session
- Docker production requirement
- 公网服务器 requirement

### Android

- 可生成 APK
- 用户可直接安装
- 无需开发环境
- 390px 手机 UI 正常
- 覆盖安装可保留数据

达到以上条件后标记：

```text
Local-first Android MVP Complete
```

## 29. 完成后的产品策略

完成 Local-first Android MVP 后停止继续堆功能，先进入真实使用阶段。

用户日常实际使用一段时间，只记录真实痛点。

之后候选功能才包括：

1. 编辑历史记录
2. 简单油耗趋势
3. 自动备份提醒

优先级由真实使用决定，而不是由“技术上还能做什么”决定。

## 30. 项目决策原则

以后每增加一个功能之前，先问：

> 这是否让“手机上记录一次加油”更简单、更可靠？

如果答案不是明确的“是”，就不做。

项目成功标准不是功能数量，而是：

```text
打开快
记录快
计算准
离线能用
数据可备份
APK 好安装
升级不丢数据
长期不用维护
```
