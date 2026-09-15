"""端到端冒烟测试：真起一个 HTTP 服务，把四个业务模块跑一遍。

运行：python3 tests/smoke_test.py
不依赖 pytest 或 requests，只用标准库。
"""

from __future__ import annotations

import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

passed = 0
failed: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed.append(f"{label} {detail}".strip())
        print(f"  ✗ {label} {detail}")


class Client:
    """带 cookie 的极简 HTTP 客户端。"""

    def __init__(self, port: int):
        self.port = port
        self.cookie = ""

    def request(self, method: str, path: str, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {"Content-Type": "application/json"}
        if self.cookie:
            headers["Cookie"] = self.cookie
        payload = json.dumps(body).encode() if body is not None else None
        conn.request(method, path, body=payload, headers=headers)
        response = conn.getresponse()
        raw = response.read()
        set_cookie = response.getheader("Set-Cookie")
        if set_cookie:
            self.cookie = set_cookie.split(";")[0]
        conn.close()
        try:
            data = json.loads(raw.decode("utf-8")) if raw else None
        except json.JSONDecodeError:
            data = raw.decode("utf-8", "replace")
        return response.status, data

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, body=None):
        return self.request("POST", path, body if body is not None else {})

    def put(self, path, body):
        return self.request("PUT", path, body)

    def delete(self, path):
        return self.request("DELETE", path)

    def login(self, username: str, password: str):
        return self.post("/api/login", {"username": username, "password": password})


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_ready(port: int, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/api/me")
            conn.getresponse().read()
            conn.close()
            return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError("服务未在预期时间内启动")


def run() -> int:
    port = free_port()
    workdir = tempfile.mkdtemp(prefix="vendor-system-test-")
    db_path = os.path.join(workdir, "test.db")
    env = {**os.environ, "VENDOR_DB": db_path, "VENDOR_PORT": str(port),
           "VENDOR_HOST": "127.0.0.1"}
    log = open(os.path.join(workdir, "server.log"), "w")
    proc = subprocess.Popen([sys.executable, "app.py"], cwd=BASE_DIR,
                            env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        wait_ready(port)
        buyer = Client(port)
        approver = Client(port)
        anon = Client(port)

        print("\n[1] 登录与鉴权")
        status, data = anon.get("/api/vendors")
        check("未登录访问接口返回 401", status == 401, f"实际 {status}")
        status, data = buyer.login("buyer", "wrong-password")
        check("错误密码被拒绝", status == 401, f"实际 {status}")
        status, data = buyer.login("buyer", "buyer123")
        check("采购员登录成功", status == 200 and data["user"]["role"] == "buyer",
              f"实际 {status}")
        status, data = approver.login("approver", "approver123")
        check("审批经理登录成功", status == 200, f"实际 {status}")
        status, data = buyer.get("/api/me")
        check("会话保持有效", status == 200 and data["user"]["username"] == "buyer")

        print("\n[2] 供应商录入")
        status, vendor = buyer.post("/api/vendors", {
            "name": "测试供应商 Alpha", "code": "TEST-CODE-001",
            "category": "测试类别", "contact": "赵六", "phone": "13000000000",
            "status": "active"})
        check("新增供应商成功", status == 201 and vendor["name"] == "测试供应商 Alpha",
              f"实际 {status} {vendor}")
        vendor_id = vendor["id"]
        status, data = buyer.post("/api/vendors", {"name": "测试供应商 Alpha"})
        check("重名供应商被拒绝（409）", status == 409, f"实际 {status}")
        status, data = buyer.post("/api/vendors", {"name": "  "})
        check("空名称被拒绝（400）", status == 400, f"实际 {status}")
        status, data = buyer.put(f"/api/vendors/{vendor_id}",
                                 {"name": "测试供应商 Alpha", "status": "paused"})
        check("修改供应商状态成功", status == 200 and data["status"] == "paused",
              f"实际 {status}")
        buyer.put(f"/api/vendors/{vendor_id}", {"status": "active"})
        status, data = buyer.get("/api/vendors?q=Alpha")
        check("按关键字搜索到供应商", status == 200 and len(data["vendors"]) == 1,
              f"实际 {status} {data}")

        print("\n[3] 供应商评分与维度")
        status, data = buyer.get("/api/dimensions")
        dims = data["dimensions"]
        check("预置了 4 个评分维度", len(dims) == 4, f"实际 {len(dims)}")
        weight_sum = sum(d["weight"] for d in dims)
        check("维度权重合计为 1", abs(weight_sum - 1.0) < 1e-9, f"实际 {weight_sum}")
        items = [{"dimension_id": d["id"], "score": 90} for d in dims]
        status, data = buyer.post(f"/api/vendors/{vendor_id}/scores",
                                  {"period": "2026-Q3", "comment": "冒烟测试", "items": items})
        check("录入评分成功且总分为 90", status == 201 and data["total_score"] == 90,
              f"实际 {status} {data}")
        score_id = data["id"]
        status, data = buyer.post(f"/api/vendors/{vendor_id}/scores",
                                  {"items": [{"dimension_id": dims[0]["id"], "score": 120}]})
        check("超过 100 分被拒绝（400）", status == 400, f"实际 {status}")
        status, data = buyer.get(f"/api/vendors/{vendor_id}/scores")
        check("评分记录带维度明细", status == 200 and len(data["scores"][0]["items"]) == 4,
              f"实际 {status}")
        status, data = approver.delete(f"/api/scores/{score_id}")
        check("审批经理不能删除他人评分（403）", status == 403, f"实际 {status}")
        status, data = buyer.post("/api/dimensions",
                                  {"name": "技术能力", "weight": 0.2})
        check("新增评分维度成功", status == 201, f"实际 {status}")
        new_dim_id = data["id"]
        status, data = buyer.delete(f"/api/dimensions/{new_dim_id}")
        check("采购员不能删除维度（403，仅管理员）", status == 403, f"实际 {status}")
        status, data = buyer.get("/api/vendors/ranking")
        ranked = [r for r in data["ranking"] if r["id"] == vendor_id]
        check("排行榜包含新供应商且均分 90",
              ranked and ranked[0]["avg_score"] == 90, f"实际 {ranked}")

        print("\n[4] 产品目录")
        status, product = buyer.post("/api/products", {
            "sku": "TEST-SKU-1", "name": "测试物料", "category": "测试类别",
            "unit": "个", "unit_price": 12.5, "vendor_id": vendor_id})
        check("新增产品成功", status == 201 and product["unit_price"] == 12.5,
              f"实际 {status} {product}")
        product_id = product["id"]
        status, data = buyer.post("/api/products", {"sku": "TEST-SKU-1", "name": "重复编码"})
        check("重复产品编码被拒绝（409）", status == 409, f"实际 {status}")
        status, data = buyer.get("/api/products?q=测试物料")
        check("产品搜索命中", status == 200 and len(data["products"]) == 1,
              f"实际 {status}")
        status, data = buyer.put(f"/api/products/{product_id}",
                                 {"unit_price": 13.0, "active": True})
        check("修改产品单价成功", status == 200 and data["unit_price"] == 13.0,
              f"实际 {status}")

        print("\n[5] 采购下单与审批")
        order_items = [
            {"product_id": product_id, "product_name": "测试物料", "unit": "个",
             "quantity": 10, "unit_price": 13.0},
            {"product_name": "自定义物料", "unit": "箱", "quantity": 2, "unit_price": 100},
        ]
        status, order = buyer.post("/api/orders", {
            "vendor_id": vendor_id, "expected_date": "2026-10-01",
            "note": "冒烟测试采购", "items": order_items})
        check("创建采购单草稿成功", status == 201 and order["status"] == "draft",
              f"实际 {status} {order}")
        check("金额由服务端计算正确（330.00）", order["total_amount"] == 330.0,
              f"实际 {order['total_amount']}")
        order_id = order["id"]
        check("采购单号形如 PO-YYYYMMDD-001",
              bool(re.fullmatch(r"PO-\d{8}-\d{3}", order["order_no"])),
              f"实际 {order['order_no']}")

        status, data = buyer.post(f"/api/orders/{order_id}/approve", {"comment": "试图自批"})
        check("采购员无审批权限（403）", status == 403, f"实际 {status}")
        status, data = approver.post("/api/orders/{}/approve".format(order_id), {})
        check("草稿不能直接批准（409）", status == 409, f"实际 {status}")
        status, data = buyer.post(f"/api/orders/{order_id}/submit", {})
        check("提交审批成功", status == 200 and data["status"] == "pending",
              f"实际 {status}")
        status, data = buyer.post(f"/api/orders/{order_id}/submit", {})
        check("重复提交被拒绝（409）", status == 409, f"实际 {status}")
        status, data = approver.post(f"/api/orders/{order_id}/approve",
                                     {"comment": "预算内，同意"})
        check("审批经理批准成功", status == 200 and data["status"] == "approved",
              f"实际 {status} {data}")
        status, data = approver.post(f"/api/orders/{order_id}/approve", {})
        check("重复批准被拒绝（409）", status == 409, f"实际 {status}")
        status, data = buyer.get(f"/api/orders/{order_id}")
        actions = [log["action"] for log in data["logs"]]
        check("审批流转日志完整",
              actions == ["create", "submit", "approve"], f"实际 {actions}")

        status, data = buyer.post(f"/api/orders/{order_id}/receive", {})
        check("已批准单据可确认收货", status == 200 and data["status"] == "received",
              f"实际 {status}")
        status, data = buyer.post(f"/api/orders/{order_id}/cancel", {})
        check("已收货单据不能取消（409）", status == 409, f"实际 {status}")

        print("\n[6] 审批权限边界")
        status, own_order = approver.post("/api/orders", {
            "vendor_id": vendor_id,
            "items": [{"product_name": "审批人试图下单", "quantity": 1, "unit_price": 1}]})
        check("审批经理不能创建采购单（403）", status == 403, f"实际 {status}")
        status, admin = Client(port).login("admin", "admin123")
        check("管理员登录成功", status == 200, f"实际 {status}")

        print("\n[7] 数据保护与看板")
        status, data = buyer.delete(f"/api/vendors/{vendor_id}")
        check("有采购单的供应商不能删除（409）", status == 409, f"实际 {status}")
        status, data = buyer.delete(f"/api/products/{product_id}")
        check("被采购单引用的产品不能删除（409）", status == 409, f"实际 {status}")
        status, data = buyer.get("/api/dashboard")
        check("看板返回统计数据",
              status == 200 and data["vendor_total"] >= 4 and data["pending_approval"] == 0,
              f"实际 {status} {data}")
        status, data = approver.get("/api/dashboard")
        check("审批经理看到自己的待办数（0）", status == 200, f"实际 {status}")

        print("\n[8] 静态页面与登出")
        status, data = buyer.get("/")
        check("首页可访问且是 HTML", status == 200 and "<!DOCTYPE html>" in data,
              f"实际 {status}")
        status, data = buyer.get("/app.js")
        check("前端脚本可访问", status == 200 and "function openModal" in data,
              f"实际 {status}")
        status, data = buyer.post("/api/logout", {})
        check("登出成功", status == 200, f"实际 {status}")
        status, data = buyer.get("/api/vendors")
        check("登出后接口返回 401", status == 401, f"实际 {status}")

        print(f"\n{'=' * 54}")
        if failed:
            print(f"失败 {len(failed)} 项 / 通过 {passed} 项")
            for item in failed:
                print("  - " + item)
            return 1
        print(f"全部通过：{passed} 项检查")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(run())
