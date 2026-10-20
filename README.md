# 内网销售记录系统（Sales Record System）

一个跑在办公室内网（同一 WiFi）下的销售记账小网站：记一笔、查记录、看统计、导数据。
一台常开电脑当服务器，全办公室的电脑 / 手机连上同一个 WiFi，浏览器打开 `http://服务器IP:3000` 就能用。

- 技术栈：Node.js + Express + SQLite（`better-sqlite3`）+ 原生 HTML/CSS/JS（无需打包构建）
- 数据文件：`sales.db`（一个文件就是整个数据库，**备份 = 复制它**）
- 无需公网、无需域名、无需购买任何云服务
- **本压缩包已内置 `node_modules`，免安装、免 `npm`：双击 `start.bat` 即可运行**

---

## 一、最快上手（本机试运行）

本压缩包已经把运行所需的所有依赖（`node_modules`，含原生数据库驱动）一起打包了，
**不需要联网、不需要执行 `npm install`**。你只需要本机有一个 Node.js 22。

> 本项目内置的数据库驱动 `better-sqlite3` 是按 **Node.js 22（Windows 64 位）** 预编译的，
> 因此请使用 Node 22 运行本系统。系统里其它版本的 Node 不影响本项目。
> 没有 Node 22？去官网 <https://nodejs.org> 下载 **Node.js 22 LTS**（LTS 即长期支持版）安装即可。

启动方式（任选其一）：

- **方式一（推荐，最简单）**：双击 `start.bat`。启动脚本会**自动寻找 Node.js 22** 来运行（依次查找 `C:\nodejs\node.exe`、本机 WorkBuddy 管理的 Node 22、以及 PATH 中的 `node`），找不到时给出明确提示（见下方「常见问题 / Node 版本」）。
- **方式二（命令行）**：
  ```bash
  cd sales-app
  C:\nodejs\node.exe server.js
  # 或 PATH 中已有 node 22： node server.js
  ```

启动后访问：

- 本机：<http://127.0.0.1:3000>
- 局域网：<http://你的内网IP:3000>（启动时会尝试打印本机 IP）

登录方式：选择姓名并**输入口令**登录（所有账户都需要口令）。管理员初始口令：`admin1`（可用 `ADMIN_PASSWORD` 环境变量覆盖）；销售员默认口令为 `admin` + 序号（如 `admin2`、`admin3`，按账户 id 排列），**首次登录后可在右上角「修改口令」自行修改**。

---

## 二、部署到服务器电脑（正式使用）

1. 选一台日常常开的电脑（旧笔记本也行）。安装 **Node.js 22 LTS**（一路下一步）。
2. 把整个 `sales-app` 文件夹复制过去，例如 `D:\sales-app`。
3. **直接双击 `start.bat` 启动即可**——因为依赖已随包内置，无需 `npm install`。
   （只有当你换了非 Node 22 的版本、且驱动不兼容时，才需要联网执行一次 `npm rebuild better-sqlite3`。）
4. 查询本机 IP：命令行执行 `ipconfig`，记下 IPv4 地址（如 `192.168.1.10`）。
5. 登录路由器管理页，把该 IP 与这台电脑的网卡 MAC 做静态绑定（DHCP 静态分配），防止 IP 变动。
6. Windows 防火墙 → 高级设置 → 入站规则 → 新建端口规则：**TCP 3000，允许连接**。
7. 团队所有设备连同一 WiFi，浏览器访问 `http://192.168.1.10:3000`（手机可"添加到主屏幕"）。

> 提示：本包是 **Windows 专属**（原生驱动按 Windows 编译）。如需在 Linux / macOS 服务器上跑，
> 请在那台机器上执行 `npm install` 重新编译依赖。

---

## 三、长期稳定运行（开机自启，推荐）

最简单：把 `start.bat` 的快捷方式放进「启动」文件夹（`shell:startup`），开机自动运行。

命令行方式（PM2，可选）：

```bash
npm install -g pm2
pm2 start server.js --name sales
pm2 save
pm2 startup      # 按提示执行生成的命令，实现开机自启
```

常用：`pm2 status` 看状态、`pm2 restart sales` 重启、`pm2 logs sales` 看日志。

---

## 四、修改口令（所有账户）

- **方式一（推荐，页面内）**：登录后点击右上角「修改口令」，输入原口令与新口令即可。每个销售员、管理员均可自行修改自己的口令。
- **方式二（仅管理员初始口令）**：编辑 `server.js` 中 `ADMIN_PASSWORD` 的默认值，或启动前设置环境变量
  ```bash
  # Windows CMD
  set ADMIN_PASSWORD=你的新口令 && node server.js

  # Windows PowerShell
  $env:ADMIN_PASSWORD="你的新口令"; node server.js
  ```
  > 注意：`ADMIN_PASSWORD` 仅用于设定「管理员」账户**首次启动时的初始口令**；已存在的账户请直接用页面内的「修改口令」。销售员的初始口令固定为 `admin` + 序号，无法用该环境变量修改，请在页面内改。

新增销售员时，系统会自动为其分配默认口令 `admin` + 序号（如第 4 个账户为 `admin4`），请告知对方登录后尽快修改。

---

## 五、数据备份（很重要）

数据库就是 `sales.db` 一个文件，备份 = 复制它：

1. 页面操作：管理员登录 → 基础数据页 →「立即下载备份文件」；
2. 手动复制：把 `sales.db` 拷贝到 `D:\sales-backup\` 并加日期后缀；
3. 自动备份（Windows 任务计划程序，每日 22:00 示例）：
   ```bat
   xcopy /y "D:\sales-app\sales.db" "D:\sales-backup\sales-%date:~0,4%%date:~5,2%%date:~8,2%.db"
   ```

建议每周再拷一份到 U 盘 / 其它电脑，防止服务器硬盘故障。

---

## 六、端口被占用 / 换端口

默认端口 3000。想换端口：

```bash
set PORT=3001 && node server.js
# 或 PowerShell： $env:PORT=3001; node server.js
```

访问地址相应改为 `:3001`。

---

## 七、常见问题

| 问题 | 解决办法 |
|------|----------|
| 双击 `start.bat` 提示 `No compatible Node.js 22 found` | 内置数据库驱动需 **Node.js 22**。请安装 Node.js 22 LTS 到 `C:\nodejs\node.exe`（官网下载，一路下一步），或在当前目录执行 `npm rebuild better-sqlite3` 按你已有的 Node 重新编译驱动 |
| 启动报错"端口 3000 已被占用" | 关掉占用 3000 的程序，或换端口（见上） |
| 手机 / 别的电脑打不开 | 确认连的是同一个 WiFi；确认服务器防火墙放行了 3000 端口；确认访问的是启动打印的内网 IP |
| 重启路由器后地址失效 | 在路由器里做 IP 与 MAC 静态绑定 |
| 想彻底清空重来 | 停止服务 → 删除 `sales.db`（及 `sales.db-shm` / `sales.db-wal`）→ 重启，自动重建空库和默认管理员 |

---

## 八、功能清单

- **今日看板**：今日销售额、单数、销量最高商品、近 7 日走势图、最近 5 笔记录
- **记一笔**：商品（带联想和默认单价）、单价、数量、总价自动算、销售时间（默认当前，可补录）、客户（联想）、销售员（下拉）、备注
- **记录列表**：按日期范围 / 销售员 / 客户 / 商品筛选，分页，编辑，管理员删除，一键导出 CSV（Excel 可直接打开）
- **统计报表**：按日 / 按销售员 / 按商品汇总，自定义区间，含占比
- **基础数据（管理员）**：商品、客户、销售员档案管理（可停用 / 启用），数据库备份下载
- **权限**：销售员（记账 / 查看）；管理员（额外可删除、导出管理、档案管理，需口令）

首次启动会自动写入若干条演示数据，帮助查看效果，可随时删除。

---

## 九、文件结构

```
sales-app/
├── server.js            # 后端服务（API + SQLite + 登录态）
├── package.json         # 项目与依赖清单
├── start.bat            # Windows 一键启动（双击即用）
├── README.md            # 本说明
├── 开发文档.md           # 架构 / API / 数据库表结构
├── node_modules/        # 依赖（已内置，免 npm install）
├── public/              # 前端页面（改完刷新即生效，无需构建）
│   ├── index.html
│   ├── style.css
│   └── app.js
└── sales.db             # SQLite 数据库（首次启动自动生成；本包未预置，启动后新建）
```
