# 电子病历管理系统（GBEMR）

面向中小型医疗机构的电子病历管理系统，覆盖患者档案、结构化病历、医嘱处方、审签归档、统计检索与系统审计，并内建**跨机构调阅授权闭环**：患者可向指定医疗机构授予限时、限定用途的查阅权，医生打开病历前强制核验授权，撤回/到期/超范围一律拒绝且全程留痕。

## 快速启动（Docker Compose）

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

访问地址：

- 前端：http://localhost:18930
- 后端健康检查：http://localhost:19930/health
- API 示例：http://localhost:18930/api/summary

停止服务：

```bash
docker compose down
```

## 项目主要功能

- 患者档案管理：录入姓名、性别、年龄、身份证号、手机号、过敏史、既往史，并支持姓名、身份证号、手机号检索。
- 病历书写与模板：门诊/住院病历结构化字段，集成富文本编辑器，按患者时间轴展示。
- 医嘱与处方管理：处方药品、规格、用法、频次、疗程和状态跟踪，支持打印预览入口。
- 病历权限与审签：内置医生、护士、管理员角色示例，演示 JWT 登录和审签归档状态。
- 病历检索与统计：提供患者、病历、处方数量和科室工作量统计接口。
- **跨机构调阅授权闭环**（本系统重点能力）：
  - **限时授权**：患者为指定医疗机构授权，可勾选调阅用途（门诊/住院/急诊/转诊）并设置有效时长。
  - **打开前核验**：医生调阅病历前按“授权存在 → 未撤回 → 未到期 → 用途在范围内”顺序核验，通过才返回病历。
  - **拒绝策略**：撤回、到期、超范围或从未授权均拒绝调阅，并把失败原因（`revoked` / `expired` / `out_of_scope` / `no_consent`）写入审计。
  - **重复授权幂等**：同一患者对同一机构已存在完全相同的有效授权时直接沿用（`reused`），只追加审计，不生成重复授权；用途变化则在原授权上变更续期，仍只有一条授权。
  - **并发安全**：撤回与再次授权并发时，以“患者+机构”粒度的 PostgreSQL 咨询锁串行化，**恰好一处成功**，另一处收到 `409` 冲突提示；数据库部分唯一索引兜底，保证同一对患者-机构至多一条有效授权。
  - **全程审计**：每次调阅无论放行还是拒绝，都记录调阅机构、医生、用途、对象与时间；失败记录在审计落库提交后才返回错误，刷新页面仍可回查。
  - **档案页**：展示有效授权（含到期/撤回历史）、调阅记录（含失败提示与中文原因），患者选择持久化在 URL 查询参数中，刷新后状态可回查。

## 本地开发方式

后端：

```bash
cd backend
npm install
npm run start:dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

本地开发时前端默认运行在 `18930`，Vite 会将 `/api` 代理到 `http://localhost:19930`。

## 跨机构调阅接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/institutions` | 可授权医疗机构字典 |
| GET | `/api/patients/:id/consents` | 患者全部授权（有效/到期/撤回） |
| POST | `/api/patients/:id/consents` | 授予/续期/变更限时授权（重复授权沿用） |
| POST | `/api/patients/:id/consents/revoke` | 撤回授权（与再授权并发仅一处成功） |
| GET | `/api/patients/:id/access-logs` | 调阅记录（放行与拒绝，含失败原因） |
| GET | `/api/institutions/:id/active-consents` | 某机构当前有效授权清单 |
| POST | `/api/patients/:id/access-records` | 医生打开病历：核验授权并返回病历，失败返回 403 且落审计 |

调阅被拒绝时后端返回 `403`，响应体示例：

```json
{ "message": "授权已到期", "denyReason": "expired", "accessLogId": 12, "consentId": 2 }
```

## 前端页面

- **病历工作台**（`/`）：档案检索、时间轴、富文本病历与处方演示。
- **患者授权档案**（`/consents`）：授予限时授权、撤回、查看有效授权与全部调阅记录，并提供“撤回 vs 再授权 并发对决”按钮直观验证并发互斥。
- **跨机构调阅（医生）**（`/doctor`）：选择机构、医生、患者与本次用途后打开病历；通过则展示病历，拒绝则展示原因；两侧均可实时回查审计记录。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Ant Design、React Router、WangEditor、dayjs |
| 后端 | NestJS、TypeScript、JWT、pg（PostgreSQL 咨询锁/事务/部分唯一索引） |
| 数据库 | PostgreSQL 15 |
| 部署 | Docker Compose、Nginx |

## 项目目录结构

```text
.
├── backend/                  # NestJS 后端
│   ├── src/auth/             # 登录与 JWT
│   ├── src/common/           # 常量、数据库（含事务）、审计日志
│   ├── src/consents/         # 跨机构授权、撤回、调阅核验与审计
│   └── src/records/          # 患者档案与病历 API
├── database/
│   └── init.sql              # 表结构、索引与演示数据（含授权/调阅场景）
├── frontend/                 # React 前端
│   ├── src/api/              # API 请求（emr / consent）
│   ├── src/components/       # 通用组件（布局、指标卡）
│   ├── src/constants/        # 前端常量（用途、状态、时长）
│   ├── src/pages/            # 工作台 / 患者授权档案 / 医生调阅
│   ├── src/types/            # 类型定义
│   └── src/utils/            # 工具函数（时间格式化）
├── docker-compose.yml
├── .env.example
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认示例 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | Compose 项目名，避免中文目录影响容器名 | `gbemr` |
| `DB_NAME` | PostgreSQL 数据库名 | `gbemr` |
| `DB_USER` | PostgreSQL 用户名 | `gbemr_user` |
| `DB_PASSWORD` | PostgreSQL 密码 | `change_me_strong_password` |
| `JWT_SECRET` | JWT 签名密钥 | `change_me_to_a_long_random_secret` |
| `FRONTEND_PORT` | 前端宿主机端口 | `18930` |
| `BACKEND_PORT` | 后端宿主机端口 | `19930` |

## Docker 部署说明

- `docker-compose.yml` 顶层声明 `name: gbemr`，并通过 `.env` 设置 `COMPOSE_PROJECT_NAME=gbemr`，可在中文目录名下直接启动。
- 前端端口映射为 `${FRONTEND_PORT:-18930}:80`，后端端口映射为 `${BACKEND_PORT:-19930}:3000`。
- 前端 Nginx 将 `/api/` 反向代理到 Docker 内部服务 `http://backend:3000/`。
- PostgreSQL 使用命名卷 `db_data` 持久化，不绑定到宿主机中文路径。
- 数据库和后端均配置 healthcheck，后端等待数据库 healthy 后启动，前端等待后端 healthy 后启动。
- `database/init.sql` 仅在数据卷首次初始化时执行，内置一条有效授权、一条到期授权、一条已撤回授权及对应的放行/拒绝调阅审计，便于直接演示闭环。

常见问题：

- 如果端口被占用，修改 `.env` 中的 `FRONTEND_PORT` 或 `BACKEND_PORT` 后重新执行 `docker compose up -d`。
- 首次启动前必须执行 `cp .env.example .env`。
- 修改数据库初始化脚本后如需重新初始化，可执行 `docker compose down -v` 清理数据卷（注意会同时清空业务数据）。

## License

MIT
