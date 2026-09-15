"""供应商管理与采购系统 —— 零依赖 Web 服务。

只用 Python 标准库：http.server + sqlite3。
启动：python3 app.py   （默认 http://127.0.0.1:8000）
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import sys
import time
import traceback
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import db as database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.environ.get("VENDOR_DB") or database.DEFAULT_DB
HOST = os.environ.get("VENDOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("VENDOR_PORT", "8000"))

# 会话放在内存里：单进程内部工具够用，重启后重新登录即可。
SESSIONS: dict[str, dict] = {}
SESSION_TTL = 12 * 3600

ROLE_LABELS = {"admin": "管理员", "buyer": "采购员", "approver": "审批经理"}
STATUS_LABELS = {
    "draft": "草稿",
    "pending": "待审批",
    "approved": "已批准",
    "rejected": "已驳回",
    "cancelled": "已取消",
    "received": "已收货",
}
VENDOR_STATUS_LABELS = {"active": "合作中", "paused": "暂停合作", "blacklisted": "黑名单"}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


# --------------------------------------------------------------------------
# 业务逻辑
# --------------------------------------------------------------------------


class Store:
    """把 SQL 收在一处，HTTP 层只做参数校验和权限判断。"""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def conn(self) -> sqlite3.Connection:
        return database.connect(self.db_path)

    # ---- 用户 / 登录 ------------------------------------------------------

    def authenticate(self, username: str, password: str) -> dict:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
            ).fetchone()
        if row is None or not database.verify_password(password, row["password_hash"]):
            raise ApiError(HTTPStatus.UNAUTHORIZED, "用户名或密码不正确")
        return {"id": row["id"], "username": row["username"],
                "display_name": row["display_name"], "role": row["role"]}

    def user(self, user_id: int) -> dict | None:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT id, username, display_name, role FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        return row_to_dict(row)

    # ---- 供应商 ----------------------------------------------------------

    def list_vendors(self, q: str = "", status: str = "") -> list[dict]:
        sql = """
            SELECT v.*,
                   (SELECT ROUND(AVG(e.total_score), 2) FROM score_evaluations e
                     WHERE e.vendor_id = v.id) AS avg_score,
                   (SELECT COUNT(*) FROM score_evaluations e WHERE e.vendor_id = v.id)
                     AS score_count,
                   (SELECT COUNT(*) FROM purchase_orders o WHERE o.vendor_id = v.id)
                     AS order_count
              FROM vendors v WHERE 1 = 1
        """
        params: list = []
        if q:
            sql += (" AND (v.name LIKE ? OR v.code LIKE ? OR v.contact LIKE ?"
                    " OR v.category LIKE ?)")
            params += [f"%{q}%"] * 4
        if status:
            sql += " AND v.status = ?"
            params.append(status)
        sql += " ORDER BY (avg_score IS NULL), avg_score DESC, v.name"
        with self.conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_vendor(self, vendor_id: int) -> dict:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT * FROM vendors WHERE id = ?", (vendor_id,)
            ).fetchone()
        if row is None:
            raise ApiError(HTTPStatus.NOT_FOUND, "供应商不存在")
        return dict(row)

    def create_vendor(self, data: dict, actor: dict) -> dict:
        name = (data.get("name") or "").strip()
        if not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, "供应商名称不能为空")
        status = data.get("status") or "active"
        if status not in VENDOR_STATUS_LABELS:
            raise ApiError(HTTPStatus.BAD_REQUEST, "供应商状态不合法")
        ts = database.now()
        try:
            with self.conn() as conn:
                cur = conn.execute(
                    "INSERT INTO vendors (name, code, category, contact, phone, email,"
                    " address, status, note, created_by, created_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (name, data.get("code"), data.get("category"), data.get("contact"),
                     data.get("phone"), data.get("email"), data.get("address"),
                     status, data.get("note"), actor["id"], ts, ts),
                )
                vendor_id = cur.lastrowid
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, f"供应商「{name}」已存在")
        return self.get_vendor(vendor_id)

    def update_vendor(self, vendor_id: int, data: dict) -> dict:
        current = self.get_vendor(vendor_id)
        name = (data.get("name") or current["name"]).strip()
        if not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, "供应商名称不能为空")
        status = data.get("status") or current["status"]
        if status not in VENDOR_STATUS_LABELS:
            raise ApiError(HTTPStatus.BAD_REQUEST, "供应商状态不合法")
        fields = {
            "name": name,
            "code": data.get("code", current["code"]),
            "category": data.get("category", current["category"]),
            "contact": data.get("contact", current["contact"]),
            "phone": data.get("phone", current["phone"]),
            "email": data.get("email", current["email"]),
            "address": data.get("address", current["address"]),
            "status": status,
            "note": data.get("note", current["note"]),
        }
        try:
            with self.conn() as conn:
                conn.execute(
                    "UPDATE vendors SET name = ?, code = ?, category = ?, contact = ?,"
                    " phone = ?, email = ?, address = ?, status = ?, note = ?,"
                    " updated_at = ? WHERE id = ?",
                    (*fields.values(), database.now(), vendor_id),
                )
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, f"供应商「{name}」已存在")
        return self.get_vendor(vendor_id)

    def delete_vendor(self, vendor_id: int) -> None:
        self.get_vendor(vendor_id)
        with self.conn() as conn:
            used = conn.execute(
                "SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = ?", (vendor_id,)
            ).fetchone()[0]
        if used:
            raise ApiError(
                HTTPStatus.CONFLICT,
                f"该供应商已有 {used} 张采购单，不能删除；可改为「暂停合作」或「黑名单」",
            )
        with self.conn() as conn:
            conn.execute("DELETE FROM vendors WHERE id = ?", (vendor_id,))

    # ---- 评分维度 --------------------------------------------------------

    def list_dimensions(self) -> list[dict]:
        with self.conn() as conn:
            rows = conn.execute(
                "SELECT * FROM score_dimensions ORDER BY sort_order, id"
            ).fetchall()
        return [dict(r) for r in rows]

    def create_dimension(self, data: dict) -> dict:
        name = (data.get("name") or "").strip()
        if not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, "维度名称不能为空")
        weight = _as_float(data.get("weight"), 1.0)
        if weight < 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "权重不能为负数")
        with self.conn() as conn:
            max_order = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM score_dimensions"
            ).fetchone()[0]
            try:
                cur = conn.execute(
                    "INSERT INTO score_dimensions (name, weight, description, sort_order)"
                    " VALUES (?, ?, ?, ?)",
                    (name, weight, data.get("description"), max_order),
                )
            except sqlite3.IntegrityError:
                raise ApiError(HTTPStatus.CONFLICT, f"维度「{name}」已存在")
            row = conn.execute(
                "SELECT * FROM score_dimensions WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
        return dict(row)

    def update_dimension(self, dim_id: int, data: dict) -> dict:
        with self.conn() as conn:
            current = conn.execute(
                "SELECT * FROM score_dimensions WHERE id = ?", (dim_id,)
            ).fetchone()
            if current is None:
                raise ApiError(HTTPStatus.NOT_FOUND, "评分维度不存在")
            name = (data.get("name") or current["name"]).strip()
            weight = _as_float(data.get("weight"), current["weight"])
            if weight < 0:
                raise ApiError(HTTPStatus.BAD_REQUEST, "权重不能为负数")
            try:
                conn.execute(
                    "UPDATE score_dimensions SET name = ?, weight = ?, description = ?,"
                    " sort_order = ? WHERE id = ?",
                    (name, weight, data.get("description", current["description"]),
                     int(data.get("sort_order", current["sort_order"])), dim_id),
                )
            except sqlite3.IntegrityError:
                raise ApiError(HTTPStatus.CONFLICT, f"维度「{name}」已存在")
            row = conn.execute(
                "SELECT * FROM score_dimensions WHERE id = ?", (dim_id,)
            ).fetchone()
        return dict(row)

    def delete_dimension(self, dim_id: int) -> None:
        with self.conn() as conn:
            used = conn.execute(
                "SELECT COUNT(*) FROM score_items WHERE dimension_id = ?", (dim_id,)
            ).fetchone()[0]
            if used:
                raise ApiError(
                    HTTPStatus.CONFLICT,
                    f"该维度已被 {used} 条评分记录引用，不能删除",
                )
            if conn.execute(
                "DELETE FROM score_dimensions WHERE id = ?", (dim_id,)
            ).rowcount == 0:
                raise ApiError(HTTPStatus.NOT_FOUND, "评分维度不存在")

    # ---- 供应商评分 ------------------------------------------------------

    def list_scores(self, vendor_id: int) -> list[dict]:
        with self.conn() as conn:
            rows = conn.execute(
                "SELECT e.*, u.display_name AS evaluator_name FROM score_evaluations e"
                " JOIN users u ON u.id = e.evaluator_id"
                " WHERE e.vendor_id = ? ORDER BY e.created_at DESC, e.id DESC",
                (vendor_id,),
            ).fetchall()
            result = []
            for row in rows:
                item_rows = conn.execute(
                    "SELECT i.*, d.name AS dimension_name, d.weight FROM score_items i"
                    " JOIN score_dimensions d ON d.id = i.dimension_id"
                    " WHERE i.evaluation_id = ? ORDER BY d.sort_order, d.id",
                    (row["id"],),
                ).fetchall()
                entry = dict(row)
                entry["items"] = [dict(i) for i in item_rows]
                result.append(entry)
        return result

    def create_score(self, vendor_id: int, data: dict, actor: dict) -> dict:
        self.get_vendor(vendor_id)
        items = data.get("items") or []
        if not items:
            raise ApiError(HTTPStatus.BAD_REQUEST, "至少要给一个维度打分")
        dims = {d["id"]: d for d in self.list_dimensions()}
        if not dims:
            raise ApiError(HTTPStatus.BAD_REQUEST, "还没有配置评分维度")
        cleaned = []
        for item in items:
            try:
                dim_id = int(item.get("dimension_id"))
            except (TypeError, ValueError):
                raise ApiError(HTTPStatus.BAD_REQUEST, "评分维度参数不正确")
            if dim_id not in dims:
                raise ApiError(HTTPStatus.BAD_REQUEST, "评分维度不存在")
            score = _as_float(item.get("score"), None)
            if score is None or not 0 <= score <= 100:
                raise ApiError(HTTPStatus.BAD_REQUEST, "分数必须在 0 到 100 之间")
            cleaned.append((dim_id, score, item.get("comment"), dims[dim_id]["weight"]))
        total_weight = sum(c[3] for c in cleaned)
        if total_weight <= 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "所选维度的权重合计为 0，无法计算总分")
        total = sum(c[1] * c[3] for c in cleaned) / total_weight

        with self.conn() as conn:
            cur = conn.execute(
                "INSERT INTO score_evaluations (vendor_id, evaluator_id, period,"
                " comment, total_score, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (vendor_id, actor["id"], data.get("period"), data.get("comment"),
                 round(total, 2), database.now()),
            )
            for dim_id, score, comment, _ in cleaned:
                conn.execute(
                    "INSERT INTO score_items (evaluation_id, dimension_id, score, comment)"
                    " VALUES (?, ?, ?, ?)",
                    (cur.lastrowid, dim_id, score, comment),
                )
        return {"id": cur.lastrowid, "total_score": round(total, 2)}

    def delete_score(self, score_id: int, actor: dict) -> None:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT evaluator_id FROM score_evaluations WHERE id = ?", (score_id,)
            ).fetchone()
            if row is None:
                raise ApiError(HTTPStatus.NOT_FOUND, "评分记录不存在")
            if actor["role"] != "admin" and row["evaluator_id"] != actor["id"]:
                raise ApiError(HTTPStatus.FORBIDDEN, "只能删除自己录入的评分")
            conn.execute("DELETE FROM score_evaluations WHERE id = ?", (score_id,))

    def score_ranking(self) -> list[dict]:
        with self.conn() as conn:
            rows = conn.execute(
                "SELECT v.id, v.name, v.category, v.status,"
                " ROUND(AVG(e.total_score), 2) AS avg_score,"
                " COUNT(e.id) AS score_count, MAX(e.created_at) AS last_scored_at"
                " FROM vendors v LEFT JOIN score_evaluations e ON e.vendor_id = v.id"
                " GROUP BY v.id ORDER BY (avg_score IS NULL), avg_score DESC, v.name"
            ).fetchall()
        return [dict(r) for r in rows]

    # ---- 产品目录 --------------------------------------------------------

    def list_products(self, q: str = "", vendor_id: int | None = None) -> list[dict]:
        sql = ("SELECT p.*, v.name AS vendor_name, v.status AS vendor_status"
               " FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id WHERE 1 = 1")
        params: list = []
        if q:
            sql += " AND (p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?)"
            params += [f"%{q}%"] * 3
        if vendor_id:
            sql += " AND p.vendor_id = ?"
            params.append(vendor_id)
        sql += " ORDER BY p.category, p.sku"
        with self.conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def create_product(self, data: dict, actor: dict) -> dict:
        sku = (data.get("sku") or "").strip()
        name = (data.get("name") or "").strip()
        if not sku or not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, "产品编码和名称都不能为空")
        price = _as_float(data.get("unit_price"), 0.0)
        if price < 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "单价不能为负数")
        vendor_id = data.get("vendor_id") or None
        if vendor_id:
            self.get_vendor(int(vendor_id))
        ts = database.now()
        try:
            with self.conn() as conn:
                cur = conn.execute(
                    "INSERT INTO products (sku, name, category, spec, unit, unit_price,"
                    " vendor_id, active, created_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (sku, name, data.get("category"), data.get("spec"),
                     data.get("unit") or "件", price, vendor_id,
                     1 if data.get("active", True) else 0, ts, ts),
                )
                product_id = cur.lastrowid
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, f"产品编码「{sku}」已存在")
        return self.get_product(product_id)

    def get_product(self, product_id: int) -> dict:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT p.*, v.name AS vendor_name FROM products p"
                " LEFT JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?",
                (product_id,),
            ).fetchone()
        if row is None:
            raise ApiError(HTTPStatus.NOT_FOUND, "产品不存在")
        return dict(row)

    def update_product(self, product_id: int, data: dict) -> dict:
        current = self.get_product(product_id)
        sku = (data.get("sku") or current["sku"]).strip()
        name = (data.get("name") or current["name"]).strip()
        if not sku or not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, "产品编码和名称都不能为空")
        price = _as_float(data.get("unit_price"), current["unit_price"])
        if price < 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "单价不能为负数")
        vendor_id = data.get("vendor_id", current["vendor_id"]) or None
        if vendor_id:
            self.get_vendor(int(vendor_id))
        active = data.get("active", bool(current["active"]))
        try:
            with self.conn() as conn:
                conn.execute(
                    "UPDATE products SET sku = ?, name = ?, category = ?, spec = ?,"
                    " unit = ?, unit_price = ?, vendor_id = ?, active = ?, updated_at = ?"
                    " WHERE id = ?",
                    (sku, name, data.get("category", current["category"]),
                     data.get("spec", current["spec"]), data.get("unit", current["unit"]),
                     price, vendor_id, 1 if active else 0, database.now(), product_id),
                )
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, f"产品编码「{sku}」已存在")
        return self.get_product(product_id)

    def delete_product(self, product_id: int) -> None:
        self.get_product(product_id)
        with self.conn() as conn:
            used = conn.execute(
                "SELECT COUNT(*) FROM purchase_order_items WHERE product_id = ?",
                (product_id,),
            ).fetchone()[0]
            if used:
                raise ApiError(
                    HTTPStatus.CONFLICT,
                    f"该产品出现在 {used} 条采购明细中，不能删除；可改为「停用」",
                )
            conn.execute("DELETE FROM products WHERE id = ?", (product_id,))

    # ---- 采购单 ----------------------------------------------------------

    def list_orders(self, status: str = "", mine: bool = False,
                    actor: dict | None = None) -> list[dict]:
        sql = ("SELECT o.*, v.name AS vendor_name, u.display_name AS requester_name"
               " FROM purchase_orders o JOIN vendors v ON v.id = o.vendor_id"
               " JOIN users u ON u.id = o.requester_id WHERE 1 = 1")
        params: list = []
        if status:
            if status not in STATUS_LABELS:
                raise ApiError(HTTPStatus.BAD_REQUEST, "采购单状态不合法")
            sql += " AND o.status = ?"
            params.append(status)
        if mine and actor:
            sql += " AND o.requester_id = ?"
            params.append(actor["id"])
        sql += (" ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'draft' THEN 1"
                " ELSE 2 END, o.updated_at DESC")
        with self.conn() as conn:
            rows = conn.execute(sql, params).fetchall()
            orders = []
            for row in rows:
                item_count = conn.execute(
                    "SELECT COUNT(*) FROM purchase_order_items WHERE order_id = ?",
                    (row["id"],),
                ).fetchone()[0]
                entry = dict(row)
                entry["item_count"] = item_count
                entry["status_label"] = STATUS_LABELS.get(row["status"], row["status"])
                orders.append(entry)
        return orders

    def get_order(self, order_id: int) -> dict:
        with self.conn() as conn:
            row = conn.execute(
                "SELECT o.*, v.name AS vendor_name, u.display_name AS requester_name"
                " FROM purchase_orders o JOIN vendors v ON v.id = o.vendor_id"
                " JOIN users u ON u.id = o.requester_id WHERE o.id = ?",
                (order_id,),
            ).fetchone()
            if row is None:
                raise ApiError(HTTPStatus.NOT_FOUND, "采购单不存在")
            items = conn.execute(
                "SELECT * FROM purchase_order_items WHERE order_id = ? ORDER BY id",
                (order_id,),
            ).fetchall()
            logs = conn.execute(
                "SELECT l.*, u.display_name AS actor_name FROM approval_logs l"
                " JOIN users u ON u.id = l.actor_id WHERE l.order_id = ?"
                " ORDER BY l.created_at, l.id",
                (order_id,),
            ).fetchall()
        order = dict(row)
        order["status_label"] = STATUS_LABELS.get(row["status"], row["status"])
        order["items"] = [dict(i) for i in items]
        order["logs"] = [dict(l) for l in logs]
        return order

    def _next_order_no(self, conn: sqlite3.Connection) -> str:
        prefix = "PO-" + database.now()[:10].replace("-", "")
        row = conn.execute(
            "SELECT order_no FROM purchase_orders WHERE order_no LIKE ?"
            " ORDER BY order_no DESC LIMIT 1",
            (prefix + "%",),
        ).fetchone()
        seq = int(row["order_no"].split("-")[-1]) + 1 if row else 1
        return f"{prefix}-{seq:03d}"

    def create_order(self, data: dict, actor: dict) -> dict:
        vendor_id = data.get("vendor_id")
        if not vendor_id:
            raise ApiError(HTTPStatus.BAD_REQUEST, "请选择供应商")
        vendor = self.get_vendor(int(vendor_id))
        if vendor["status"] == "blacklisted":
            raise ApiError(HTTPStatus.BAD_REQUEST, "该供应商在黑名单中，不能下单")
        items = _clean_items(data.get("items") or [])
        if not items:
            raise ApiError(HTTPStatus.BAD_REQUEST, "采购单至少要有一条明细")
        total = round(sum(i[5] for i in items), 2)
        ts = database.now()
        with self.conn() as conn:
            order_no = self._next_order_no(conn)
            cur = conn.execute(
                "INSERT INTO purchase_orders (order_no, vendor_id, requester_id, status,"
                " total_amount, expected_date, note, created_at, updated_at)"
                " VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)",
                (order_no, vendor_id, actor["id"], total, data.get("expected_date"),
                 data.get("note"), ts, ts),
            )
            order_id = cur.lastrowid
            _insert_items(conn, order_id, items)
            conn.execute(
                "INSERT INTO approval_logs (order_id, actor_id, action, comment,"
                " created_at) VALUES (?, ?, 'create', ?, ?)",
                (order_id, actor["id"], f"创建草稿，共 {len(items)} 条明细", ts),
            )
        return self.get_order(order_id)

    def update_order(self, order_id: int, data: dict, actor: dict) -> dict:
        order = self.get_order(order_id)
        _require_owner_or_admin(order, actor, "只有申请人或管理员能修改采购单")
        if order["status"] != "draft":
            raise ApiError(HTTPStatus.CONFLICT, "只有草稿状态的采购单可以修改")
        vendor_id = int(data.get("vendor_id") or order["vendor_id"])
        self.get_vendor(vendor_id)
        items = _clean_items(data.get("items") or [])
        if not items:
            raise ApiError(HTTPStatus.BAD_REQUEST, "采购单至少要有一条明细")
        total = round(sum(i[5] for i in items), 2)
        with self.conn() as conn:
            conn.execute(
                "UPDATE purchase_orders SET vendor_id = ?, total_amount = ?,"
                " expected_date = ?, note = ?, updated_at = ? WHERE id = ?",
                (vendor_id, total, data.get("expected_date", order["expected_date"]),
                 data.get("note", order["note"]), database.now(), order_id),
            )
            conn.execute("DELETE FROM purchase_order_items WHERE order_id = ?", (order_id,))
            _insert_items(conn, order_id, items)
            conn.execute(
                "INSERT INTO approval_logs (order_id, actor_id, action, comment,"
                " created_at) VALUES (?, ?, 'update', ?, ?)",
                (order_id, actor["id"], "修改明细", database.now()),
            )
        return self.get_order(order_id)

    def submit_order(self, order_id: int, actor: dict) -> dict:
        order = self.get_order(order_id)
        _require_owner_or_admin(order, actor, "只有申请人或管理员能提交审批")
        if order["status"] != "draft":
            raise ApiError(HTTPStatus.CONFLICT, "只有草稿状态的采购单可以提交审批")
        self._transition(order_id, actor, "pending", "submit", "提交审批")
        return self.get_order(order_id)

    def approve_order(self, order_id: int, actor: dict, comment: str = "") -> dict:
        order = self.get_order(order_id)
        self._check_can_approve(order, actor)
        if order["status"] != "pending":
            raise ApiError(HTTPStatus.CONFLICT, "该采购单不在待审批状态")
        self._transition(order_id, actor, "approved", "approve",
                         comment or "审批通过")
        return self.get_order(order_id)

    def reject_order(self, order_id: int, actor: dict, comment: str = "") -> dict:
        order = self.get_order(order_id)
        self._check_can_approve(order, actor)
        if order["status"] != "pending":
            raise ApiError(HTTPStatus.CONFLICT, "该采购单不在待审批状态")
        if not (comment or "").strip():
            raise ApiError(HTTPStatus.BAD_REQUEST, "驳回时必须填写驳回理由")
        self._transition(order_id, actor, "rejected", "reject", comment.strip())
        return self.get_order(order_id)

    def cancel_order(self, order_id: int, actor: dict, comment: str = "") -> dict:
        order = self.get_order(order_id)
        _require_owner_or_admin(order, actor, "只有申请人或管理员能取消采购单")
        if order["status"] not in ("draft", "pending"):
            raise ApiError(HTTPStatus.CONFLICT, "已批准/已收货的采购单不能取消")
        self._transition(order_id, actor, "cancelled", "cancel", comment or "申请人取消")
        return self.get_order(order_id)

    def receive_order(self, order_id: int, actor: dict, comment: str = "") -> dict:
        order = self.get_order(order_id)
        if actor["role"] not in ("admin", "buyer"):
            raise ApiError(HTTPStatus.FORBIDDEN, "只有采购员或管理员能确认收货")
        if order["status"] != "approved":
            raise ApiError(HTTPStatus.CONFLICT, "只有已批准的采购单能确认收货")
        self._transition(order_id, actor, "received", "receive", comment or "确认收货")
        return self.get_order(order_id)

    def delete_order(self, order_id: int, actor: dict) -> None:
        order = self.get_order(order_id)
        _require_owner_or_admin(order, actor, "只有申请人或管理员能删除采购单")
        if order["status"] != "draft":
            raise ApiError(HTTPStatus.CONFLICT, "只有草稿状态的采购单可以删除")
        with self.conn() as conn:
            conn.execute("DELETE FROM purchase_orders WHERE id = ?", (order_id,))

    @staticmethod
    def _check_can_approve(order: dict, actor: dict) -> None:
        if actor["role"] not in ("admin", "approver"):
            raise ApiError(HTTPStatus.FORBIDDEN, "当前角色没有审批权限")
        if order["requester_id"] == actor["id"]:
            raise ApiError(HTTPStatus.FORBIDDEN, "不能审批自己提交的采购单")

    def _transition(self, order_id: int, actor: dict, status: str, action: str,
                    comment: str) -> None:
        ts = database.now()
        with self.conn() as conn:
            if status == "pending":
                conn.execute(
                    "UPDATE purchase_orders SET status = ?, submitted_at = ?,"
                    " updated_at = ? WHERE id = ?",
                    (status, ts, ts, order_id),
                )
            elif status in ("approved", "rejected"):
                conn.execute(
                    "UPDATE purchase_orders SET status = ?, decided_at = ?,"
                    " updated_at = ? WHERE id = ?",
                    (status, ts, ts, order_id),
                )
            else:
                conn.execute(
                    "UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?",
                    (status, ts, order_id),
                )
            conn.execute(
                "INSERT INTO approval_logs (order_id, actor_id, action, comment,"
                " created_at) VALUES (?, ?, ?, ?, ?)",
                (order_id, actor["id"], action, comment, ts),
            )

    # ---- 统计看板 --------------------------------------------------------

    def dashboard(self, actor: dict) -> dict:
        with self.conn() as conn:
            def scalar(sql: str, *params):
                return conn.execute(sql, params).fetchone()[0]

            stats = {
                "vendor_total": scalar("SELECT COUNT(*) FROM vendors"),
                "vendor_active": scalar(
                    "SELECT COUNT(*) FROM vendors WHERE status = 'active'"),
                "product_total": scalar("SELECT COUNT(*) FROM products WHERE active = 1"),
                "order_total": scalar("SELECT COUNT(*) FROM purchase_orders"),
                "pending_approval": scalar(
                    "SELECT COUNT(*) FROM purchase_orders WHERE status = 'pending'"),
                "approved_amount": scalar(
                    "SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders"
                    " WHERE status IN ('approved', 'received')"),
                "my_pending": scalar(
                    "SELECT COUNT(*) FROM purchase_orders WHERE status = 'pending'"
                    " AND requester_id <> ?", actor["id"])
                if actor["role"] in ("admin", "approver") else 0,
            }
        stats["role_label"] = ROLE_LABELS.get(actor["role"], actor["role"])
        return stats


def _as_float(value, default):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ApiError(HTTPStatus.BAD_REQUEST, f"「{value}」不是合法数字")


def _require_owner_or_admin(order: dict, actor: dict, message: str) -> None:
    if actor["role"] != "admin" and order["requester_id"] != actor["id"]:
        raise ApiError(HTTPStatus.FORBIDDEN, message)


def _clean_items(raw_items: list) -> list[tuple]:
    """把前端传来的明细规范化成可入库的元组，金额由服务端计算。"""
    cleaned = []
    for index, item in enumerate(raw_items, start=1):
        name = (item.get("product_name") or "").strip()
        if not name:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"第 {index} 条明细缺少产品名称")
        quantity = _as_float(item.get("quantity"), None)
        if quantity is None or quantity <= 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"第 {index} 条明细数量必须大于 0")
        unit_price = _as_float(item.get("unit_price"), 0.0)
        if unit_price < 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"第 {index} 条明细单价不能为负数")
        amount = round(quantity * unit_price, 2)
        cleaned.append((item.get("product_id"), name, item.get("spec"),
                        item.get("unit"), quantity, unit_price, amount))
    return cleaned


def _insert_items(conn: sqlite3.Connection, order_id: int, items: list[tuple]) -> None:
    conn.executemany(
        "INSERT INTO purchase_order_items (order_id, product_id, product_name, spec,"
        " unit, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(order_id, *item) for item in items],
    )


# --------------------------------------------------------------------------
# HTTP 层
# --------------------------------------------------------------------------

ROUTES: list[tuple[str, re.Pattern, str]] = [
    ("GET", re.compile(r"^/api/me$"), "me"),
    ("POST", re.compile(r"^/api/login$"), "login"),
    ("POST", re.compile(r"^/api/logout$"), "logout"),
    ("GET", re.compile(r"^/api/dashboard$"), "dashboard"),
    ("GET", re.compile(r"^/api/dimensions$"), "dimension_list"),
    ("POST", re.compile(r"^/api/dimensions$"), "dimension_create"),
    ("PUT", re.compile(r"^/api/dimensions/(?P<id>\d+)$"), "dimension_update"),
    ("DELETE", re.compile(r"^/api/dimensions/(?P<id>\d+)$"), "dimension_delete"),
    ("GET", re.compile(r"^/api/vendors$"), "vendor_list"),
    ("POST", re.compile(r"^/api/vendors$"), "vendor_create"),
    ("GET", re.compile(r"^/api/vendors/ranking$"), "vendor_ranking"),
    ("GET", re.compile(r"^/api/vendors/(?P<id>\d+)$"), "vendor_get"),
    ("PUT", re.compile(r"^/api/vendors/(?P<id>\d+)$"), "vendor_update"),
    ("DELETE", re.compile(r"^/api/vendors/(?P<id>\d+)$"), "vendor_delete"),
    ("GET", re.compile(r"^/api/vendors/(?P<id>\d+)/scores$"), "score_list"),
    ("POST", re.compile(r"^/api/vendors/(?P<id>\d+)/scores$"), "score_create"),
    ("DELETE", re.compile(r"^/api/scores/(?P<id>\d+)$"), "score_delete"),
    ("GET", re.compile(r"^/api/products$"), "product_list"),
    ("POST", re.compile(r"^/api/products$"), "product_create"),
    ("GET", re.compile(r"^/api/products/(?P<id>\d+)$"), "product_get"),
    ("PUT", re.compile(r"^/api/products/(?P<id>\d+)$"), "product_update"),
    ("DELETE", re.compile(r"^/api/products/(?P<id>\d+)$"), "product_delete"),
    ("GET", re.compile(r"^/api/orders$"), "order_list"),
    ("POST", re.compile(r"^/api/orders$"), "order_create"),
    ("GET", re.compile(r"^/api/orders/(?P<id>\d+)$"), "order_get"),
    ("PUT", re.compile(r"^/api/orders/(?P<id>\d+)$"), "order_update"),
    ("DELETE", re.compile(r"^/api/orders/(?P<id>\d+)$"), "order_delete"),
    ("POST", re.compile(r"^/api/orders/(?P<id>\d+)/submit$"), "order_submit"),
    ("POST", re.compile(r"^/api/orders/(?P<id>\d+)/approve$"), "order_approve"),
    ("POST", re.compile(r"^/api/orders/(?P<id>\d+)/reject$"), "order_reject"),
    ("POST", re.compile(r"^/api/orders/(?P<id>\d+)/cancel$"), "order_cancel"),
    ("POST", re.compile(r"^/api/orders/(?P<id>\d+)/receive$"), "order_receive"),
]

WRITE_ROLES = {
    "vendor_create": ("admin", "buyer"),
    "vendor_update": ("admin", "buyer"),
    "vendor_delete": ("admin",),
    "score_create": ("admin", "buyer"),
    "dimension_create": ("admin", "buyer"),
    "dimension_update": ("admin", "buyer"),
    "dimension_delete": ("admin",),
    "product_create": ("admin", "buyer"),
    "product_update": ("admin", "buyer"),
    "product_delete": ("admin",),
    "order_create": ("admin", "buyer"),
}

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "VendorSystem/1.0"
    store: Store = None  # type: ignore[assignment]

    # ---- 基础工具 --------------------------------------------------------

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cookie_token(self) -> str | None:
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return None
        morsel = cookie.get("sid")
        return morsel.value if morsel else None

    def _current_user(self) -> dict | None:
        token = self._cookie_token()
        if not token:
            return None
        session = SESSIONS.get(token)
        if session is None:
            return None
        if session["expires_at"] < time.time():
            SESSIONS.pop(token, None)
            return None
        return session["user"]

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        if length > 1_000_000:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "请求体过大")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "请求内容不是合法 JSON")
        if not isinstance(data, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "请求内容应为 JSON 对象")
        return data

    def _send_json(self, payload, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: int, message: str):
        self._send_json({"error": message}, status)

    # ---- 路由 ------------------------------------------------------------

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_HEAD(self):
        self._serve_static(self.path, head_only=True)

    def _dispatch(self, method: str):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path.startswith("/api/"):
                self._handle_api(method, path, parse_qs(parsed.query))
            elif method == "GET":
                self._serve_static(path)
            else:
                self._send_error_json(HTTPStatus.METHOD_NOT_ALLOWED, "不支持的方法")
        except ApiError as exc:
            self._send_error_json(exc.status, exc.message)
        except BrokenPipeError:
            pass
        except Exception:
            traceback.print_exc()
            self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "服务器内部错误")

    def _handle_api(self, method: str, path: str, query: dict):
        for route_method, pattern, name in ROUTES:
            match = pattern.match(path)
            if match is None:
                continue
            if route_method != method:
                raise ApiError(HTTPStatus.METHOD_NOT_ALLOWED, "该接口不支持此方法")
            self._run_action(name, match.groupdict(), query)
            return
        raise ApiError(HTTPStatus.NOT_FOUND, "接口不存在")

    def _run_action(self, name: str, params: dict, query: dict):
        handler = getattr(self, "action_" + name)

        if name == "login":
            data = self._read_json()
            user = self.store.authenticate(
                (data.get("username") or "").strip(), data.get("password") or "")
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = {"user": user, "expires_at": time.time() + SESSION_TTL}
            self.send_response(HTTPStatus.OK)
            body = json.dumps({"user": user}, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header(
                "Set-Cookie", f"sid={token}; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            self.wfile.write(body)
            return

        user = self._current_user()
        if name == "me":
            self._send_json({"user": user})
            return
        if user is None:
            raise ApiError(HTTPStatus.UNAUTHORIZED, "请先登录")

        if name == "logout":
            token = self._cookie_token()
            if token:
                SESSIONS.pop(token, None)
            self.send_response(HTTPStatus.OK)
            body = b'{"ok": true}'
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Set-Cookie", "sid=; Path=/; Max-Age=0")
            self.end_headers()
            self.wfile.write(body)
            return

        allowed = WRITE_ROLES.get(name)
        if allowed and user["role"] not in allowed:
            raise ApiError(
                HTTPStatus.FORBIDDEN,
                f"当前角色（{ROLE_LABELS.get(user['role'], user['role'])}）没有该操作权限",
            )

        handler(params, query, user)

    # ---- 各接口实现 ------------------------------------------------------

    def _query_str(self, query: dict, key: str, default: str = "") -> str:
        values = query.get(key)
        return (values[0] if values else default).strip()

    def action_dashboard(self, params, query, user):
        self._send_json(self.store.dashboard(user))

    # 供应商
    def action_vendor_list(self, params, query, user):
        data = self.store.list_vendors(
            self._query_str(query, "q"), self._query_str(query, "status"))
        self._send_json({"vendors": data})

    def action_vendor_get(self, params, query, user):
        self._send_json(self.store.get_vendor(int(params["id"])))

    def action_vendor_create(self, params, query, user):
        vendor = self.store.create_vendor(self._read_json(), user)
        self._send_json(vendor, HTTPStatus.CREATED)

    def action_vendor_update(self, params, query, user):
        self._send_json(self.store.update_vendor(int(params["id"]), self._read_json()))

    def action_vendor_delete(self, params, query, user):
        self.store.delete_vendor(int(params["id"]))
        self._send_json({"ok": True})

    def action_vendor_ranking(self, params, query, user):
        self._send_json({"ranking": self.store.score_ranking()})

    # 评分维度
    def action_dimension_list(self, params, query, user):
        self._send_json({"dimensions": self.store.list_dimensions()})

    def action_dimension_create(self, params, query, user):
        self._send_json(self.store.create_dimension(self._read_json()),
                        HTTPStatus.CREATED)

    def action_dimension_update(self, params, query, user):
        self._send_json(
            self.store.update_dimension(int(params["id"]), self._read_json()))

    def action_dimension_delete(self, params, query, user):
        self.store.delete_dimension(int(params["id"]))
        self._send_json({"ok": True})

    # 评分记录
    def action_score_list(self, params, query, user):
        self._send_json({"scores": self.store.list_scores(int(params["id"]))})

    def action_score_create(self, params, query, user):
        result = self.store.create_score(int(params["id"]), self._read_json(), user)
        self._send_json(result, HTTPStatus.CREATED)

    def action_score_delete(self, params, query, user):
        self.store.delete_score(int(params["id"]), user)
        self._send_json({"ok": True})

    # 产品
    def action_product_list(self, params, query, user):
        vendor_id = self._query_str(query, "vendor_id")
        data = self.store.list_products(
            self._query_str(query, "q"), int(vendor_id) if vendor_id else None)
        self._send_json({"products": data})

    def action_product_get(self, params, query, user):
        self._send_json(self.store.get_product(int(params["id"])))

    def action_product_create(self, params, query, user):
        self._send_json(self.store.create_product(self._read_json(), user),
                        HTTPStatus.CREATED)

    def action_product_update(self, params, query, user):
        self._send_json(self.store.update_product(int(params["id"]), self._read_json()))

    def action_product_delete(self, params, query, user):
        self.store.delete_product(int(params["id"]))
        self._send_json({"ok": True})

    # 采购单
    def action_order_list(self, params, query, user):
        mine = self._query_str(query, "mine") == "1"
        data = self.store.list_orders(self._query_str(query, "status"), mine, user)
        self._send_json({"orders": data})

    def action_order_get(self, params, query, user):
        self._send_json(self.store.get_order(int(params["id"])))

    def action_order_create(self, params, query, user):
        self._send_json(self.store.create_order(self._read_json(), user),
                        HTTPStatus.CREATED)

    def action_order_update(self, params, query, user):
        self._send_json(
            self.store.update_order(int(params["id"]), self._read_json(), user))

    def action_order_delete(self, params, query, user):
        self.store.delete_order(int(params["id"]), user)
        self._send_json({"ok": True})

    def action_order_submit(self, params, query, user):
        self._send_json(self.store.submit_order(int(params["id"]), user))

    def action_order_approve(self, params, query, user):
        data = self._read_json()
        self._send_json(
            self.store.approve_order(int(params["id"]), user, data.get("comment", "")))

    def action_order_reject(self, params, query, user):
        data = self._read_json()
        self._send_json(
            self.store.reject_order(int(params["id"]), user, data.get("comment", "")))

    def action_order_cancel(self, params, query, user):
        data = self._read_json()
        self._send_json(
            self.store.cancel_order(int(params["id"]), user, data.get("comment", "")))

    def action_order_receive(self, params, query, user):
        data = self._read_json()
        self._send_json(
            self.store.receive_order(int(params["id"]), user, data.get("comment", "")))

    # ---- 静态文件 --------------------------------------------------------

    def _serve_static(self, path: str, head_only: bool = False):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not target.startswith(STATIC_DIR) or not os.path.isfile(target):
            self._send_error_json(HTTPStatus.NOT_FOUND, "页面不存在")
            return
        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as fh:
            body = fh.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


def main() -> int:
    if not os.path.exists(DB_PATH):
        print(f"初始化数据库：{DB_PATH}")
    database.init_db(DB_PATH)
    Handler.store = Store(DB_PATH)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"供应商管理与采购系统已启动： http://{HOST}:{PORT}/")
    print("演示账号：admin/admin123（管理员） buyer/buyer123（采购员） "
          "approver/approver123（审批经理）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
