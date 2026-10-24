/**
 * 内网销售记录系统 - 后端服务
 * Node.js + Express + better-sqlite3
 * 启动：node server.js  （默认端口 3000，监听 0.0.0.0 供局域网访问）
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const Database = require('better-sqlite3');

// ---------- 配置 ----------
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'sales.db');
// 管理员口令：默认 admin1，可通过环境变量 ADMIN_PASSWORD 修改
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1';

// ---------- 数据库初始化 ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // 提升读写并发
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sales_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT    NOT NULL,
  unit_price   REAL    NOT NULL CHECK (unit_price >= 0),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  total_price  REAL    NOT NULL CHECK (total_price >= 0),
  cost_price   REAL    NOT NULL DEFAULT 0,
  total_cost   REAL    NOT NULL DEFAULT 0,
  sold_at      TEXT    NOT NULL,
  customer     TEXT    NOT NULL DEFAULT '',
  salesperson  TEXT    NOT NULL,
  remark       TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_sold_at     ON sales_records(sold_at);
CREATE INDEX IF NOT EXISTS idx_records_salesperson ON sales_records(salesperson);
CREATE INDEX IF NOT EXISTS idx_records_customer    ON sales_records(customer);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  default_price REAL,
  default_cost  REAL,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  phone     TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS salespersons (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  password  TEXT,
  is_admin  INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
`);

// 兼容旧库：为 salespersons 增加 password 列（已存在则跳过）
try {
  const spCols = db.prepare("PRAGMA table_info(salespersons)").all().map((c) => c.name);
  if (!spCols.includes('password')) db.exec('ALTER TABLE salespersons ADD COLUMN password TEXT');
} catch (e) { /* ignore */ }

// 兼容旧库：为 sales_records 增加成本相关列（已存在则跳过）
try {
  const recCols = db.prepare('PRAGMA table_info(sales_records)').all().map((c) => c.name);
  if (!recCols.includes('cost_price')) db.exec('ALTER TABLE sales_records ADD COLUMN cost_price REAL NOT NULL DEFAULT 0');
  if (!recCols.includes('total_cost')) db.exec('ALTER TABLE sales_records ADD COLUMN total_cost REAL NOT NULL DEFAULT 0');
} catch (e) { /* ignore */ }

// 兼容旧库：为 products 增加默认成本价列（已存在则跳过）
try {
  const prodCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!prodCols.includes('default_cost')) db.exec('ALTER TABLE products ADD COLUMN default_cost REAL');
} catch (e) { /* ignore */ }

// 默认管理员（首次启动时写入，之后不会重复）；口令初始为 ADMIN_PASSWORD（默认 admin1）
db.prepare(`INSERT OR IGNORE INTO salespersons (name, is_admin, password) VALUES ('管理员', 1, ?)`).run(ADMIN_PASSWORD);

// 首次启动插入演示数据（可在页面上直接删除，或删除 sales.db 后重启清空）
const recordCount = db.prepare('SELECT COUNT(*) AS c FROM sales_records').get().c;
if (recordCount === 0 && process.env.NO_SEED !== '1') {
  const seed = db.prepare(`INSERT INTO sales_records
    (product_name, unit_price, quantity, total_price, cost_price, total_cost, sold_at, customer, salesperson, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const demo = [
    ['蓝牙耳机 Pro', 299, 2, 180, '2026-10-18 10:12:00', '李经理', '小王', '已开发票'],
    ['手机支架', 19.9, 5, 8, '2026-10-18 15:40:00', '', '小李', ''],
    ['充电套装', 89, 3, 55, '2026-10-19 09:25:00', '张阿姨', '小王', '周五送货'],
    ['保温杯 500ml', 69, 1, 32, '2026-10-19 14:05:00', '王总', '小李', '公司采购'],
    ['机械键盘', 359, 1, 230, '2026-10-20 09:48:00', '李经理', '小王', ''],
    ['蓝牙耳机 Pro', 299, 1, 180, '2026-10-20 11:30:00', '', '小李', '补货一台'],
  ];
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      const up = r[1], q = r[2], cp = r[3];
      seed.run(r[0], up, q, Math.round(up * q * 100) / 100, cp, Math.round(cp * q * 100) / 100, r[4], r[5], r[6], r[7]);
    }
  });
  insertMany(demo);
  db.prepare(`INSERT OR IGNORE INTO products (name, default_price, default_cost) VALUES ('蓝牙耳机 Pro', 299, 180),('手机支架', 19.9, 8),('充电套装', 89, 55),('保温杯 500ml', 69, 32),('机械键盘', 359, 230)`).run();
  db.prepare(`INSERT OR IGNORE INTO customers (name) VALUES ('李经理'),('张阿姨'),('王总')`).run();
  db.prepare(`INSERT OR IGNORE INTO salespersons (name, is_admin) VALUES ('小王', 0),('小李', 0)`).run();
  console.log('[seed] 已写入 6 条演示数据（可在页面中删除，或设置 NO_SEED=1 后删库重启）');
}

// 为所有尚未设置口令的账户补上默认口令 admin{id}（兼容升级旧库 / 演示数据）
// 管理员账户已在上面写入 ADMIN_PASSWORD；其余账户按自增 id 生成 admin1 / admin2 ...
{
  const needPw = db.prepare("SELECT id FROM salespersons WHERE password IS NULL OR password = ''").all();
  const setPw = db.prepare('UPDATE salespersons SET password = ? WHERE id = ?');
  for (const r of needPw) setPw.run('admin' + r.id, r.id);
}

// ---------- 工具函数 ----------
function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function ok(res, data) { res.json({ code: 0, data }); }
function fail(res, message, code = 40001) { res.status(200).json({ code, message }); }
function round2(n) { return Math.round(n * 100) / 100; }
function padBom(s) { return '\uFEFF' + s; }

// ---------- 登录态（内存 token） ----------
const tokens = new Map(); // token -> { name, role, loginAt }
function makeToken(name, role) {
  const token = crypto.randomBytes(16).toString('hex');
  tokens.set(token, { name, role, loginAt: Date.now() });
  return token;
}
function currentUser(req) {
  const token = req.headers['x-token'] || '';
  return tokens.get(token) || null;
}
function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) { fail(res, '请先登录', 40100); return null; }
  return u;
}
function requireAdmin(req, res) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (u.role !== 'admin') { fail(res, '需要管理员权限', 40300); return null; }
  return u;
}
// 启用中的管理员数量（用于防止把最后一名管理员停用/删除后无法再管理）
function activeAdminCount() {
  return db.prepare('SELECT COUNT(*) AS c FROM salespersons WHERE is_admin = 1 AND is_active = 1').get().c;
}

// ---------- 应用 ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ================= 登录 =================
app.get('/api/session', (req, res) => {
  const u = currentUser(req);
  ok(res, u ? { name: u.name, role: u.role } : null);
});

// 登录前获取销售员列表（仅姓名，供选择身份）
app.get('/api/login/users', (req, res) => {
  ok(res, db.prepare('SELECT name, is_admin FROM salespersons WHERE is_active = 1 ORDER BY id').all());
});

app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  if (!name) return fail(res, '请选择登录人');
  const sp = db.prepare('SELECT * FROM salespersons WHERE name = ? AND is_active = 1').get(name);
  if (!sp) return fail(res, '该账户不存在或已停用');
  if (!password || password !== sp.password) return fail(res, '口令不正确');
  const role = sp.is_admin ? 'admin' : 'sales';
  ok(res, { token: makeToken(sp.name, role), name: sp.name, role });
});

// ================= 销售记录 =================
// 新增
app.post('/api/records', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const b = req.body || {};
  const product_name = String(b.product_name || '').trim();
  const unit_price = Number(b.unit_price);
  const quantity = Number(b.quantity);
  // 成本价：可不填，默认 0（表示无成本 / 赠品等）
  const cost_price = b.cost_price === undefined || b.cost_price === null || b.cost_price === '' ? 0 : Number(b.cost_price);
  const sold_at = String(b.sold_at || '').trim() || nowStr();
  const customer = String(b.customer || '').trim();
  // 销售员只能给自己记账；管理员可在下拉中选择任意销售员（默认自己）
  const salesperson = user.role === 'admin' ? (String(b.salesperson || '').trim() || user.name) : user.name;
  const remark = String(b.remark || '').trim();

  if (!product_name) return fail(res, '请填写商品名称');
  if (!(unit_price > 0)) return fail(res, '单价必须大于 0');
  if (!(cost_price >= 0)) return fail(res, '成本价不能为负数');
  if (!Number.isInteger(quantity) || quantity <= 0) return fail(res, '数量必须是大于 0 的整数');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(sold_at)) return fail(res, '销售时间格式应为 YYYY-MM-DD HH:MM');
  if (!salesperson) return fail(res, '请填写销售员');

  const total_price = round2(unit_price * quantity);
  const total_cost = round2(cost_price * quantity);
  const info = db.prepare(`INSERT INTO sales_records
    (product_name, unit_price, quantity, total_price, cost_price, total_cost, sold_at, customer, salesperson, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(product_name, round2(unit_price), quantity, total_price, round2(cost_price), total_cost, sold_at.length === 16 ? sold_at + ':00' : sold_at, customer, salesperson, remark);
  ok(res, { id: info.lastInsertRowid, total_price, total_cost, net_profit: round2(total_price - total_cost) });
});

// 列表（筛选 + 分页）
app.get('/api/records', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const { from = '', to = '', salesperson = '', customer = '', keyword = '' } = req.query;
  let page = parseInt(req.query.page, 10); if (!(page >= 1)) page = 1;
  let page_size = parseInt(req.query.page_size, 10); if (!(page_size >= 1 && page_size <= 200)) page_size = 20;

  const where = ['1=1']; const args = [];
  if (from) { where.push('date(sold_at) >= date(?)'); args.push(from); }
  if (to) { where.push('date(sold_at) <= date(?)'); args.push(to); }
  if (user.role === 'admin') {
    if (salesperson) { where.push('salesperson = ?'); args.push(salesperson); }
  } else {
    // 销售员只能看自己的记录
    where.push('salesperson = ?'); args.push(user.name);
  }
  if (customer) { where.push('customer = ?'); args.push(customer); }
  if (keyword) { where.push('product_name LIKE ?'); args.push(`%${keyword}%`); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS c FROM sales_records ${whereSql}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM sales_records ${whereSql} ORDER BY sold_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, page_size, (page - 1) * page_size);
  ok(res, { total, page, page_size, list: rows });
});

// 单条详情
app.get('/api/records/:id', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const row = db.prepare('SELECT * FROM sales_records WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '记录不存在', 40400);
  // 销售员只能查看本人录入的记录；管理员可查看全部
  if (user.role !== 'admin' && row.salesperson !== user.name) return fail(res, '只能查看本人录入的记录', 40300);
  ok(res, row);
});

// 修改
app.put('/api/records/:id', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const row = db.prepare('SELECT * FROM sales_records WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '记录不存在', 40400);
  if (user.role !== 'admin' && row.salesperson !== user.name) return fail(res, '只能修改本人录入的记录', 40300);

  const b = req.body || {};
  const product_name = String(b.product_name ?? row.product_name).trim();
  const unit_price = b.unit_price === undefined ? row.unit_price : Number(b.unit_price);
  const quantity = b.quantity === undefined ? row.quantity : Number(b.quantity);
  const cost_price = b.cost_price === undefined ? row.cost_price : Number(b.cost_price);
  const sold_at = String(b.sold_at ?? row.sold_at).trim();
  const customer = String(b.customer ?? row.customer).trim();
  // 销售员改单时不能把记录改归属到他人名下（强制为本人）；管理员可自由指定
  const salesperson = user.role === 'admin'
    ? (String(b.salesperson ?? row.salesperson).trim() || row.salesperson)
    : user.name;
  const remark = String(b.remark ?? row.remark).trim();

  if (!product_name) return fail(res, '请填写商品名称');
  if (!(unit_price > 0)) return fail(res, '单价必须大于 0');
  if (!(cost_price >= 0)) return fail(res, '成本价不能为负数');
  if (!Number.isInteger(quantity) || quantity <= 0) return fail(res, '数量必须是大于 0 的整数');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(sold_at)) return fail(res, '销售时间格式应为 YYYY-MM-DD HH:MM');
  if (!salesperson) return fail(res, '请填写销售员');

  const total_price = round2(unit_price * quantity);
  const total_cost = round2(cost_price * quantity);
  db.prepare(`UPDATE sales_records SET product_name=?, unit_price=?, quantity=?, total_price=?, cost_price=?, total_cost=?,
    sold_at=?, customer=?, salesperson=?, remark=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(product_name, round2(unit_price), quantity, total_price, round2(cost_price), total_cost, sold_at.length === 16 ? sold_at + ':00' : sold_at, customer, salesperson, remark, row.id);
  ok(res, { id: row.id, total_price, total_cost, net_profit: round2(total_price - total_cost) });
});

// 删除（管理员）
app.delete('/api/records/:id', (req, res) => {
  const user = requireAdmin(req, res); if (!user) return;
  const info = db.prepare('DELETE FROM sales_records WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return fail(res, '记录不存在', 40400);
  ok(res, { deleted: true });
});

// ================= 统计 =================
// 今日看板
app.get('/api/stats/daily', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const date = String(req.query.date || '').trim() || nowStr().slice(0, 10);
  const where = ['date(sold_at) = date(?)'];
  const whereArgs = [date];
  // 管理员看全部销售员；销售员只看自己
  if (user.role !== 'admin') { where.push('salesperson = ?'); whereArgs.push(user.name); }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const base = db.prepare(`SELECT COUNT(*) AS order_count, COALESCE(SUM(total_price),0) AS total_amount,
    COALESCE(SUM(total_cost),0) AS total_cost
    FROM sales_records ${whereSql}`).get(...whereArgs);
  const top = db.prepare(`SELECT product_name, SUM(quantity) AS qty FROM sales_records
    ${whereSql} GROUP BY product_name ORDER BY qty DESC LIMIT 1`).get(...whereArgs);
  ok(res, { date, total_amount: round2(base.total_amount), total_cost: round2(base.total_cost), net_profit: round2(base.total_amount - base.total_cost), order_count: base.order_count, top_product: top ? top.product_name : null });
});

// 近 N 天走势（看板柱状图）
app.get('/api/stats/trend', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 2), 60);
  const scope = user.role === 'admin' ? '' : ' AND salesperson = ?';
  const scopeArgs = user.role === 'admin' ? [] : [user.name];
  const rows = db.prepare(`SELECT date(sold_at) AS d, COUNT(*) AS order_count, COALESCE(SUM(total_price),0) AS amount,
    COALESCE(SUM(total_cost),0) AS cost, COALESCE(SUM(total_price - total_cost),0) AS profit
    FROM sales_records WHERE date(sold_at) >= date('now','localtime', ?)${scope}
    GROUP BY date(sold_at) ORDER BY d`).all(`-${days - 1} days`, ...scopeArgs);
  // 补齐无数据的日期
  const map = new Map(rows.map(r => [r.d, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const p = (n) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const r = map.get(key);
    out.push({ date: key, amount: r ? round2(r.amount) : 0, cost: r ? round2(r.cost) : 0, profit: r ? round2(r.profit) : 0, order_count: r ? r.order_count : 0 });
  }
  ok(res, out);
});

// 区间汇总（按日 / 销售员 / 商品）
app.get('/api/stats/summary', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const group_by = ['day', 'person', 'product'].includes(req.query.group_by) ? req.query.group_by : 'day';
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!from || !to) return fail(res, '请选择开始和结束日期');

  const colMap = { day: 'date(sold_at)', person: 'salesperson', product: 'product_name' };
  const col = colMap[group_by];
  const where = ['date(sold_at) >= date(?)', 'date(sold_at) <= date(?)'];
  const args = [from, to];
  if (user.role === 'admin') {
    if (req.query.salesperson) { where.push('salesperson = ?'); args.push(req.query.salesperson); }
  } else {
    // 销售员只能汇总自己的数据
    where.push('salesperson = ?'); args.push(user.name);
  }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const rows = db.prepare(`SELECT ${col} AS name, COUNT(*) AS order_count,
    COALESCE(SUM(total_price),0) AS amount, COALESCE(SUM(total_cost),0) AS cost,
    COALESCE(SUM(total_price - total_cost),0) AS profit FROM sales_records ${whereSql}
    GROUP BY ${col} ORDER BY amount DESC`).all(...args);
  const total_amount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const total_cost = round2(rows.reduce((s, r) => s + r.cost, 0));
  const total_profit = round2(total_amount - total_cost);
  const total_count = rows.reduce((s, r) => s + r.order_count, 0);
  ok(res, { group_by, from, to, total_amount, total_cost, total_profit, total_count, list: rows.map(r => ({ ...r, amount: round2(r.amount), cost: round2(r.cost), profit: round2(r.profit) })) });
});

// ================= 导出 CSV =================
app.get('/api/export', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const { from = '', to = '', salesperson = '', customer = '', keyword = '' } = req.query;
  const where = ['1=1']; const args = [];
  if (from) { where.push('date(sold_at) >= date(?)'); args.push(from); }
  if (to) { where.push('date(sold_at) <= date(?)'); args.push(to); }
  if (user.role === 'admin') {
    if (salesperson) { where.push('salesperson = ?'); args.push(salesperson); }
  } else {
    // 销售员只能导出自己的记录
    where.push('salesperson = ?'); args.push(user.name);
  }
  if (customer) { where.push('customer = ?'); args.push(customer); }
  if (keyword) { where.push('product_name LIKE ?'); args.push(`%${keyword}%`); }
  const rows = db.prepare(`SELECT * FROM sales_records WHERE ${where.join(' AND ')} ORDER BY sold_at ASC, id ASC`).all(...args);

  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const header = ['ID', '商品名称', '单价(元)', '数量', '总价(元)', '成本价(元)', '成本(元)', '净利润(元)', '销售时间', '客户', '销售员', '备注', '录入时间'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push([r.id, r.product_name, r.unit_price, r.quantity, r.total_price, r.cost_price, r.total_cost, round2(r.total_price - r.total_cost), r.sold_at, r.customer, r.salesperson, r.remark, r.created_at].map(esc).join(','));
  const filename = `sales_export_${nowStr().slice(0, 10).replace(/-/g, '')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(padBom(lines.join('\r\n')));
});

// ================= 基础数据（档案） =================
// cols 仅包含除 name 外的扩展列（name 由各路由单独拼接）
const archiveTables = {
  products: { name: '商品', cols: ['default_price', 'default_cost'] },
  customers: { name: '客户', cols: ['phone'] },
  salespersons: { name: '销售员', cols: ['is_admin'] },
};

// 删除档案后，将剩余记录 id 重新连续编号 1,2,3...，避免自增序列留下空洞
// 记录表按 name 关联基础数据，重排 id 不影响任何业务引用
function resequenceArchive(table) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  const ph = cols.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`);
  const tx = db.transaction(() => {
    db.exec(`DELETE FROM ${table}`);
    rows.forEach((row, i) => {
      const next = { ...row, id: i + 1 };
      // 销售员的默认口令规则是 admin+序号，编号变化后同步，避免多人撞到同一口令
      if (table === 'salespersons' && row.password === 'admin' + row.id) next.password = 'admin' + (i + 1);
      stmt.run(cols.map((c) => next[c]));
    });
  });
  tx();
  // 重置自增序列（sqlite_sequence 是内部表，无主键约束，不能用 ON CONFLICT，需手动 upsert）
  const seq = rows.length;
  const hasSeq = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table);
  if (hasSeq) db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(seq, table);
  else db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, seq);
}

// 启动时修复历史遗留：若档案表存在编号空洞（删除后未重排，或自增序列残留），重建为连续编号 1..n
// 这样「删除后再新增」拿到的 ID 一定是连续的下一个，不会跳号
function normalizeArchiveIds() {
  for (const table of Object.keys(archiveTables)) {
    const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    const maxId = db.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`).get().m;
    const seqRow = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table);
    const seq = seqRow ? seqRow.seq : 0;
    if (count !== maxId || seq !== count) {
      resequenceArchive(table);
      console.log(`[fix] ${table} 编号已重排为 1..${count}`);
    }
  }
}
normalizeArchiveIds();

for (const [table, meta] of Object.entries(archiveTables)) {
  // 列表（登录即可）
  app.get(`/api/${table}`, (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    // 口令不能下发给前端（销售员也能调用本接口，否则可读到所有人的口令）
    if (table === 'salespersons') rows.forEach((r) => { delete r.password; });
    ok(res, rows);
  });
  // 新增（管理员）
  app.post(`/api/${table}`, (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return fail(res, `请填写${meta.name}名称`);
    try {
      const extra = table === 'products'
        ? [b.default_price === '' || b.default_price == null ? null : Number(b.default_price),
           b.default_cost === '' || b.default_cost == null ? null : Number(b.default_cost)]
        : table === 'customers' ? [String(b.phone || '').trim()]
        : [b.is_admin ? 1 : 0];
      const info = db.prepare(`INSERT INTO ${table} (name, ${meta.cols.join(', ')}) VALUES (?, ${meta.cols.map(() => '?').join(', ')})`).run(name, ...extra);
      let default_password = null;
      if (table === 'salespersons') {
        default_password = 'admin' + info.lastInsertRowid;
        db.prepare('UPDATE salespersons SET password = ? WHERE id = ?').run(default_password, info.lastInsertRowid);
      }
      ok(res, { id: info.lastInsertRowid, default_password });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return fail(res, `${meta.name}「${name}」已存在`);
      throw e;
    }
  });
  // 修改（管理员）
  app.put(`/api/${table}/:id`, (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return fail(res, `请填写${meta.name}名称`);
    const old = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!old) return fail(res, '记录不存在', 40400);
    try {
      const extra = table === 'products'
        ? [b.default_price === '' || b.default_price == null ? null : Number(b.default_price),
           b.default_cost === '' || b.default_cost == null ? null : Number(b.default_cost)]
        : table === 'customers' ? [String(b.phone || '').trim()]
        : [b.is_admin ? 1 : 0];
      const info = db.prepare(`UPDATE ${table} SET name = ?, ${meta.cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`).run(name, ...extra, req.params.id);
      if (info.changes === 0) return fail(res, '记录不存在', 40400);
      // 销售记录按「名称」关联档案，改名后同步更新历史记录里的名称，否则旧记录会与档案失去关联
      if (old.name !== name) {
        const col = table === 'products' ? 'product_name' : table === 'customers' ? 'customer' : 'salesperson';
        db.prepare(`UPDATE sales_records SET ${col} = ? WHERE ${col} = ?`).run(name, old.name);
        // 若被改名的正是已登录账号，其 token 里的姓名已失效，强制重新登录（否则会看到空数据）
        if (table === 'salespersons') {
          for (const [tk, v] of tokens) if (v.name === old.name) tokens.delete(tk);
        }
      }
      ok(res, { updated: true });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return fail(res, `${meta.name}「${name}」已存在`);
      throw e;
    }
  });
  // 停用/启用 + 删除（管理员）
  app.post(`/api/${table}/:id/toggle`, (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return fail(res, '记录不存在', 40400);
    // 不能停用最后一名启用中的管理员，否则将无人可管理
    if (table === 'salespersons' && row.is_admin && row.is_active && activeAdminCount() <= 1) {
      return fail(res, '至少需保留一名启用中的管理员，无法停用');
    }
    db.prepare(`UPDATE ${table} SET is_active = ? WHERE id = ?`).run(row.is_active ? 0 : 1, row.id);
    ok(res, { is_active: row.is_active ? 0 : 1 });
  });
  app.delete(`/api/${table}/:id`, (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    if (table === 'salespersons') {
      const sp = db.prepare('SELECT * FROM salespersons WHERE id = ?').get(req.params.id);
      if (sp && sp.is_admin && sp.is_active && activeAdminCount() <= 1) {
        return fail(res, '至少需保留一名启用中的管理员，无法删除');
      }
      const used = db.prepare('SELECT COUNT(*) AS c FROM sales_records WHERE salesperson = (SELECT name FROM salespersons WHERE id = ?)').get(req.params.id).c;
      if (used > 0) return fail(res, `该销售员名下还有 ${used} 条记录，不能删除（可停用）`);
    }
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return fail(res, '记录不存在', 40400);
    resequenceArchive(table);
    ok(res, { deleted: true });
  });
}

// 备份接口（管理员）：直接下载当前数据库文件副本
app.get('/api/admin/backup', (req, res) => {
  const user = requireAdmin(req, res); if (!user) return;
  // WAL 模式下最新写入可能还在 -wal 文件中，先把日志合并回主库，保证备份包含全部数据
  db.pragma('wal_checkpoint(TRUNCATE)');
  const stamp = nowStr().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="sales-backup-${stamp}.db"`);
  fs.createReadStream(DB_PATH).pipe(res);
});

// 修改自己的口令（登录即可，不能改他人）
app.put('/api/me/password', (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const b = req.body || {};
  const oldP = String(b.old_password || '');
  const newP = String(b.new_password || '');
  if (newP.length < 4) return fail(res, '新口令至少 4 位');
  const sp = db.prepare('SELECT * FROM salespersons WHERE name = ?').get(user.name);
  if (!sp) return fail(res, '账户不存在', 40400);
  if (!sp.password || oldP !== sp.password) return fail(res, '原口令不正确');
  db.prepare('UPDATE salespersons SET password = ? WHERE id = ?').run(newP, sp.id);
  ok(res, { changed: true });
});

// 404 与错误处理
app.use('/api', (req, res) => fail(res, '接口不存在', 40400));
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  fail(res, '服务器内部错误：' + err.message, 50000);
});

// ---------- 启动 ----------
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const it of ifaces[name] || []) {
      if (it.family === 'IPv4' && !it.internal) ips.push(it.address);
    }
  }
  console.log('========================================');
  console.log(' 内网销售记录系统已启动');
  console.log(` 本机访问:   http://127.0.0.1:${PORT}`);
  for (const ip of ips) console.log(` 局域网访问: http://${ip}:${PORT}`);
  console.log(` 管理员初始口令: ${ADMIN_PASSWORD}（登录后可在右上角修改；销售员默认口令为 admin+序号）`);
  console.log('========================================');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。请先停止占用该端口的程序，或设置 PORT=其他端口 后重试。`);
    process.exit(1);
  }
  throw e;
});
