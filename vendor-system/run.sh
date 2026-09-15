#!/usr/bin/env bash
# 启动供应商管理与采购系统（默认 http://127.0.0.1:8000）
set -euo pipefail
cd "$(dirname "$0")"
exec python3 app.py
