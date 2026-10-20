/* ===== 工具 ===== */
const $ = (sel) => document.querySelector(sel);
const view = $('#view');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nowLocal() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toApiTime(localDT) {
  if (!localDT) return '';
  let s = localDT.replace('T', ' ');
  if (s.length === 16) s += ':00';
  return s;
}
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 2200);
}
function openModal(html) { $('#modalBox').innerHTML = html; $('#modalMask').classList.add('show'); }
function closeModal() { $('#modalMask').classList.remove('show'); }

/* ===== 登录态 ===== */
let TOKEN = localStorage.getItem('sales_token') || '';
let USER = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-token': TOKEN },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({ code: 50000, message: '响应解析失败' }));
  if (data.code === 40100) { logout(); throw new Error('登录已过期，请重新登录'); }
  if (data.code !== 0) throw new Error(data.message || '请求失败');
  return data.data;
}

function logout() {
  localStorage.removeItem('sales_token'); TOKEN = ''; USER = null;
  $('#loginMask').classList.add('show');
}

async function initLogin() {
  try {
    USER = await api('/api/session');
  } catch (e) { USER = null; }
  if (USER) {
    $('#loginMask').classList.remove('show');
    renderUserBox();
  } else {
    TOKEN = ''; localStorage.removeItem('sales_token');
    $('#loginMask').classList.add('show');
    loadLoginList();
  }
}

async function loadLoginList() {
  // 登录前用一次性公共列表接口获取销售员（下面单独提供）
  let list = [];
  try {
    const res = await fetch('/api/login/users');
    list = (await res.json()).data || [];
  } catch (e) { /* ignore */ }
  $('#loginUser').innerHTML = list.map((s) =>
    `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.is_admin ? '（管理员）' : ''}</option>`
  ).join('');
}
async function doLogin() {
  const name = $('#loginUser').value;
  if (!name) { $('#loginErr').textContent = '暂无可登录的账号'; return; }
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { name, password: $('#loginPwdInput').value },
    });
    TOKEN = data.token; USER = { name: data.name, role: data.role };
    localStorage.setItem('sales_token', TOKEN);
    $('#loginMask').classList.remove('show');
    $('#loginPwdInput').value = '';
    $('#loginErr').textContent = '';
    renderUserBox(); route();
    toast(`欢迎，${USER.name}`, 'success');
  } catch (e) { $('#loginErr').textContent = e.message; }
}
function forgotPwd() {
  toast('请联系管理员重置密码', '');
}
// 登录面板内按回车直接登录
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && $('#loginMask').classList.contains('show')) doLogin();
});
function renderUserBox() {
  const box = $('#userbox');
  if (!USER) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="avatar" onclick="toggleUserMenu(event)" title="点击展开菜单">${escapeHtml((USER.name || '?').slice(0, 1))}</span>
    <span class="uname">${escapeHtml(USER.name)}</span>
    <span class="role-tag">${USER.role === 'admin' ? '管理员' : '销售员'}</span>
    <button class="btn btn-sm" onclick="openChangePw()">修改口令</button>
    <button class="btn btn-sm" onclick="logout()">退出</button>
    <div class="user-menu" id="userMenu" hidden>
      <div class="um-head"><span class="um-name">${escapeHtml(USER.name)}</span><span class="um-role">${USER.role === 'admin' ? '管理员' : '销售员'}</span></div>
      <button class="um-item" onclick="openChangePw()">修改口令</button>
      <button class="um-item" onclick="logout()">退出</button>
    </div>`;
  document.querySelectorAll('.admin-only').forEach((el) => el.style.display = USER.role === 'admin' ? '' : 'none');
}
function toggleUserMenu(e) {
  e.stopPropagation();
  const m = $('#userMenu');
  if (m) m.hidden = !m.hidden;
}
function closeUserMenu() {
  const m = $('#userMenu');
  if (m) m.hidden = true;
}
function toggleNav(e) {
  e.stopPropagation();
  $('#nav').classList.toggle('open');
}
document.addEventListener('click', () => {
  closeUserMenu();
  const nav = $('#nav');
  if (nav) nav.classList.remove('open');
});

/* ===== 修改口令 ===== */
function openChangePw() {
  openModal(`<div class="modal-title">修改口令</div>
    <div class="form-grid">
      <div class="form-item full"><label>原口令</label><input id="pw_old" type="password" placeholder="请输入当前口令" autocomplete="off"></div>
      <div class="form-item full"><label>新口令</label><input id="pw_new" type="password" placeholder="至少 4 位" autocomplete="off"></div>
      <div class="form-item full"><label>确认新口令</label><input id="pw_new2" type="password" placeholder="再次输入新口令" autocomplete="off"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="submitChangePw()">保存</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>`);
}
async function submitChangePw() {
  const oldP = $('#pw_old').value;
  const newP = $('#pw_new').value;
  const newP2 = $('#pw_new2').value;
  if (!oldP) { toast('请输入原口令', 'error'); return; }
  if (newP.length < 4) { toast('新口令至少 4 位', 'error'); return; }
  if (newP !== newP2) { toast('两次输入的新口令不一致', 'error'); return; }
  try {
    await api('/api/me/password', { method: 'PUT', body: { old_password: oldP, new_password: newP } });
    closeModal();
    toast('口令修改成功，下次登录请使用新口令', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ===== 路由 ===== */
const routes = { '/': renderHome, '/new': renderNew, '/records': renderRecords, '/stats': renderStats, '/admin': renderAdmin };
function currentRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  return routes[h] ? h : '/';
}
function route() {
  if (!USER) return;
  const r = currentRoute();
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  Promise.resolve(routes[r]()).catch((e) => {
    view.innerHTML = `<div class="page-title">加载失败</div>
      <div class="card"><div class="empty">${escapeHtml(e.message || '页面加载失败，请重试')}</div></div>`;
  });
}
window.addEventListener('hashchange', route);

/* ===== 页面：今日看板 ===== */
async function renderHome() {
  view.innerHTML = `<div class="page-title">今日看板</div>
    <div class="page-desc" id="homeDate"></div>
    <div class="stat-grid" id="statGrid"><div class="stat-card"><div class="label">加载中…</div></div></div>
    <div class="card">
      <div class="page-title" style="font-size:16px">近 7 日销售额走势</div>
      <div class="chart-box" id="trendChart"></div>
    </div>
    <div class="card">
      <div class="page-title" style="font-size:16px">最近 5 笔记录</div>
      <div class="table-wrap" id="recentTable"></div>
    </div>`;
  const [daily, trend, recent] = await Promise.all([
    api('/api/stats/daily'),
    api('/api/stats/trend?days=7'),
    api('/api/records?page=1&page_size=5'),
  ]);
  $('#homeDate').textContent = `${daily.date}（今天）`;
  $('#statGrid').innerHTML = `
    <div class="stat-card"><div class="label">今日销售额</div><div class="value red">¥ ${fmtMoney(daily.total_amount)}</div><div class="sub">实时累计</div></div>
    <div class="stat-card"><div class="label">今日单数</div><div class="value">${daily.order_count} 笔</div><div class="sub">成功录入的记录数</div></div>
    <div class="stat-card"><div class="label">今日销量最高商品</div><div class="value" style="font-size:20px">${daily.top_product ? escapeHtml(daily.top_product) : '—'}</div><div class="sub">按销售数量</div></div>
    <div class="stat-card"><div class="label">快捷操作</div><div style="margin-top:8px"><button class="btn btn-primary" onclick="location.hash='#/new'">+ 记一笔</button></div><div class="sub">30 秒完成记账</div></div>`;
  const max = Math.max(...trend.map((t) => t.amount), 1);
  $('#trendChart').innerHTML = trend.map((t) => `
    <div class="chart-col">
      <div class="chart-amt">${t.amount ? fmtMoney(t.amount) : ''}</div>
      <div class="chart-bar ${t.amount ? '' : 'zero'}" style="height:${Math.max(t.amount / max * 100, t.amount ? 3 : 2)}%"></div>
      <div class="chart-day">${t.date.slice(5).replace('-', '/')}</div>
    </div>`).join('');
  renderRecentTable(recent);
}
function renderRecentTable(data) {
  $('#recentTable').innerHTML = data.list.length ? `
    <table class="data"><thead><tr><th>时间</th><th>商品</th><th>单价</th><th>数量</th><th>总价</th><th>客户</th><th>销售员</th></tr></thead>
    <tbody>${data.list.map((r) => `<tr>
      <td>${escapeHtml(r.sold_at)}</td><td>${escapeHtml(r.product_name)}</td>
      <td class="num">${fmtMoney(r.unit_price)}</td><td class="num">${r.quantity}</td>
      <td class="amount">¥ ${fmtMoney(r.total_price)}</td><td>${escapeHtml(r.customer) || '—'}</td><td>${escapeHtml(r.salesperson)}</td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty">今天还没有记录，去「记一笔」吧</div>';
}

/* ===== 页面：记一笔 ===== */
let editTargetId = null;
async function renderNew() {
  const editId = editTargetId; editTargetId = null;
  const [productsAll, customersAll, personsAll] = await Promise.all([
    api('/api/products'), api('/api/customers'), api('/api/salespersons'),
  ]);
  // 停用的档案不再出现在输入联想中
  const products = productsAll.filter((p) => p.is_active);
  const customers = customersAll.filter((c) => c.is_active);
  let record = null;
  if (editId) record = await api('/api/records/' + editId);
  const isEdit = !!record;
  // 管理员下拉：只列启用中的销售员；若被编辑记录的原销售员已停用/删除，仍保留该项避免改单时被悄悄改归属
  const persons = personsAll.filter((p) => p.is_active || (record && record.salesperson === p.name));

  view.innerHTML = `<div class="page-title">${isEdit ? '修改记录' : '记一笔'}</div>
    <div class="page-desc">${isEdit ? '修改后将自动重新计算总价' : '商品、单价、数量必填；总价自动计算'}</div>
    <div class="card">
      <form id="recordForm" onsubmit="return submitRecord(event, ${editId || 'null'})">
        <div class="form-grid">
          <div class="form-item">
            <label><span class="req">*</span>商品名称</label>
            <input id="f_product" list="productList" required placeholder="输入或选择商品" value="${escapeHtml(record?.product_name || '')}">
            <datalist id="productList">${products.map((p) => `<option value="${escapeHtml(p.name)}">`).join('')}</datalist>
          </div>
          <div class="form-item">
            <label><span class="req">*</span>单价（元）</label>
            <input id="f_price" type="number" step="0.01" min="0" required placeholder="0.00" value="${record ? record.unit_price : ''}" oninput="calcTotal()">
          </div>
          <div class="form-item">
            <label><span class="req">*</span>数量</label>
            <input id="f_qty" type="number" min="1" step="1" required placeholder="1" value="${record ? record.quantity : 1}" oninput="calcTotal()">
          </div>
          <div class="form-item">
            <label>总价（元，自动计算）</label>
            <div class="total-preview" id="totalPreview">¥ 0.00</div>
          </div>
          <div class="form-item">
            <label><span class="req">*</span>销售时间</label>
            <input id="f_time" type="datetime-local" required value="${record ? record.sold_at.slice(0, 16) : nowLocal()}">
          </div>
          <div class="form-item">
            <label>客户</label>
            <input id="f_customer" list="customerList" placeholder="选填，如：李经理" value="${escapeHtml(record?.customer || '')}">
            <datalist id="customerList">${customers.map((c) => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist>
          </div>
          <div class="form-item">
            <label><span class="req">*</span>销售员</label>
            ${USER.role === 'admin'
              ? `<select id="f_seller">${persons.map((p) => `<option value="${escapeHtml(p.name)}" ${record ? (record.salesperson === p.name ? 'selected' : '') : (USER.name === p.name ? 'selected' : '')}>${escapeHtml(p.name)}</option>`).join('')}</select>`
              : `<div class="total-preview" style="font-size:16px">${escapeHtml(USER.name)}</div>`}
          </div>
          <div class="form-item full">
            <label>备注</label>
            <textarea id="f_remark" rows="2" placeholder="选填，如：已开发票、周五送货">${escapeHtml(record?.remark || '')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '提交记账'}</button>
          <button type="button" class="btn" onclick="location.hash='#/records'">取消</button>
        </div>
      </form>
    </div>`;
  calcTotal();
  // 选择有档案的商品时自动带出默认单价
  $('#f_product').addEventListener('change', function () {
    const p = products.find((x) => x.name === this.value);
    if (p && p.default_price) { $('#f_price').value = p.default_price; calcTotal(); }
  });
}
function calcTotal() {
  const p = parseFloat($('#f_price').value) || 0;
  const q = parseInt($('#f_qty').value) || 0;
  $('#totalPreview').textContent = '¥ ' + fmtMoney(Math.round(p * q * 100) / 100);
}
async function submitRecord(e, id) {
  e.preventDefault();
  const body = {
    product_name: $('#f_product').value.trim(),
    unit_price: parseFloat($('#f_price').value),
    quantity: parseInt($('#f_qty').value),
    sold_at: toApiTime($('#f_time').value),
    customer: $('#f_customer').value.trim(),
    // 销售员界面不显示销售员下拉，此时归属固定为本人
    salesperson: $('#f_seller') ? $('#f_seller').value : USER.name,
    remark: $('#f_remark').value.trim(),
  };
  try {
    const data = id
      ? await api('/api/records/' + id, { method: 'PUT', body })
      : await api('/api/records', { method: 'POST', body });
    toast(id ? '修改成功' : `记账成功，总价 ¥ ${fmtMoney(data.total_price)}`, 'success');
    location.hash = '#/records';
  } catch (err) { toast(err.message, 'error'); }
  return false;
}

/* ===== 页面：记录列表 ===== */
let listState = { page: 1, page_size: 20, from: '', to: '', salesperson: '', customer: '', keyword: '' };
async function renderRecords() {
  const persons = USER.role === 'admin' ? await api('/api/salespersons') : [];
  view.innerHTML = `<div class="page-title">记录列表</div>
    <div class="page-desc">按条件筛选历史记录，可编辑、导出</div>
    <div class="card">
      <div class="filter-bar">
        <div class="form-item"><label>开始日期</label><input type="date" id="q_from"></div>
        <div class="form-item"><label>结束日期</label><input type="date" id="q_to"></div>
        ${USER.role === 'admin' ? `<div class="form-item"><label>销售员</label><select id="q_seller">
          <option value="">全部销售员</option>
          ${persons.map((p) => `<option value="${escapeHtml(p.name)}" ${listState.salesperson === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></div>` : ''}
        <div class="form-item"><label>客户</label><input id="q_customer" placeholder="全部"></div>
        <div class="form-item"><label>商品关键字</label><input id="q_keyword" placeholder="如：耳机"></div>
        <button class="btn btn-primary" onclick="doSearch()">查询</button>
        <button class="btn" onclick="resetSearch()">重置</button>
        <button class="btn" onclick="exportCsv()">导出 CSV</button>
      </div>
      ${USER.role !== 'admin' ? '<div class="page-desc">仅显示您本人录入的记录</div>' : ''}
      <div class="table-wrap" id="listTable"><div class="empty">加载中…</div></div>
      <div class="pager" id="pager"></div>
    </div>`;
  await loadRecords();
}
async function doSearch() {
  listState.from = $('#q_from').value; listState.to = $('#q_to').value;
  listState.salesperson = $('#q_seller') ? $('#q_seller').value.trim() : ''; // 销售员界面无此筛选框
  listState.customer = $('#q_customer').value.trim();
  listState.keyword = $('#q_keyword').value.trim(); listState.page = 1;
  await loadRecords();
}
function resetSearch() {
  listState = { page: 1, page_size: 20, from: '', to: '', salesperson: '', customer: '', keyword: '' };
  renderRecords();
}
function queryString() {
  const p = new URLSearchParams({ page: listState.page, page_size: listState.page_size });
  for (const k of ['from', 'to', 'salesperson', 'customer', 'keyword']) if (listState[k]) p.set(k, listState[k]);
  return p.toString();
}
async function loadRecords() {
  let data;
  try { data = await api('/api/records?' + queryString()); }
  catch (e) { $('#listTable').innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; return; }
  const canDel = USER.role === 'admin';
  $('#listTable').innerHTML = data.list.length ? `
    <table class="data"><thead><tr>
      <th>ID</th><th>销售时间</th><th>商品</th><th>单价</th><th>数量</th><th>总价</th><th>客户</th><th>销售员</th><th>备注</th><th>操作</th>
    </tr></thead><tbody>${data.list.map((r) => `<tr>
      <td>${r.id}</td><td>${escapeHtml(r.sold_at)}</td><td>${escapeHtml(r.product_name)}</td>
      <td class="num">${fmtMoney(r.unit_price)}</td><td class="num">${r.quantity}</td>
      <td class="amount">¥ ${fmtMoney(r.total_price)}</td><td>${escapeHtml(r.customer) || '—'}</td>
      <td>${escapeHtml(r.salesperson)}</td><td>${escapeHtml(r.remark) || '—'}</td>
      <td><div class="ops">
        <button class="btn btn-sm" onclick="editRecord(${r.id})">编辑</button>
        ${canDel ? `<button class="btn btn-sm btn-danger" onclick="deleteRecord(${r.id})">删除</button>` : ''}
      </div></td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty">没有符合条件的记录</div>';
  const pages = Math.max(Math.ceil(data.total / data.page_size), 1);
  $('#pager').innerHTML = `<span>共 ${data.total} 条，第 ${data.page}/${pages} 页</span>
    <div class="pbtns">
      <button ${data.page <= 1 ? 'disabled' : ''} onclick="gotoPage(${data.page - 1})">上一页</button>
      ${pageNums(data.page, pages).map((p) => p === '...' ? '<button disabled>…</button>' :
        `<button class="${p === data.page ? 'cur' : ''}" onclick="gotoPage(${p})">${p}</button>`).join('')}
      <button ${data.page >= pages ? 'disabled' : ''} onclick="gotoPage(${data.page + 1})">下一页</button>
    </div>`;
}
function pageNums(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const s = [1]; const l = Math.max(2, cur - 1), r = Math.min(total - 1, cur + 1);
  if (l > 2) s.push('...');
  for (let i = l; i <= r; i++) s.push(i);
  if (r < total - 1) s.push('...');
  s.push(total); return s;
}
function gotoPage(p) { listState.page = p; loadRecords(); }
function editRecord(id) { editTargetId = id; location.hash = '#/new'; }
async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？删除后不可恢复。')) return;
  try { await api('/api/records/' + id, { method: 'DELETE' }); toast('已删除', 'success'); loadRecords(); }
  catch (e) { toast(e.message, 'error'); }
}
async function exportCsv() {
  try {
    const res = await fetch('/api/export?' + queryString().replace(/page=\d+&?/, '').replace(/&?page_size=\d+/, ''), { headers: { 'x-token': TOKEN } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales_export.csv';
    a.click(); URL.revokeObjectURL(a.href);
    toast('导出成功', 'success');
  } catch (e) { toast('导出失败：' + e.message, 'error'); }
}

/* ===== 页面：统计报表 ===== */
let statsState = { group_by: 'day', from: '', to: '', salesperson: '' };
async function renderStats() {
  const today = new Date(); const p = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  const monthStart = `${today.getFullYear()}-${p(today.getMonth() + 1)}-01`;
  const persons = USER.role === 'admin' ? await api('/api/salespersons') : [];
  view.innerHTML = `<div class="page-title">统计报表</div>
    <div class="page-desc">按日 / 销售员 / 商品维度汇总销售额</div>
    <div class="card">
      <div class="tabs">
        <div class="tab ${statsState.group_by === 'day' ? 'active' : ''}" onclick="setGroup('day')">按日</div>
        <div class="tab ${statsState.group_by === 'person' ? 'active' : ''}" onclick="setGroup('person')">按销售员</div>
        <div class="tab ${statsState.group_by === 'product' ? 'active' : ''}" onclick="setGroup('product')">按商品</div>
      </div>
      <div class="filter-bar">
        <div class="form-item"><label>开始日期</label><input type="date" id="s_from" value="${statsState.from || monthStart}"></div>
        <div class="form-item"><label>结束日期</label><input type="date" id="s_to" value="${statsState.to || todayStr}"></div>
        ${USER.role === 'admin' ? `<div class="form-item"><label>销售员（可选）</label><select id="s_seller">
          <option value="">全部销售员</option>
          ${persons.map((p2) => `<option value="${escapeHtml(p2.name)}" ${statsState.salesperson === p2.name ? 'selected' : ''}>${escapeHtml(p2.name)}</option>`).join('')}
        </select></div>` : ''}
        <button class="btn btn-primary" onclick="loadStats()">汇总</button>
      </div>
      ${USER.role !== 'admin' ? '<div class="page-desc">仅汇总您本人录入的记录</div>' : ''}
      <div id="statsResult"><div class="empty">点击「汇总」生成报表</div></div>
    </div>`;
  if (statsState.auto) { statsState.auto = false; loadStats(); }
}
function setGroup(g) { statsState.group_by = g; statsState.auto = true; renderStats(); }
async function loadStats() {
  const from = $('#s_from').value, to = $('#s_to').value;
  if (!from || !to) { toast('请选择日期区间', 'error'); return; }
  // 销售员界面没有「销售员」筛选框，服务端也会强制只统计本人数据
  const sellerFilter = $('#s_seller') ? $('#s_seller').value.trim() : '';
  statsState.from = from; statsState.to = to; statsState.salesperson = sellerFilter;
  let data;
  try {
    data = await api(`/api/stats/summary?group_by=${statsState.group_by}&from=${from}&to=${to}&salesperson=${encodeURIComponent(sellerFilter)}`);
  } catch (e) {
    $('#statsResult').innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    return;
  }
  const unit = statsState.group_by === 'day' ? '日期' : statsState.group_by === 'person' ? '销售员' : '商品';
  $('#statsResult').innerHTML = data.list.length ? `
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="label">区间总销售额</div><div class="value red">¥ ${fmtMoney(data.total_amount)}</div></div>
      <div class="stat-card"><div class="label">区间总单数</div><div class="value">${data.total_count} 笔</div></div>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr><th>${unit}</th><th>单数</th><th>销售额（元）</th><th>占比</th></tr></thead>
    <tbody>${data.list.map((r) => `<tr>
      <td>${escapeHtml(r.name)}</td><td class="num">${r.order_count}</td>
      <td class="amount">¥ ${fmtMoney(r.amount)}</td>
      <td class="num">${data.total_amount ? (r.amount / data.total_amount * 100).toFixed(1) : 0}%</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty">该区间内没有记录</div>';
}

/* ===== 页面：基础数据 ===== */
let adminTab = 'products';
async function renderAdmin() {
  if (USER.role !== 'admin') { location.hash = '#/'; return; }
  view.innerHTML = `<div class="page-title">基础数据管理</div>
    <div class="page-desc">维护商品、客户、销售员档案；停用后不再出现在「记一笔」下拉中</div>
    <div class="card">
      <div class="tabs">
        <div class="tab ${adminTab === 'products' ? 'active' : ''}" onclick="setAdminTab('products')">商品</div>
        <div class="tab ${adminTab === 'customers' ? 'active' : ''}" onclick="setAdminTab('customers')">客户</div>
        <div class="tab ${adminTab === 'salespersons' ? 'active' : ''}" onclick="setAdminTab('salespersons')">销售员</div>
      </div>
      <div id="adminBody"></div>
    </div>
    <div class="card">
      <div class="page-title" style="font-size:16px">数据备份</div>
      <div class="page-desc">下载当前数据库文件副本，建议每天备份一份并妥善保存</div>
      <button class="btn" onclick="downloadBackup()">立即下载备份文件</button>
    </div>`;
  loadAdminTab();
}
function setAdminTab(t) { adminTab = t; renderAdmin(); }
async function loadAdminTab() {
  let list;
  try { list = await api('/api/' + adminTab); }
  catch (e) { $('#adminBody').innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; return; }
  const isPerson = adminTab === 'salespersons';
  const isProduct = adminTab === 'products';
  const isCustomer = adminTab === 'customers';
  $('#adminBody').innerHTML = `
    <div class="filter-bar">
      <button class="btn btn-primary" onclick="showArchiveModal()">+ 新增</button>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr>
      <th>ID</th><th>名称</th>${isProduct ? '<th>默认单价</th>' : ''}${isCustomer ? '<th>电话</th>' : ''}${isPerson ? '<th>角色</th>' : ''}
      <th>状态</th><th>操作</th>
    </tr></thead><tbody>${list.map((r) => `<tr>
      <td>${r.id}</td><td>${escapeHtml(r.name)}</td>
      ${isProduct ? `<td class="num">${r.default_price == null ? '—' : fmtMoney(r.default_price)}</td>` : ''}
      ${isCustomer ? `<td>${escapeHtml(r.phone) || '—'}</td>` : ''}
      ${isPerson ? `<td>${r.is_admin ? '管理员' : '销售员'}</td>` : ''}
      <td>${r.is_active ? '在用' : '已停用'}</td>
      <td><div class="ops">
        <button class="btn btn-sm" onclick="showArchiveModal(${r.id})">编辑</button>
        <button class="btn btn-sm" onclick="toggleArchive(${r.id})">${r.is_active ? '停用' : '启用'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteArchive(${r.id})">删除</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">暂无数据</td></tr>'}</tbody></table></div>`;
}
function showArchiveModal(id) {
  const isProduct = adminTab === 'products';
  const isPerson = adminTab === 'salespersons';
  const isCustomer = adminTab === 'customers';
  openModal(`<div class="modal-title">${id ? '编辑' : '新增'}${adminTab === 'products' ? '商品' : adminTab === 'customers' ? '客户' : '销售员'}</div>
    <div class="form-grid">
      <div class="form-item full"><label>名称</label><input id="a_name"></div>
      ${isProduct ? '<div class="form-item full"><label>默认单价（元）</label><input id="a_price" type="number" step="0.01" min="0" placeholder="选填"></div>' : ''}
      ${isCustomer ? '<div class="form-item full"><label>电话</label><input id="a_phone" placeholder="选填"></div>' : ''}
      ${isPerson ? `<div class="form-item full"><label>角色</label><select id="a_admin"><option value="0">销售员</option><option value="1">管理员</option></select></div>` : ''}
      ${isPerson && !id ? '<div class="form-item full"><div class="page-desc">新增后默认口令为 admin+序号（如 admin4），对方登录后可在右上角自行修改。</div></div>' : ''}
      ${isPerson ? '<div class="form-item full"><div class="page-desc">修改姓名后，该销售员名下的历史记录会一并更新为新姓名。</div></div>' : ''}
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveArchive(${id || 'null'})">保存</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>`);
  if (id) {
    api('/api/' + adminTab).then((list) => {
      const r = list.find((x) => x.id === id); if (!r) return;
      $('#a_name').value = r.name;
      if (isProduct) $('#a_price').value = r.default_price ?? '';
      if (isCustomer) $('#a_phone').value = r.phone ?? '';
      if (isPerson) $('#a_admin').value = r.is_admin ? '1' : '0';
    }).catch(() => {});
  }
}
async function saveArchive(id) {
  const body = { name: $('#a_name').value.trim() };
  if (adminTab === 'products') body.default_price = $('#a_price').value;
  if (adminTab === 'customers') body.phone = $('#a_phone').value.trim();
  if (adminTab === 'salespersons') body.is_admin = $('#a_admin').value === '1';
  try {
    const data = id ? await api(`/api/${adminTab}/${id}`, { method: 'PUT', body })
                    : await api('/api/' + adminTab, { method: 'POST', body });
    closeModal();
    if (!id && adminTab === 'salespersons' && data.default_password) {
      toast(`已创建，默认口令：${data.default_password}（登录后可修改）`, 'success');
    } else {
      toast('已保存', 'success');
    }
    loadAdminTab();
  } catch (e) { toast(e.message, 'error'); }
}
async function toggleArchive(id) {
  try { await api(`/api/${adminTab}/${id}/toggle`, { method: 'POST' }); loadAdminTab(); }
  catch (e) { toast(e.message, 'error'); }
}
async function deleteArchive(id) {
  const extra = adminTab === 'salespersons' ? '销售员的默认口令（admin+序号）也会随编号变化。' : '';
  if (!confirm('确定删除该档案吗？删除后其余档案的 ID 会自动重新排序。' + extra)) return;
  try { await api(`/api/${adminTab}/${id}`, { method: 'DELETE' }); toast('已删除', 'success'); loadAdminTab(); }
  catch (e) { toast(e.message, 'error'); }
}
async function downloadBackup() {
  try {
    const res = await fetch('/api/admin/backup', { headers: { 'x-token': TOKEN } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'sales-backup.db'; a.click();
    URL.revokeObjectURL(a.href); toast('备份文件下载成功', 'success');
  } catch (e) { toast('备份失败：' + e.message, 'error'); }
}

/* ===== 启动 ===== */
(async function start() {
  await initLogin();
  if (USER) route();
})();
