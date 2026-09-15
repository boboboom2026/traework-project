/* 供应商管理与采购系统 —— 前端（原生 JS，无构建步骤） */

"use strict";

const state = {
  user: null,
  view: "dashboard",
  products: [],
  vendors: [],
  dimensions: [],
  vendorsQuery: { q: "", status: "" },
  productsQuery: { q: "" },
  ordersQuery: { status: "" },
};

const ROLE_LABEL = { admin: "管理员", buyer: "采购员", approver: "审批经理" };
const STATUS_LABEL = {
  draft: "草稿", pending: "待审批", approved: "已批准",
  rejected: "已驳回", cancelled: "已取消", received: "已收货",
};
const VENDOR_STATUS_LABEL = { active: "合作中", paused: "暂停合作", blacklisted: "黑名单" };
const ACTION_LABEL = {
  create: "创建", update: "修改", submit: "提交审批",
  approve: "批准", reject: "驳回", cancel: "取消", receive: "确认收货",
};

/* ---------------- 基础工具 ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const money = (n) => "¥" + Number(n || 0).toFixed(2);
const num = (n) => Number(n || 0).toLocaleString("zh-CN");

function scoreClass(score) {
  if (score === null || score === undefined) return "";
  if (score >= 85) return "score-good";
  if (score >= 70) return "score-mid";
  return "score-bad";
}

function orderedBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

let toastTimer = null;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function api(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") {
      state.user = null;
      showLogin();
    }
    throw new Error((data && data.error) || `请求失败（${res.status}）`);
  }
  return data;
}

/* ---------------- 弹窗 ---------------- */

function openModal({ title, bodyHtml, footerHtml = "", wide = false, onMount }) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = bodyHtml;
  $("#modal-footer").innerHTML = footerHtml;
  $(".modal").classList.toggle("wide", wide);
  $("#modal-backdrop").hidden = false;
  if (onMount) onMount($("#modal-body"), $("#modal-footer"));
}

function closeModal() {
  $("#modal-backdrop").hidden = true;
  $("#modal-body").innerHTML = "";
  $("#modal-footer").innerHTML = "";
}

/* ---------------- 登录 ---------------- */

function showLogin() {
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
}

function showApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#current-user").textContent =
    `${state.user.display_name}（${ROLE_LABEL[state.user.role] || state.user.role}）`;
  switchView("dashboard");
}

function can(...roles) {
  return state.user && roles.includes(state.user.role);
}

/* ---------------- 视图切换 ---------------- */

function switchView(view) {
  state.view = view;
  $$("#tabs button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  const renderers = {
    dashboard: renderDashboard,
    vendors: renderVendors,
    scoring: renderScoring,
    products: renderProducts,
    orders: renderOrders,
    approvals: renderApprovals,
  };
  (renderers[view] || renderDashboard)();
}

async function loadBasics() {
  const [vendors, products, dimensions] = await Promise.all([
    api("GET", "/api/vendors"),
    api("GET", "/api/products"),
    api("GET", "/api/dimensions"),
  ]);
  state.vendors = vendors.vendors;
  state.products = products.products;
  state.dimensions = dimensions.dimensions;
}

/* ---------------- 看板 ---------------- */

async function renderDashboard() {
  const content = $("#content");
  content.innerHTML = `<div class="card"><p class="muted">加载中…</p></div>`;
  try {
    const [stats, ranking, orders] = await Promise.all([
      api("GET", "/api/dashboard"),
      api("GET", "/api/vendors/ranking"),
      api("GET", "/api/orders?status=pending"),
    ]);
    const pendingMine = orders.orders.filter((o) => o.requester_id !== state.user.id);
    const topVendors = ranking.ranking.filter((v) => v.avg_score !== null).slice(0, 5);

    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="label">供应商总数</div>
          <div class="value">${num(stats.vendor_total)}</div>
          <div class="muted">合作中 ${num(stats.vendor_active)} 家</div></div>
        <div class="stat"><div class="label">在售产品</div>
          <div class="value">${num(stats.product_total)}</div></div>
        <div class="stat"><div class="label">待审批采购单</div>
          <div class="value">${num(stats.pending_approval)}</div>
          ${can("admin", "approver") ? `<div class="muted">其中待你处理 ${num(stats.my_pending)} 单</div>` : ""}</div>
        <div class="stat"><div class="label">已批准采购金额</div>
          <div class="value">${money(stats.approved_amount)}</div></div>
      </div>

      <div class="card">
        <div class="row-between">
          <h2>待审批（${pendingMine.length}）</h2>
          <button class="btn small" data-goto="approvals">去审批</button>
        </div>
        ${pendingMine.length === 0 ? `<p class="empty">暂无待审批单据</p>` : `
        <table>
          <thead><tr><th>采购单号</th><th>供应商</th><th>申请人</th>
            <th class="right">金额</th><th>提交时间</th></tr></thead>
          <tbody>${pendingMine.slice(0, 5).map((o) => `
            <tr class="clickable" data-order="${o.id}">
              <td class="nowrap">${esc(o.order_no)}</td>
              <td>${esc(o.vendor_name)}</td>
              <td>${esc(o.requester_name)}</td>
              <td class="right">${money(o.total_amount)}</td>
              <td class="nowrap muted">${esc((o.submitted_at || "").replace("T", " ").slice(0, 16))}</td>
            </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <div class="card">
        <h2>供应商评分排行（Top 5）</h2>
        ${topVendors.length === 0 ? `<p class="empty">还没有评分数据</p>` : `
        <table>
          <thead><tr><th>排名</th><th>供应商</th><th>类别</th>
            <th class="right">综合得分</th><th class="right">评分次数</th></tr></thead>
          <tbody>${topVendors.map((v, i) => `
            <tr><td>${i + 1}</td><td>${esc(v.name)}</td><td>${esc(v.category || "-")}</td>
              <td class="right ${scoreClass(v.avg_score)}">${v.avg_score}</td>
              <td class="right">${v.score_count}</td></tr>`).join("")}</tbody>
        </table>`}
      </div>`;

    $$("[data-goto]").forEach((btn) =>
      btn.addEventListener("click", () => switchView(btn.dataset.goto)));
    $$("[data-order]").forEach((row) =>
      row.addEventListener("click", () => openOrderDetail(Number(row.dataset.order))));
  } catch (err) {
    content.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

/* ---------------- 供应商 ---------------- */

async function renderVendors() {
  const content = $("#content");
  const { q, status } = state.vendorsQuery;
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input type="search" id="vendor-search" placeholder="搜索名称 / 信用代码 / 联系人 / 类别"
               value="${esc(q)}" style="min-width:280px">
        <select id="vendor-status">
          <option value="">全部状态</option>
          ${Object.entries(VENDOR_STATUS_LABEL).map(([k, v]) =>
            `<option value="${k}" ${status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <button class="btn" id="vendor-search-btn">查询</button>
        <span style="flex:1"></span>
        ${can("admin", "buyer")
          ? `<button class="btn primary" id="vendor-add">＋ 录入供应商</button>` : ""}
      </div>
      <div id="vendor-table"><p class="muted">加载中…</p></div>
    </div>`;

  const reload = async () => {
    state.vendorsQuery = {
      q: $("#vendor-search").value.trim(),
      status: $("#vendor-status").value,
    };
    const params = new URLSearchParams();
    if (state.vendorsQuery.q) params.set("q", state.vendorsQuery.q);
    if (state.vendorsQuery.status) params.set("status", state.vendorsQuery.status);
    const data = await api("GET", "/api/vendors?" + params.toString());
    state.vendors = data.vendors;
    renderVendorTable(data.vendors);
  };

  $("#vendor-search-btn").addEventListener("click", () => reload().catch(showError));
  $("#vendor-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") reload().catch(showError);
  });
  $("#vendor-status").addEventListener("change", () => reload().catch(showError));
  const addBtn = $("#vendor-add");
  if (addBtn) addBtn.addEventListener("click", () => openVendorForm(null));

  try { await reload(); } catch (err) { showError(err); }
}

function renderVendorTable(vendors) {
  const box = $("#vendor-table");
  if (!vendors.length) {
    box.innerHTML = `<p class="empty">没有符合条件的供应商</p>`;
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>供应商</th><th>类别</th><th>联系人</th><th>电话</th>
        <th>状态</th><th class="right">综合得分</th><th>操作</th></tr></thead>
      <tbody>${vendors.map((v) => `
        <tr>
          <td><strong>${esc(v.name)}</strong>
            <div class="muted" style="font-size:12px">${esc(v.code || "")}</div></td>
          <td>${esc(v.category || "-")}</td>
          <td>${esc(v.contact || "-")}</td>
          <td class="nowrap">${esc(v.phone || "-")}</td>
          <td><span class="badge ${esc(v.status)}">${esc(VENDOR_STATUS_LABEL[v.status] || v.status)}</span></td>
          <td class="right ${scoreClass(v.avg_score)}">${v.avg_score ?? "-"}</td>
          <td class="actions">
            <button class="btn small" data-detail="${v.id}">详情</button>
            ${can("admin", "buyer") ? `<button class="btn small" data-score="${v.id}">评分</button>` : ""}
            ${can("admin", "buyer") ? `<button class="btn small" data-edit="${v.id}">编辑</button>` : ""}
            ${can("admin") ? `<button class="btn small danger" data-delete="${v.id}">删除</button>` : ""}
          </td>
        </tr>`).join("")}</tbody>
    </table>`;

  $$("[data-detail]", box).forEach((b) =>
    b.addEventListener("click", () => openVendorDetail(Number(b.dataset.detail))));
  $$("[data-edit]", box).forEach((b) =>
    b.addEventListener("click", () => openVendorForm(
      state.vendors.find((v) => v.id === Number(b.dataset.edit)))));
  $$("[data-score]", box).forEach((b) =>
    b.addEventListener("click", () => openScoreForm(Number(b.dataset.score))));
  $$("[data-delete]", box).forEach((b) =>
    b.addEventListener("click", () => deleteVendor(Number(b.dataset.delete))));
}

function vendorFormHtml(vendor) {
  const v = vendor || {};
  return `
    <div class="field"><label>供应商名称 *</label>
      <input name="name" value="${esc(v.name || "")}" required></div>
    <div class="grid-2">
      <div class="field"><label>统一社会信用代码</label>
        <input name="code" value="${esc(v.code || "")}"></div>
      <div class="field"><label>供应类别</label>
        <input name="category" value="${esc(v.category || "")}" placeholder="如 电子元器件"></div>
      <div class="field"><label>联系人</label>
        <input name="contact" value="${esc(v.contact || "")}"></div>
      <div class="field"><label>联系电话</label>
        <input name="phone" value="${esc(v.phone || "")}"></div>
      <div class="field"><label>邮箱</label>
        <input name="email" value="${esc(v.email || "")}"></div>
      <div class="field"><label>状态</label>
        <select name="status">${Object.entries(VENDOR_STATUS_LABEL).map(([k, label]) =>
          `<option value="${k}" ${(v.status || "active") === k ? "selected" : ""}>${label}</option>`
        ).join("")}</select></div>
    </div>
    <div class="field"><label>地址</label>
      <input name="address" value="${esc(v.address || "")}"></div>
    <div class="field"><label>备注</label>
      <textarea name="note">${esc(v.note || "")}</textarea></div>`;
}

function openVendorForm(vendor) {
  openModal({
    title: vendor ? `编辑供应商：${vendor.name}` : "录入供应商",
    bodyHtml: `<form id="vendor-form">${vendorFormHtml(vendor)}</form>`,
    footerHtml: `
      <button class="btn" data-cancel>取消</button>
      <button class="btn primary" id="vendor-save">保存</button>`,
    onMount(body, footer) {
      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#vendor-save", footer).addEventListener("click", async () => {
        const form = $("#vendor-form", body);
        if (!form.reportValidity()) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          if (vendor) await api("PUT", `/api/vendors/${vendor.id}`, payload);
          else await api("POST", "/api/vendors", payload);
          closeModal();
          toast(vendor ? "供应商已更新" : "供应商已录入");
          switchView("vendors");
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

async function deleteVendor(id) {
  const vendor = state.vendors.find((v) => v.id === id);
  if (!confirm(`确定删除供应商「${vendor ? vendor.name : id}」？此操作不可撤销。`)) return;
  try {
    await api("DELETE", `/api/vendors/${id}`);
    toast("供应商已删除");
    switchView("vendors");
  } catch (err) { toast(err.message, true); }
}

async function openVendorDetail(id) {
  openModal({ title: "加载中…", bodyHtml: `<p class="muted">加载中…</p>` });
  try {
    const [vendor, scores, orders] = await Promise.all([
      api("GET", `/api/vendors/${id}`),
      api("GET", `/api/vendors/${id}/scores`),
      api("GET", "/api/orders"),
    ]);
    const vendorOrders = orders.orders.filter((o) => o.vendor_id === id);
    const avg = scores.scores.length
      ? (scores.scores.reduce((sum, s) => sum + s.total_score, 0) / scores.scores.length).toFixed(2)
      : null;

    openModal({
      title: vendor.name,
      wide: true,
      bodyHtml: `
        <dl class="detail-list">
          <dt>信用代码</dt><dd>${esc(vendor.code || "-")}</dd>
          <dt>供应类别</dt><dd>${esc(vendor.category || "-")}</dd>
          <dt>联系人</dt><dd>${esc(vendor.contact || "-")} ${esc(vendor.phone || "")}</dd>
          <dt>邮箱</dt><dd>${esc(vendor.email || "-")}</dd>
          <dt>地址</dt><dd>${esc(vendor.address || "-")}</dd>
          <dt>状态</dt><dd><span class="badge ${esc(vendor.status)}">${esc(VENDOR_STATUS_LABEL[vendor.status])}</span></dd>
          <dt>平均得分</dt><dd class="${scoreClass(avg ? Number(avg) : null)}">${avg ?? "暂无评分"}</dd>
          <dt>备注</dt><dd>${esc(vendor.note || "-")}</dd>
        </dl>
        <h3 style="margin:18px 0 8px;font-size:14px">评分记录</h3>
        ${scores.scores.length === 0 ? `<p class="empty">还没有评分记录</p>` : `
          <table><thead><tr><th>周期</th><th>评分人</th><th class="right">总分</th>
            <th>各维度</th><th>时间</th></tr></thead><tbody>
            ${scores.scores.map((s) => `<tr>
              <td>${esc(s.period || "-")}</td>
              <td>${esc(s.evaluator_name)}</td>
              <td class="right ${scoreClass(s.total_score)}">${s.total_score}</td>
              <td class="muted">${s.items.map((i) =>
                `${esc(i.dimension_name)} ${i.score}`).join(" · ")}</td>
              <td class="nowrap muted">${esc(s.created_at.slice(0, 10))}</td>
            </tr>`).join("")}</tbody></table>`}
        <h3 style="margin:18px 0 8px;font-size:14px">采购记录</h3>
        ${vendorOrders.length === 0 ? `<p class="empty">还没有采购单</p>` : `
          <table><thead><tr><th>单号</th><th>状态</th><th class="right">金额</th>
            <th>申请人</th><th>创建时间</th></tr></thead><tbody>
            ${vendorOrders.map((o) => `<tr>
              <td class="nowrap">${esc(o.order_no)}</td>
              <td>${orderedBadge(o.status)}</td>
              <td class="right">${money(o.total_amount)}</td>
              <td>${esc(o.requester_name)}</td>
              <td class="nowrap muted">${esc((o.created_at || "").slice(0, 10))}</td>
            </tr>`).join("")}</tbody></table>`}`,
      footerHtml: `
        ${can("admin", "buyer") ? `<button class="btn" id="detail-score">给该供应商评分</button>` : ""}
        <button class="btn primary" data-cancel>关闭</button>`,
      onMount(body, footer) {
        $("[data-cancel]", footer).addEventListener("click", closeModal);
        const scoreBtn = $("#detail-score", footer);
        if (scoreBtn) scoreBtn.addEventListener("click", () => openScoreForm(id));
      },
    });
  } catch (err) {
    openModal({ title: "出错了", bodyHtml: `<p class="error">${esc(err.message)}</p>`,
      footerHtml: `<button class="btn" data-cancel>关闭</button>`,
      onMount(_b, footer) {
        $("[data-cancel]", footer).addEventListener("click", closeModal);
      } });
  }
}

/* ---------------- 评分 ---------------- */

async function renderScoring() {
  const content = $("#content");
  content.innerHTML = `<div class="card"><p class="muted">加载中…</p></div>`;
  try {
    const [dimensions, ranking] = await Promise.all([
      api("GET", "/api/dimensions"),
      api("GET", "/api/vendors/ranking"),
    ]);
    state.dimensions = dimensions.dimensions;
    const totalWeight = dimensions.dimensions.reduce((s, d) => s + d.weight, 0) || 1;

    content.innerHTML = `
      <div class="card">
        <div class="row-between">
          <h2>评分维度（权重合计 ${totalWeight.toFixed(2)}）</h2>
          ${can("admin", "buyer")
            ? `<button class="btn primary" id="dim-add">＋ 新增维度</button>` : ""}
        </div>
        ${dimensions.dimensions.length === 0 ? `<p class="empty">还没有配置维度</p>` : `
        <table>
          <thead><tr><th>维度</th><th style="width:180px">权重</th><th>说明</th><th>操作</th></tr></thead>
          <tbody>${dimensions.dimensions.map((d) => `
            <tr>
              <td><strong>${esc(d.name)}</strong></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="nowrap">${d.weight.toFixed(2)}</span>
                  <div class="weight-bar"><span style="width:${Math.min(100, d.weight / totalWeight * 100)}%"></span></div>
                </div>
              </td>
              <td class="muted">${esc(d.description || "-")}</td>
              <td class="actions">
                ${can("admin", "buyer")
                  ? `<button class="btn small" data-dim-edit="${d.id}">编辑</button>` : ""}
                ${can("admin")
                  ? `<button class="btn small danger" data-dim-delete="${d.id}">删除</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <div class="card">
        <div class="row-between">
          <h2>供应商评分排行</h2>
          ${can("admin", "buyer")
            ? `<button class="btn primary" id="score-add">＋ 录入评分</button>` : ""}
        </div>
        <table>
          <thead><tr><th>排名</th><th>供应商</th><th>类别</th><th>状态</th>
            <th class="right">综合得分</th><th class="right">评分次数</th>
            <th>最近评分</th><th>操作</th></tr></thead>
          <tbody>${ranking.ranking.map((v, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(v.name)}</td>
              <td>${esc(v.category || "-")}</td>
              <td><span class="badge ${esc(v.status)}">${esc(VENDOR_STATUS_LABEL[v.status])}</span></td>
              <td class="right ${scoreClass(v.avg_score)}">${v.avg_score ?? "-"}</td>
              <td class="right">${v.score_count}</td>
              <td class="nowrap muted">${esc((v.last_scored_at || "-").slice(0, 10))}</td>
              <td class="actions">
                <button class="btn small" data-ranking-detail="${v.id}">明细</button>
                ${can("admin", "buyer")
                  ? `<button class="btn small" data-ranking-score="${v.id}">评分</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;

    const dimAdd = $("#dim-add");
    if (dimAdd) dimAdd.addEventListener("click", () => openDimensionForm(null));
    const scoreAdd = $("#score-add");
    if (scoreAdd) scoreAdd.addEventListener("click", () => openScoreForm(null));
    $$("[data-dim-edit]").forEach((b) => b.addEventListener("click", () => openDimensionForm(
      state.dimensions.find((d) => d.id === Number(b.dataset.dimEdit)))));
    $$("[data-dim-delete]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("确定删除该评分维度？")) return;
      try {
        await api("DELETE", `/api/dimensions/${b.dataset.dimDelete}`);
        toast("维度已删除");
        renderScoring();
      } catch (err) { toast(err.message, true); }
    }));
    $$("[data-ranking-detail]").forEach((b) =>
      b.addEventListener("click", () => openVendorDetail(Number(b.dataset.rankingDetail))));
    $$("[data-ranking-score]").forEach((b) =>
      b.addEventListener("click", () => openScoreForm(Number(b.dataset.rankingScore))));
  } catch (err) {
    content.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

function openDimensionForm(dimension) {
  const d = dimension || {};
  openModal({
    title: dimension ? `编辑维度：${dimension.name}` : "新增评分维度",
    bodyHtml: `
      <form id="dim-form">
        <div class="field"><label>维度名称 *</label>
          <input name="name" value="${esc(d.name || "")}" required></div>
        <div class="field"><label>权重（数字，越大越重要；常用 0~1）</label>
          <input name="weight" type="number" step="0.01" min="0" value="${d.weight ?? 1}"></div>
        <div class="field"><label>说明</label>
          <textarea name="description">${esc(d.description || "")}</textarea></div>
      </form>`,
    footerHtml: `<button class="btn" data-cancel>取消</button>
      <button class="btn primary" id="dim-save">保存</button>`,
    onMount(body, footer) {
      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#dim-save", footer).addEventListener("click", async () => {
        const form = $("#dim-form", body);
        if (!form.reportValidity()) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          if (dimension) await api("PUT", `/api/dimensions/${dimension.id}`, payload);
          else await api("POST", "/api/dimensions", payload);
          closeModal();
          toast("维度已保存");
          loadBasics().catch(() => {});
          renderScoring();
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

function openScoreForm(vendorId) {
  if (!state.dimensions.length) {
    toast("请先配置评分维度", true);
    return;
  }
  const defaults = state.dimensions.map(() => 80);
  openModal({
    title: "供应商评分",
    bodyHtml: `
      <div class="grid-2">
        <div class="field"><label>供应商 *</label>
          <select id="score-vendor">
            <option value="">请选择</option>
            ${state.vendors.map((v) => `<option value="${v.id}" ${v.id === vendorId ? "selected" : ""}>
              ${esc(v.name)}</option>`).join("")}
          </select></div>
        <div class="field"><label>评分周期</label>
          <input id="score-period" value="${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}"></div>
      </div>
      <div class="field"><label>各维度打分（0-100）</label>
        <div id="score-items">
          ${state.dimensions.map((d, i) => `
            <div class="score-input-row">
              <div><strong>${esc(d.name)}</strong>
                <span class="muted">权重 ${d.weight}</span></div>
              <input type="number" min="0" max="100" step="1" value="${defaults[i]}"
                     data-dim="${d.id}" data-weight="${d.weight}">
            </div>`).join("")}
        </div>
      </div>
      <div class="field"><label>总体评价</label>
        <textarea id="score-comment" placeholder="可选：说明打分依据、改进建议"></textarea></div>
      <p class="muted">加权综合得分：<strong id="score-total">-</strong></p>`,
    footerHtml: `<button class="btn" data-cancel>取消</button>
      <button class="btn primary" id="score-save">提交评分</button>`,
    onMount(body, footer) {
      const inputs = $$("[data-dim]", body);
      const recalc = () => {
        let weightSum = 0;
        let total = 0;
        inputs.forEach((input) => {
          const weight = Number(input.dataset.weight);
          const value = Number(input.value || 0);
          weightSum += weight;
          total += value * weight;
        });
        $("#score-total", body).textContent =
          weightSum > 0 ? (total / weightSum).toFixed(2) : "-";
      };
      inputs.forEach((input) => input.addEventListener("input", recalc));
      recalc();

      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#score-save", footer).addEventListener("click", async () => {
        const selected = $("#score-vendor", body).value;
        if (!selected) { toast("请选择供应商", true); return; }
        const items = inputs.map((input) => ({
          dimension_id: Number(input.dataset.dim),
          score: Number(input.value),
        }));
        try {
          const result = await api("POST", `/api/vendors/${selected}/scores`, {
            period: $("#score-period", body).value,
            comment: $("#score-comment", body).value,
            items,
          });
          closeModal();
          toast(`评分已提交，综合得分 ${result.total_score}`);
          renderScoring();
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

/* ---------------- 产品目录 ---------------- */

async function renderProducts() {
  const content = $("#content");
  const { q } = state.productsQuery;
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input type="search" id="product-search" placeholder="搜索产品名称 / 编码 / 分类"
               value="${esc(q)}" style="min-width:280px">
        <button class="btn" id="product-search-btn">查询</button>
        <span style="flex:1"></span>
        ${can("admin", "buyer")
          ? `<button class="btn primary" id="product-add">＋ 新增产品</button>` : ""}
      </div>
      <div id="product-table"><p class="muted">加载中…</p></div>
    </div>`;

  const reload = async () => {
    state.productsQuery.q = $("#product-search").value.trim();
    const params = new URLSearchParams();
    if (state.productsQuery.q) params.set("q", state.productsQuery.q);
    const data = await api("GET", "/api/products?" + params.toString());
    state.products = data.products;
    renderProductTable(data.products);
  };

  $("#product-search-btn").addEventListener("click", () => reload().catch(showError));
  $("#product-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") reload().catch(showError);
  });
  const addBtn = $("#product-add");
  if (addBtn) addBtn.addEventListener("click", () => openProductForm(null));
  try { await reload(); } catch (err) { showError(err); }
}

function renderProductTable(products) {
  const box = $("#product-table");
  if (!products.length) {
    box.innerHTML = `<p class="empty">没有符合条件的产品</p>`;
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>编码</th><th>产品名称</th><th>分类</th><th>规格</th>
        <th>单位</th><th class="right">参考单价</th><th>默认供应商</th><th>操作</th></tr></thead>
      <tbody>${products.map((p) => `
        <tr ${p.active ? "" : 'style="opacity:.55"'}>
          <td class="nowrap">${esc(p.sku)}</td>
          <td><strong>${esc(p.name)}</strong>${p.active ? "" : ' <span class="badge">已停用</span>'}</td>
          <td>${esc(p.category || "-")}</td>
          <td class="muted">${esc(p.spec || "-")}</td>
          <td>${esc(p.unit || "-")}</td>
          <td class="right">${money(p.unit_price)}</td>
          <td>${esc(p.vendor_name || "-")}</td>
          <td class="actions">
            ${can("admin", "buyer")
              ? `<button class="btn small" data-product-edit="${p.id}">编辑</button>` : ""}
            ${can("admin")
              ? `<button class="btn small danger" data-product-delete="${p.id}">删除</button>` : ""}
          </td>
        </tr>`).join("")}</tbody>
    </table>`;

  $$("[data-product-edit]", box).forEach((b) => b.addEventListener("click", () => {
    const product = state.products.find((p) => p.id === Number(b.dataset.productEdit));
    openProductForm(product);
  }));
  $$("[data-product-delete]", box).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("确定删除该产品？")) return;
    try {
      await api("DELETE", `/api/products/${b.dataset.productDelete}`);
      toast("产品已删除");
      renderProducts();
    } catch (err) { toast(err.message, true); }
  }));
}

function openProductForm(product) {
  const p = product || {};
  openModal({
    title: product ? `编辑产品：${product.name}` : "新增产品",
    bodyHtml: `
      <form id="product-form">
        <div class="grid-2">
          <div class="field"><label>产品编码 *</label>
            <input name="sku" value="${esc(p.sku || "")}" required></div>
          <div class="field"><label>产品名称 *</label>
            <input name="name" value="${esc(p.name || "")}" required></div>
          <div class="field"><label>分类</label>
            <input name="category" value="${esc(p.category || "")}"></div>
          <div class="field"><label>规格型号</label>
            <input name="spec" value="${esc(p.spec || "")}"></div>
          <div class="field"><label>单位</label>
            <input name="unit" value="${esc(p.unit || "件")}"></div>
          <div class="field"><label>参考单价</label>
            <input name="unit_price" type="number" step="0.01" min="0" value="${p.unit_price ?? 0}"></div>
        </div>
        <div class="field"><label>默认供应商</label>
          <select name="vendor_id">
            <option value="">（不指定）</option>
            ${state.vendors.map((v) => `<option value="${v.id}" ${p.vendor_id === v.id ? "selected" : ""}>
              ${esc(v.name)}</option>`).join("")}
          </select></div>
        <div class="field"><label><input type="checkbox" name="active" ${product && !product.active ? "" : "checked"}>
          在售（取消勾选表示停用）</label></div>
      </form>`,
    footerHtml: `<button class="btn" data-cancel>取消</button>
      <button class="btn primary" id="product-save">保存</button>`,
    onMount(body, footer) {
      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#product-save", footer).addEventListener("click", async () => {
        const form = $("#product-form", body);
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        data.active = $("#product-form input[name=active]", body).checked;
        data.vendor_id = data.vendor_id || null;
        try {
          if (product) await api("PUT", `/api/products/${product.id}`, data);
          else await api("POST", "/api/products", data);
          closeModal();
          toast("产品已保存");
          renderProducts();
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

/* ---------------- 采购单 ---------------- */

async function renderOrders() {
  const content = $("#content");
  const status = state.ordersQuery.status;
  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="order-status">
          <option value="">全部状态</option>
          ${Object.entries(STATUS_LABEL).map(([k, v]) =>
            `<option value="${k}" ${status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <label class="muted"><input type="checkbox" id="order-mine"> 只看我提交的</label>
        <span style="flex:1"></span>
        ${can("admin", "buyer")
          ? `<button class="btn primary" id="order-add">＋ 新建采购单</button>` : ""}
      </div>
      <div id="order-table"><p class="muted">加载中…</p></div>
    </div>`;

  const reload = async () => {
    state.ordersQuery.status = $("#order-status").value;
    const params = new URLSearchParams();
    if (state.ordersQuery.status) params.set("status", state.ordersQuery.status);
    if ($("#order-mine").checked) params.set("mine", "1");
    const data = await api("GET", "/api/orders?" + params.toString());
    renderOrderTable(data.orders);
  };

  $("#order-status").addEventListener("change", () => reload().catch(showError));
  $("#order-mine").addEventListener("change", () => reload().catch(showError));
  const addBtn = $("#order-add");
  if (addBtn) addBtn.addEventListener("click", () => openOrderForm(null));
  try { await reload(); } catch (err) { showError(err); }
}

function renderOrderTable(orders) {
  const box = $("#order-table");
  if (!orders.length) {
    box.innerHTML = `<p class="empty">没有符合条件的采购单</p>`;
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>采购单号</th><th>供应商</th><th>申请人</th><th class="right">明细</th>
        <th class="right">金额</th><th>状态</th><th>期望到货</th><th>操作</th></tr></thead>
      <tbody>${orders.map((o) => `
        <tr>
          <td class="nowrap"><strong>${esc(o.order_no)}</strong></td>
          <td>${esc(o.vendor_name)}</td>
          <td>${esc(o.requester_name)}</td>
          <td class="right">${o.item_count} 条</td>
          <td class="right">${money(o.total_amount)}</td>
          <td>${orderedBadge(o.status)}</td>
          <td class="nowrap muted">${esc(o.expected_date || "-")}</td>
          <td class="actions">
            <button class="btn small" data-order-detail="${o.id}">详情</button>
            ${o.status === "draft" && (can("admin") || o.requester_id === state.user.id)
              ? `<button class="btn small" data-order-edit="${o.id}">编辑</button>
                 <button class="btn small primary" data-order-submit="${o.id}">提交审批</button>` : ""}
            ${o.status === "pending" && can("admin", "approver") && o.requester_id !== state.user.id
              ? `<button class="btn small primary" data-order-approve="${o.id}">批准</button>
                 <button class="btn small danger" data-order-reject="${o.id}">驳回</button>` : ""}
            ${o.status === "approved" && can("admin", "buyer")
              ? `<button class="btn small primary" data-order-receive="${o.id}">确认收货</button>` : ""}
          </td>
        </tr>`).join("")}</tbody>
    </table>`;

  $$("[data-order-detail]", box).forEach((b) =>
    b.addEventListener("click", () => openOrderDetail(Number(b.dataset.orderDetail))));
  $$("[data-order-edit]", box).forEach((b) =>
    b.addEventListener("click", async () => {
      const order = await api("GET", `/api/orders/${b.dataset.orderEdit}`);
      openOrderForm(order);
    }));
  $$("[data-order-submit]", box).forEach((b) =>
    b.addEventListener("click", () => orderAction(b.dataset.orderSubmit, "submit", "已提交审批")));
  $$("[data-order-approve]", box).forEach((b) =>
    b.addEventListener("click", () => openDecisionModal(b.dataset.orderApprove, "approve")));
  $$("[data-order-reject]", box).forEach((b) =>
    b.addEventListener("click", () => openDecisionModal(b.dataset.orderReject, "reject")));
  $$("[data-order-receive]", box).forEach((b) =>
    b.addEventListener("click", () => orderAction(b.dataset.orderReceive, "receive", "已确认收货")));
}

function orderItemsHtml(order) {
  const items = (order && order.items) || [{ product_id: null, product_name: "",
    spec: "", unit: "", quantity: 1, unit_price: 0 }];
  return items.map((item) => `
    <tr>
      <td>
        <select class="item-product">
          <option value="">（自定义）</option>
          ${state.products.filter((p) => p.active).map((p) =>
            `<option value="${p.id}" ${item.product_id === p.id ? "selected" : ""}>
              ${esc(p.sku)} ${esc(p.name)}</option>`).join("")}
        </select>
      </td>
      <td><input class="item-name" value="${esc(item.product_name || "")}" placeholder="产品名称"></td>
      <td><input class="item-spec" value="${esc(item.spec || "")}" placeholder="规格"></td>
      <td style="width:70px"><input class="item-unit" value="${esc(item.unit || "")}" placeholder="单位"></td>
      <td style="width:90px"><input class="item-qty" type="number" min="0.01" step="0.01"
            value="${item.quantity ?? 1}"></td>
      <td style="width:110px"><input class="item-price" type="number" min="0" step="0.01"
            value="${item.unit_price ?? 0}"></td>
      <td class="right nowrap item-amount">¥0.00</td>
      <td><button type="button" class="btn small danger item-remove">删</button></td>
    </tr>`).join("");
}

function openOrderForm(order) {
  const isEdit = Boolean(order);
  openModal({
    title: isEdit ? `编辑采购单 ${order.order_no}` : "新建采购单",
    wide: true,
    bodyHtml: `
      <div class="grid-3">
        <div class="field"><label>供应商 *</label>
          <select id="order-vendor">
            <option value="">请选择</option>
            ${state.vendors.filter((v) => v.status !== "blacklisted").map((v) =>
              `<option value="${v.id}" ${order && order.vendor_id === v.id ? "selected" : ""}>
                ${esc(v.name)}${v.status === "paused" ? "（暂停合作）" : ""}</option>`).join("")}
          </select></div>
        <div class="field"><label>期望到货日期</label>
          <input id="order-date" type="date" value="${esc((order && order.expected_date) || "")}"></div>
        <div class="field"><label>合计金额</label>
          <input id="order-total" value="¥0.00" readonly></div>
      </div>
      <div class="field"><label>采购明细 *</label>
        <table class="items-table">
          <thead><tr><th>选择产品</th><th>名称</th><th>规格</th><th>单位</th>
            <th>数量</th><th>单价</th><th class="right">金额</th><th></th></tr></thead>
          <tbody id="order-items">${orderItemsHtml(order)}</tbody>
        </table>
        <button type="button" class="btn small" id="order-item-add" style="margin-top:8px">＋ 添加明细行</button>
      </div>
      <div class="field"><label>备注 / 申请理由</label>
        <textarea id="order-note">${esc((order && order.note) || "")}</textarea></div>`,
    footerHtml: `<button class="btn" data-cancel>取消</button>
      <button class="btn primary" id="order-save">${isEdit ? "保存修改" : "创建草稿"}</button>`,
    onMount(body, footer) {
      const itemsBox = $("#order-items", body);

      const recalc = () => {
        let total = 0;
        $$("tr", itemsBox).forEach((row) => {
          const qty = Number($(".item-qty", row).value || 0);
          const price = Number($(".item-price", row).value || 0);
          const amount = qty * price;
          total += amount;
          $(".item-amount", row).textContent = money(amount);
        });
        $("#order-total", body).value = money(total);
      };

      const bindRow = (row) => {
        $(".item-product", row).addEventListener("change", (e) => {
          const product = state.products.find((p) => p.id === Number(e.target.value));
          if (product) {
            $(".item-name", row).value = product.name;
            $(".item-spec", row).value = product.spec || "";
            $(".item-unit", row).value = product.unit || "";
            $(".item-price", row).value = product.unit_price;
            if (!$("#order-vendor", body).value && product.vendor_id) {
              $("#order-vendor", body).value = product.vendor_id;
            }
          }
          recalc();
        });
        $(".item-remove", row).addEventListener("click", () => {
          if ($$("tr", itemsBox).length === 1) { toast("至少保留一条明细", true); return; }
          row.remove();
          recalc();
        });
        $$("input", row).forEach((input) => input.addEventListener("input", recalc));
      };

      $$("tr", itemsBox).forEach(bindRow);
      recalc();

      $("#order-item-add", body).addEventListener("click", () => {
        const tbody = itemsBox;
        const holder = document.createElement("tbody");
        holder.innerHTML = orderItemsHtml(null);
        const row = holder.firstElementChild;
        tbody.appendChild(row);
        bindRow(row);
        recalc();
      });

      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#order-save", footer).addEventListener("click", async () => {
        const vendorId = $("#order-vendor", body).value;
        if (!vendorId) { toast("请选择供应商", true); return; }
        const items = $$("tr", itemsBox).map((row) => ({
          product_id: $(".item-product", row).value || null,
          product_name: $(".item-name", row).value.trim(),
          spec: $(".item-spec", row).value.trim(),
          unit: $(".item-unit", row).value.trim(),
          quantity: Number($(".item-qty", row).value || 0),
          unit_price: Number($(".item-price", row).value || 0),
        }));
        if (items.some((i) => !i.product_name)) { toast("每条明细都要有产品名称", true); return; }
        const payload = {
          vendor_id: Number(vendorId),
          expected_date: $("#order-date", body).value || null,
          note: $("#order-note", body).value,
          items,
        };
        try {
          if (isEdit) await api("PUT", `/api/orders/${order.id}`, payload);
          else await api("POST", "/api/orders", payload);
          closeModal();
          toast(isEdit ? "采购单已更新" : "草稿已创建，可提交审批");
          renderOrders();
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

async function openOrderDetail(id) {
  openModal({ title: "加载中…", bodyHtml: `<p class="muted">加载中…</p>` });
  try {
    const o = await api("GET", `/api/orders/${id}`);
    const isOwner = o.requester_id === state.user.id;
    const canDecide = can("admin", "approver") && !isOwner && o.status === "pending";
    openModal({
      title: `采购单 ${o.order_no}`,
      wide: true,
      bodyHtml: `
        <dl class="detail-list">
          <dt>供应商</dt><dd>${esc(o.vendor_name)}</dd>
          <dt>申请人</dt><dd>${esc(o.requester_name)}</dd>
          <dt>状态</dt><dd>${orderedBadge(o.status)}</dd>
          <dt>合计金额</dt><dd><strong>${money(o.total_amount)}</strong></dd>
          <dt>期望到货</dt><dd>${esc(o.expected_date || "-")}</dd>
          <dt>创建 / 提交</dt><dd>${esc((o.created_at || "").replace("T", " ").slice(0, 16))}
            ${o.submitted_at ? " / " + esc(o.submitted_at.replace("T", " ").slice(0, 16)) : ""}</dd>
          <dt>备注</dt><dd>${esc(o.note || "-")}</dd>
        </dl>
        <h3 style="margin:18px 0 8px;font-size:14px">采购明细</h3>
        <table>
          <thead><tr><th>产品</th><th>规格</th><th>单位</th>
            <th class="right">数量</th><th class="right">单价</th><th class="right">金额</th></tr></thead>
          <tbody>${o.items.map((i) => `
            <tr><td>${esc(i.product_name)}</td><td class="muted">${esc(i.spec || "-")}</td>
              <td>${esc(i.unit || "-")}</td>
              <td class="right">${i.quantity}</td>
              <td class="right">${money(i.unit_price)}</td>
              <td class="right">${money(i.amount)}</td></tr>`).join("")}
            <tr><td colspan="5" class="right"><strong>合计</strong></td>
              <td class="right"><strong>${money(o.total_amount)}</strong></td></tr>
          </tbody>
        </table>
        <h3 style="margin:18px 0 8px;font-size:14px">审批流转</h3>
        <ul class="timeline">${o.logs.map((l) => `
          <li><strong>${esc(ACTION_LABEL[l.action] || l.action)}</strong>
            <span class="muted">· ${esc(l.actor_name)}</span>
            <div class="meta">${esc(l.created_at.replace("T", " ").slice(0, 16))}</div>
            ${l.comment ? `<div>${esc(l.comment)}</div>` : ""}</li>`).join("")}</ul>`,
      footerHtml: `
        ${o.status === "draft" && (isOwner || can("admin"))
          ? `<button class="btn primary" data-act="submit">提交审批</button>` : ""}
        ${canDecide ? `<button class="btn danger" data-act="reject">驳回</button>
                       <button class="btn primary" data-act="approve">批准</button>` : ""}
        ${o.status === "approved" && can("admin", "buyer")
          ? `<button class="btn primary" data-act="receive">确认收货</button>` : ""}
        ${(o.status === "draft" || o.status === "pending") && (isOwner || can("admin"))
          ? `<button class="btn" data-act="cancel">取消单据</button>` : ""}
        <button class="btn" data-cancel>关闭</button>`,
      onMount(_body, footer) {
        $("[data-cancel]", footer).addEventListener("click", closeModal);
        const actBtn = $("[data-act]", footer);
        if (actBtn) actBtn.addEventListener("click", async () => {
          const act = actBtn.dataset.act;
          try {
            if (act === "approve" || act === "reject") { openDecisionModal(id, act); return; }
            await api("POST", `/api/orders/${id}/${act}`, {});
            closeModal();
            toast("操作成功");
            switchView(state.view === "approvals" ? "approvals" : "orders");
          } catch (err) { toast(err.message, true); }
        });
      },
    });
  } catch (err) {
    openModal({ title: "出错了", bodyHtml: `<p class="error">${esc(err.message)}</p>`,
      footerHtml: `<button class="btn" data-cancel>关闭</button>`,
      onMount(_b, footer) {
        $("[data-cancel]", footer).addEventListener("click", closeModal);
      } });
  }
}

function openDecisionModal(orderId, action) {
  const isReject = action === "reject";
  openModal({
    title: isReject ? "驳回采购单" : "批准采购单",
    bodyHtml: `
      <div class="field"><label>${isReject ? "驳回理由 *" : "审批意见（可选）"}</label>
        <textarea id="decision-comment"
          placeholder="${isReject ? "请说明驳回原因，便于申请人修改" : "如：预算内，同意采购"}"></textarea></div>`,
    footerHtml: `<button class="btn" data-cancel>取消</button>
      <button class="btn ${isReject ? "danger" : "primary"}" id="decision-save">
        ${isReject ? "确认驳回" : "确认批准"}</button>`,
    onMount(body, footer) {
      $("[data-cancel]", footer).addEventListener("click", closeModal);
      $("#decision-save", footer).addEventListener("click", async () => {
        const comment = $("#decision-comment", body).value.trim();
        if (isReject && !comment) { toast("驳回必须填写理由", true); return; }
        try {
          await api("POST", `/api/orders/${orderId}/${action}`, { comment });
          closeModal();
          toast(isReject ? "已驳回" : "已批准");
          switchView(state.view === "approvals" ? "approvals" : "orders");
        } catch (err) { toast(err.message, true); }
      });
    },
  });
}

async function orderAction(orderId, action, successMessage) {
  try {
    await api("POST", `/api/orders/${orderId}/${action}`, {});
    toast(successMessage);
    switchView(state.view === "approvals" ? "approvals" : "orders");
  } catch (err) { toast(err.message, true); }
}

/* ---------------- 审批 ---------------- */

async function renderApprovals() {
  const content = $("#content");
  content.innerHTML = `<div class="card"><p class="muted">加载中…</p></div>`;
  try {
    const data = await api("GET", "/api/orders?status=pending");
    const pending = data.orders.filter((o) => o.requester_id !== state.user.id);
    const own = data.orders.filter((o) => o.requester_id === state.user.id);

    content.innerHTML = `
      <div class="card">
        <h2>待我审批（${pending.length}）</h2>
        ${!can("admin", "approver")
          ? `<p class="empty">当前角色（${esc(ROLE_LABEL[state.user.role])}）没有审批权限，仅可查看。</p>` : ""}
        ${pending.length === 0 ? `<p class="empty">没有待审批的采购单</p>` : `
        <table>
          <thead><tr><th>采购单号</th><th>供应商</th><th>申请人</th><th class="right">明细</th>
            <th class="right">金额</th><th>提交时间</th>
            ${can("admin", "approver") ? "<th>操作</th>" : ""}</tr></thead>
          <tbody>${pending.map((o) => `
            <tr>
              <td class="nowrap"><strong>${esc(o.order_no)}</strong></td>
              <td>${esc(o.vendor_name)}</td>
              <td>${esc(o.requester_name)}</td>
              <td class="right">${o.item_count} 条</td>
              <td class="right">${money(o.total_amount)}</td>
              <td class="nowrap muted">${esc((o.submitted_at || "").replace("T", " ").slice(0, 16))}</td>
              ${can("admin", "approver") ? `<td class="actions">
                <button class="btn small" data-approve-view="${o.id}">查看</button>
                <button class="btn small primary" data-approve-ok="${o.id}">批准</button>
                <button class="btn small danger" data-approve-no="${o.id}">驳回</button>
              </td>` : ""}
            </tr>`).join("")}</tbody>
        </table>`}
      </div>

      <div class="card">
        <h2>我提交的待审批（${own.length}）</h2>
        ${own.length === 0 ? `<p class="empty">没有正在等待审批的自己提交的单据</p>` : `
        <table>
          <thead><tr><th>采购单号</th><th>供应商</th><th class="right">金额</th>
            <th>提交时间</th><th></th></tr></thead>
          <tbody>${own.map((o) => `
            <tr><td class="nowrap">${esc(o.order_no)}</td>
              <td>${esc(o.vendor_name)}</td>
              <td class="right">${money(o.total_amount)}</td>
              <td class="nowrap muted">${esc((o.submitted_at || "").replace("T", " ").slice(0, 16))}</td>
              <td><button class="btn small" data-approve-view="${o.id}">查看</button></td></tr>`).join("")}
          </tbody>
        </table>`}
      </div>`;

    $$("[data-approve-view]").forEach((b) =>
      b.addEventListener("click", () => openOrderDetail(Number(b.dataset.approveView))));
    $$("[data-approve-ok]").forEach((b) =>
      b.addEventListener("click", () => openDecisionModal(b.dataset.approveOk, "approve")));
    $$("[data-approve-no]").forEach((b) =>
      b.addEventListener("click", () => openDecisionModal(b.dataset.approveNo, "reject")));
  } catch (err) {
    content.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

/* ---------------- 通用错误显示 ---------------- */

function showError(err) {
  const content = $("#content");
  content.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
}

/* ---------------- 启动 ---------------- */

function bindGlobalEvents() {
  $$("#tabs button").forEach((btn) =>
    btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $("#logout-btn").addEventListener("click", async () => {
    try { await api("POST", "/api/logout", {}); } catch (_) { /* 忽略 */ }
    state.user = null;
    showLogin();
  });
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", (e) => {
    if (e.target === $("#modal-backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal-backdrop").hidden) closeModal();
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    $("#login-error").textContent = "";
    try {
      const res = await api("POST", "/api/login", data);
      state.user = res.user;
      await loadBasics();
      showApp();
    } catch (err) {
      $("#login-error").textContent = err.message;
    }
  });

  $$(".demo-accounts .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      $("#login-form input[name=username]").value = chip.dataset.user;
      $("#login-form input[name=password]").value = chip.dataset.pass;
    }));
}

async function boot() {
  bindGlobalEvents();
  try {
    const res = await api("GET", "/api/me");
    if (res.user) {
      state.user = res.user;
      await loadBasics();
      showApp();
      return;
    }
  } catch (_) { /* 未登录 */ }
  showLogin();
}

boot();
