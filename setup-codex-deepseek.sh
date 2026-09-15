#!/usr/bin/env bash
#
# 一键恢复 Codex CLI + DeepSeek 配置。
# 容器重置后重新执行本脚本即可恢复（安装产物原本落在 ~/.codex 与 npm 全局目录，
# 都不在 /workspace 内，容器重启会丢失）。
#
#   bash setup-codex-deepseek.sh
#
# 使用前请导出 DeepSeek API Key（不写入本仓库）：
#   export DEEPSEEK_API_KEY=sk-...
#
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CODEX_MODEL="${CODEX_MODEL:-deepseek-flash}"
DEEPSEEK_BASE_URL="https://api.deepseek.com/"
PROVIDER_ID="deepseek"
OFFICIAL_SETUP_URL="https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.sh"

echo "==> 1/3 安装 Codex CLI"
if command -v codex >/dev/null 2>&1; then
  echo "    已安装：$(codex --version)"
else
  npm install -g @openai/codex
  echo "    已安装：$(codex --version)"
fi

echo "==> 2/3 写入模型目录 $CODEX_HOME/models.json"
mkdir -p "$CODEX_HOME"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsSL "$OFFICIAL_SETUP_URL" -o "$tmp"
sed -n "/<<'CODEX_MODELS_JSON'/,/^CODEX_MODELS_JSON\$/p" "$tmp" | sed '1d;$d' > "$CODEX_HOME/models.json"

# 校验：必须恰好包含官方两个模型
for slug in deepseek-flash deepseek-v4-pro; do
  grep -q "\"slug\": \"$slug\"" "$CODEX_HOME/models.json" \
    || { echo "    models.json 缺少 $slug，中止"; exit 1; }
done
echo "    已写入 deepseek-flash / deepseek-v4-pro"

echo "==> 3/3 写入 $CODEX_HOME/config.toml"
if [ -f "$CODEX_HOME/config.toml" ]; then
  cp "$CODEX_HOME/config.toml" "$CODEX_HOME/config.toml.bak"
  echo "    已备份原配置到 config.toml.bak"
fi

cat > "$CODEX_HOME/config.toml" <<EOF
# Codex 使用 DeepSeek 作为模型后端
# 配置依据：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
# wire_api 必须是 "responses"（DeepSeek 原生支持 Responses API）；写成 "chat" 会让 Codex 无法启动。

model = "$CODEX_MODEL"
model_provider = "$PROVIDER_ID"
preferred_auth_method = "apikey"
forced_login_method = "api"
web_search = "disabled"
model_catalog_json = "~/.codex/models.json"

[model_providers.$PROVIDER_ID]
name = "$PROVIDER_ID"
base_url = "$DEEPSEEK_BASE_URL"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
EOF

echo
echo "完成。当前模型：$CODEX_MODEL"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  echo "已检测到 DEEPSEEK_API_KEY，可直接运行：codex"
else
  echo "尚未设置 DEEPSEEK_API_KEY，请先执行：export DEEPSEEK_API_KEY=sk-..."
fi
