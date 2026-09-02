# -*- coding: utf-8 -*-
"""点餐系统（menu-ordering）种子数据与订单状态机定义。"""

# 菜品种子数据：价格/库存与线上示例一致（番茄牛腩煲 68 + 水煮鱼 88 = 156）
SEED_MENU = [
    {"id": 1, "name": "番茄牛腩煲", "category": "热菜", "price": 68, "inventory": 20, "emoji": "🍲", "desc": "慢炖牛腩，番茄浓汤"},
    {"id": 2, "name": "水煮鱼", "category": "热菜", "price": 88, "inventory": 15, "emoji": "🐟", "desc": "麻辣鲜香，鲜活黑鱼"},
    {"id": 3, "name": "宫保鸡丁", "category": "热菜", "price": 42, "inventory": 30, "emoji": "🍗", "desc": "经典川味，花生酥脆"},
    {"id": 4, "name": "辣子鸡", "category": "热菜", "price": 48, "inventory": 25, "emoji": "🌶️", "desc": "外酥里嫩，麻辣干香"},
    {"id": 5, "name": "鱼香肉丝", "category": "热菜", "price": 38, "inventory": 25, "emoji": "🥢", "desc": "甜酸微辣，下饭神器"},
    {"id": 6, "name": "凉拌木耳", "category": "凉菜", "price": 22, "inventory": 18, "emoji": "🥗", "desc": "爽口开胃，蒜香浓郁"},
    {"id": 7, "name": "干煸四季豆", "category": "热菜", "price": 28, "inventory": 22, "emoji": "🫘", "desc": "干香脆嫩，麻辣适口"},
    {"id": 8, "name": "酸辣土豆丝", "category": "热菜", "price": 18, "inventory": 40, "emoji": "🥔", "desc": "酸辣爽脆，家常味道"},
    {"id": 9, "name": "米饭", "category": "主食", "price": 4, "inventory": 100, "emoji": "🍚", "desc": "东北大米"},
    {"id": 10, "name": "冰镇可乐", "category": "饮品", "price": 6, "inventory": 50, "emoji": "🥤", "desc": "330ml"},
]

# 订单状态机：每个状态只能前进到唯一下一状态，不可回退（暂无取消/退单能力）
ORDER_STEPS = ["已下单", "制作中", "待出餐", "已出餐", "已完成"]
# 状态 → [下一状态, 按钮文案]
NEXT = {
    "已下单": ["制作中", "接单"],
    "制作中": ["待出餐", "出餐"],
    "待出餐": ["已出餐", "送达"],
    "已出餐": ["已完成", "完成"],
}

# 审批拦截参数
APPROVAL_TIMEOUT = 300  # 秒，与线上 wait_for_decision(timeout=300) 一致
FRONTEND_PLACE_TIMEOUT = 60  # 前端下单请求超时（秒），超时提示「订单等待商家确认」