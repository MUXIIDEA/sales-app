# 部署到免费云平台（外网访问）

本项目已支持**容器化部署**，可从 GitHub 仓库一键拉取到任意支持 Docker 的免费云平台
（Render / Railway / Fly.io / Koyeb 等），从而获得一个公网可访问的地址。

> 前提：本项目有 Express 后端 + SQLite 数据库，GitHub 自家的 GitHub Pages **无法**运行它。
> 下面的平台都是第三方免费层，需要你**注册并授权连接你的 GitHub 账号**（仓库：`MUXIIDEA/sales-app`）。

---

## ⚠️ 最重要：SQLite 数据持久化

容器的文件系统是**临时**的，重启/重新部署后本地数据会丢失。
**必须给数据库目录挂一个持久卷**，否则每次重启销售记录都会被清空（仅保留首次启动写入的演示数据）。

约定：把持久卷挂载到容器的 `/data`，并设置环境变量：

```
DB_PATH=/data/sales.db
```

这样 `sales.db` 就落在持久卷里，重启不丢。各平台挂卷的方式见下方对应步骤。

---

## 环境变量

| 变量 | 说明 | 建议值 |
|------|------|--------|
| `PORT` | 监听端口 | 由平台自动注入，**不要硬编码**（Dockerfile 默认值 3000 仅作兜底） |
| `DB_PATH` | 数据库文件路径 | 指向持久卷，如 `/data/sales.db` |
| `ADMIN_PASSWORD` | 管理员初始口令 | **务必在平台侧设置**，不要写进仓库 |

---

## 方案 A：Render（最省事，推荐先试）

1. 打开 <https://render.com> 注册（可用 GitHub 登录），免费层**无需信用卡**。
2. **New → Web Service → Connect** 你的 GitHub 仓库 `MUXIIDEA/sales-app`。
3. **Runtime** 选 `Docker`（会自动使用仓库里的 `Dockerfile`）。
4. **Advanced → Add Disk**：
   - Mount Path 填 `/data`
   - 容量选最小即可（如 1 GB）
5. **Environment → Add Environment Variable**：
   - `DB_PATH` = `/data/sales.db`
   - `ADMIN_PASSWORD` = 你想要的强口令
6. 点 **Create Web Service**，等待构建部署。
7. 部署完成后，Render 会给你一个 `xxx.onrender.com` 公网地址，直接浏览器打开即可。

> 说明：Render 免费 Web Service 在一段时间无访问后会休眠（下次访问稍慢），属正常现象。

---

## 方案 B：Fly.io（免费层带持久卷，真正不丢数据）

1. 安装 `flyctl`：<https://fly.io/docs/hands-on/installing/>
2. 登录：`fly auth login`
3. 在项目目录执行 `fly launch`（会自动识别 Dockerfile）：
   - 应用名随意；区域自选
   - 当询问是否部署时可以先选稍后
4. 创建持久卷：`fly volumes create sales_data 1 --region <同上区域>`（1 GB）
5. 设置密钥：`fly secrets set ADMIN_PASSWORD=你的强口令 DB_PATH=/data/sales.db`
6. 在 `fly.toml` 的 `[mounts]` 段挂载卷到 `/data`（fly launch 会提示），确认后 `fly deploy`
7. 完成后 `fly open` 打开公网地址。

> Fly.io 免费额度含一定时长的 VM 与 3GB 卷存储，适合长期常开。

---

## 方案 C：Railway / Koyeb

两者同样支持从 GitHub 拉取并识别 `Dockerfile`：
- 新建 Project → 连接仓库 `MUXIIDEA/sales-app` → 选 Docker 部署。
- 在环境变量/卷设置中配置 `DB_PATH=/data/sales.db` 并挂载持久卷到 `/data`。
- 设置 `ADMIN_PASSWORD`。
- 部署后获得公网域名。

---

## 本地用 Docker 自测（可选）

```bash
docker build -t sales-app .
docker run -d -p 3000:3000 -e DB_PATH=/data/sales.db -v sales_data:/data sales-app
# 浏览器打开 http://localhost:3000
```

---

## 安全提醒

- **不要让 `ADMIN_PASSWORD` 留在仓库里**，只在平台环境变量/密钥中设置。
- 公开部署后，任何拿到地址的人都能访问登录页；请使用强口令，并定期备份 `sales.db`（页面内「下载备份」或复制持久卷里的文件）。
- 若不再需要外网访问，删除对应平台的服务即可。
