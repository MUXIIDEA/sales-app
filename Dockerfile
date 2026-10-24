# 销售记录系统 - 容器化部署
# 适配所有支持 Docker 的云平台（Render / Railway / Fly.io / Koyeb 等）
# 关键点：better-sqlite3 是原生模块，这里在 Linux 镜像中重新编译/安装，
#         不会使用仓库里那份 Windows 版 node_modules。

FROM node:22-bookworm-slim

# 安装原生模块编译所需的工具（better-sqlite3 无预编译包时会从源码编译）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 仅先拷贝依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./

# 干净安装（ci 会删除旧 node_modules，确保装到 Linux 版 better-sqlite3）
RUN npm ci --omit=dev

# 拷贝应用源码（node_modules / 数据库 / 临时文件已被 .dockerignore 排除）
COPY . .

# 持久化数据目录（部署时请把持久卷挂载到 /data，并设置 DB_PATH=/data/sales.db）
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/sales.db

EXPOSE 3000

CMD ["node", "server.js"]
