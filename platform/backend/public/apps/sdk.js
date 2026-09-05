/*!
 * AppSDK —— 应用运行时前端 SDK（阶段 3）
 * 任意 H5 应用引入本文件即可获得：
 *   - getContext():   身份（app/tenant/role/权限）
 *   - setRole(pin):   商家/管理员签发（X-Role + X-PIN）
 *   - data.*:         租户数据域 CRUD
 *   - approvals.*:    提交审批 / 商家决策（审批门闭环）
 *   - runFlow():      推进该应用×租户的流程实例（业务支撑主路径）
 *   - runCrew():      调用底座编排引擎
 *
 * 上下文解析优先级：window.APP_CONFIG > URL /app/{app}/{tenant}/...
 * 无法解析上下文时优雅降级（返回拒绝 + 清晰提示），不阻塞页面渲染。
 */
(function (global) {
  "use strict";

  function parseBase() {
    if (global.APP_CONFIG && global.APP_CONFIG.app_id && global.APP_CONFIG.tenant_id) {
      return { app_id: global.APP_CONFIG.app_id, tenant_id: global.APP_CONFIG.tenant_id };
    }
    var m = (global.location && global.location.pathname || "").match(/^\/app\/([a-z0-9-]+)\/([a-zA-Z0-9_-]+)/);
    if (m) return { app_id: m[1], tenant_id: m[2] };
    // 页面以 /app/{app}/{tenant}/xxx.html 形式访问时已覆盖；否则尝试从查询参数兜底
    var q = new URLSearchParams(global.location && global.location.search || "");
    if (q.get("app_id") && q.get("tenant_id")) {
      return { app_id: q.get("app_id"), tenant_id: q.get("tenant_id") };
    }
    return null;
  }

  var base = parseBase();
  var role = "customer";

  function contextRequired() {
    if (!base) throw new Error("AppSDK：无法解析应用上下文（缺少 /app/{app}/{tenant} URL 或 window.APP_CONFIG）");
    return "/api/app-gateway/" + encodeURIComponent(base.app_id) + "/" + encodeURIComponent(base.tenant_id);
  }

  function headers(extra) {
    var h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if (role && role !== "customer") h["X-Role"] = role;
    if (role && role !== "customer" && global.__APP_PIN__) h["X-PIN"] = global.__APP_PIN__;
    return h;
  }

  function request(method, path, body) {
    return fetch(contextRequired() + path, {
      method: method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.detail) || ("请求失败：" + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }).catch(function (e) {
      if (e && e.status) throw e;
      throw new Error("网络错误或后端不可用：" + e.message);
    });
  }

  var SDK = {
    ready: !!base,
    context: base,
    getContext: function () { return request("GET", "/context"); },
    setRole: function (nextRole, pin) {
      role = nextRole === "merchant" || nextRole === "admin" ? nextRole : "customer";
      if (pin) global.__APP_PIN__ = pin;
      return SDK.getContext();
    },
    // ---------- 数据域 ----------
    data: {
      list: function (collection) { return request("GET", "/data/" + encodeURIComponent(collection)); },
      create: function (collection, record) { return request("POST", "/data/" + encodeURIComponent(collection), record); },
      update: function (collection, id, patch) { return request("PUT", "/data/" + encodeURIComponent(collection) + "/" + encodeURIComponent(id), patch); },
      remove: function (collection, id) { return request("DELETE", "/data/" + encodeURIComponent(collection) + "/" + encodeURIComponent(id)); },
    },
    // ---------- 审批 ----------
    approvals: {
      list: function () { return request("GET", "/approvals"); },
      submit: function (collection, payload, opts) {
        return request("POST", "/approvals/submit", Object.assign({
          collection: collection, payload: payload || {},
        }, opts || {}));
      },
      decide: function (approvalId, decision, reason) {
        return request("POST", "/approvals/" + encodeURIComponent(approvalId) + "/decide", {
          decision: decision, reason: reason || "",
        });
      },
    },
    // ---------- 流程 / 编排 ----------
    flowStatus: function () { return request("GET", "/flow"); },
    runFlow: function (input, opts) { return request("POST", "/runFlow", Object.assign({ input: input || "" }, opts || {})); },
    runCrew: function (crewId, input) { return request("POST", "/runCrew", { crew_id: crewId, input: input || "" }); },
  };

  global.AppSDK = SDK;
})(window);