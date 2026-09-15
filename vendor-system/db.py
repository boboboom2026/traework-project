"""数据库结构、初始化与口令散列。

零依赖：只用 Python 标准库 sqlite3。
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(BASE_DIR, "data", "app.db")

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'buyer', 'approver')),
    password_hash TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    code        TEXT,
    category    TEXT,
    contact     TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'blacklisted')),
    note        TEXT,
    created_by  INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS score_dimensions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    weight      REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS score_evaluations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id    INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    evaluator_id INTEGER NOT NULL REFERENCES users(id),
    period       TEXT,
    comment      TEXT,
    total_score  REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS score_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL REFERENCES score_evaluations(id) ON DELETE CASCADE,
    dimension_id  INTEGER NOT NULL REFERENCES score_dimensions(id),
    score         REAL NOT NULL CHECK (score >= 0 AND score <= 100),
    comment       TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sku        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    category   TEXT,
    spec       TEXT,
    unit       TEXT NOT NULL DEFAULT '件',
    unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    vendor_id  INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no      TEXT NOT NULL UNIQUE,
    vendor_id     INTEGER NOT NULL REFERENCES vendors(id),
    requester_id  INTEGER NOT NULL REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending', 'approved',
                                    'rejected', 'cancelled', 'received')),
    total_amount  REAL NOT NULL DEFAULT 0,
    expected_date TEXT,
    note          TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    submitted_at  TEXT,
    decided_at    TEXT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    spec         TEXT,
    unit         TEXT,
    quantity     REAL NOT NULL DEFAULT 0 CHECK (quantity > 0),
    unit_price   REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    amount       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS approval_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    actor_id   INTEGER NOT NULL REFERENCES users(id),
    action     TEXT NOT NULL,
    comment    TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_vendor ON score_evaluations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order ON approval_logs(order_id);
"""


def now() -> str:
    """UTC 时间戳，统一走 ISO 8601。"""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"pbkdf2_sha256$120000${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iterations)
        ).hex()
        return hmac.compare_digest(digest, expected)
    except (ValueError, AttributeError):
        return False


USERS = [
    ("admin", "系统管理员", "admin", "admin123"),
    ("buyer", "采购员", "buyer", "buyer123"),
    ("approver", "审批经理", "approver", "approver123"),
]

DIMENSIONS = [
    ("价格竞争力", 0.30, "报价与市场价的对比、议价空间"),
    ("交付准时率", 0.25, "历史订单是否按期交付"),
    ("质量合格率", 0.30, "来料检验合格比例、退换货情况"),
    ("服务响应", 0.15, "沟通效率、售后与问题处理速度"),
]

VENDORS = [
    ("华东精密制造有限公司", "91310000MA1K3QX78X", "金属结构件", "王磊",
     "13800001111", "sales@hdjm.example.com", "上海市嘉定区工业路 88 号",
     "active", "合作 3 年，主力供应商"),
    ("南方电子元件厂", "91440300MA5EU9YT2B", "电子元器件", "陈静",
     "13900002222", "contact@nfdz.example.com", "深圳市宝安区科技园 12 栋",
     "active", "交期稳定，价格偏高"),
    ("北方包装材料有限公司", "91110108MA01Y6XL9K", "包装耗材", "李强",
     "13700003333", "info@bfbz.example.com", "北京市大兴区物流园 A3",
     "paused", "去年有一次延期，观察中"),
]

PRODUCTS = [
    ("P-1001", "不锈钢支架 A 型", "金属结构件", "304 不锈钢 / 120mm", "个", 45.00, 1),
    ("P-1002", "不锈钢支架 B 型", "金属结构件", "304 不锈钢 / 200mm", "个", 62.50, 1),
    ("P-2001", "贴片电阻 0805 10kΩ", "电子元器件", "1% 精度 / 5k 盘", "盘", 38.00, 2),
    ("P-2002", "电解电容 470uF", "电子元器件", "25V / 105℃", "只", 0.85, 2),
    ("P-3001", "五层瓦楞纸箱", "包装耗材", "600×400×400mm", "个", 6.80, 3),
    ("P-3002", "珍珠棉内衬", "包装耗材", "500×300×20mm", "张", 1.20, 3),
]


def init_db(db_path: str = DEFAULT_DB, seed: bool = True) -> sqlite3.Connection:
    conn = connect(db_path)
    conn.executescript(SCHEMA)
    if seed:
        _seed(conn)
    conn.commit()
    return conn


def _seed(conn: sqlite3.Connection) -> None:
    """只在空库里灌演示数据，重复调用不会产生重复记录。"""
    ts = now()

    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        for username, display_name, role, password in USERS:
            conn.execute(
                "INSERT INTO users (username, display_name, role, password_hash, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (username, display_name, role, hash_password(password), ts),
            )

    if conn.execute("SELECT COUNT(*) FROM score_dimensions").fetchone()[0] == 0:
        for order, (name, weight, desc) in enumerate(DIMENSIONS):
            conn.execute(
                "INSERT INTO score_dimensions (name, weight, description, sort_order)"
                " VALUES (?, ?, ?, ?)",
                (name, weight, desc, order),
            )

    if conn.execute("SELECT COUNT(*) FROM vendors").fetchone()[0] == 0:
        admin_id = conn.execute(
            "SELECT id FROM users WHERE username = 'admin'"
        ).fetchone()[0]
        for name, code, category, contact, phone, email, address, status, note in VENDORS:
            conn.execute(
                "INSERT INTO vendors (name, code, category, contact, phone, email,"
                " address, status, note, created_by, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, code, category, contact, phone, email, address, status, note,
                 admin_id, ts, ts),
            )

    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        for sku, name, category, spec, unit, price, vendor_id in PRODUCTS:
            conn.execute(
                "INSERT INTO products (sku, name, category, spec, unit, unit_price,"
                " vendor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (sku, name, category, spec, unit, price, vendor_id, ts, ts),
            )

    if conn.execute("SELECT COUNT(*) FROM score_evaluations").fetchone()[0] == 0:
        buyer_id = conn.execute(
            "SELECT id FROM users WHERE username = 'buyer'"
        ).fetchone()[0]
        dims = conn.execute(
            "SELECT id, weight FROM score_dimensions ORDER BY sort_order"
        ).fetchall()
        demo = {
            1: [92, 88, 95, 85],
            2: [78, 93, 84, 80],
            3: [85, 70, 80, 75],
        }
        for vendor_id, scores in demo.items():
            total = sum(s * d["weight"] for s, d in zip(scores, dims))
            cur = conn.execute(
                "INSERT INTO score_evaluations (vendor_id, evaluator_id, period,"
                " comment, total_score, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (vendor_id, buyer_id, "2026-Q3", "系统初始化演示评分",
                 round(total, 2), ts),
            )
            for dim, score in zip(dims, scores):
                conn.execute(
                    "INSERT INTO score_items (evaluation_id, dimension_id, score)"
                    " VALUES (?, ?, ?)",
                    (cur.lastrowid, dim["id"], score),
                )


if __name__ == "__main__":
    db = init_db()
    print(f"已初始化数据库：{DEFAULT_DB}")
    db.close()
