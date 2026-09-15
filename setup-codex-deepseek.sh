#!/usr/bin/env bash
#
# 一键恢复 Codex CLI + DeepSeek 配置 + 网页终端（ttyd）。
# 容器重置后重新执行本脚本即可恢复（安装产物原本落在 ~/.codex、npm 全局目录、
# /usr/local/bin，都不在 /workspace 内，容器重启会丢失）。
#
#   bash setup-codex-deepseek.sh
#
# 使用前请导出 DeepSeek API Key（不写入本仓库）：
#   export DEEPSEEK_API_KEY=sk-...
#
# 可选环境变量：
#   CODEX_MODEL      默认 deepseek-flash
#   TTYD_PORT        网页终端端口，默认 7681
#   WORKDIR          网页终端工作目录，默认 /workspace
#
# 注意：网页终端本身不再设密码，认证交给 Trae 预览代理（requires_auth=true）。
# 原因是预览代理与 ttyd 各要一次密码会造成 iframe 内认证弹窗被拦截、页面空白。
#
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CODEX_MODEL="${CODEX_MODEL:-deepseek-flash}"
DEEPSEEK_BASE_URL="https://api.deepseek.com/"
PROVIDER_ID="deepseek"
OFFICIAL_SETUP_URL="https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.sh"
TTYD_PORT="${TTYD_PORT:-7681}"
WORKDIR="${WORKDIR:-/workspace}"

echo "==> 1/4 安装 Codex CLI"
if command -v codex >/dev/null 2>&1; then
  echo "    已安装：$(codex --version)"
else
  npm install -g @openai/codex
  echo "    已安装：$(codex --version)"
fi

echo "==> 2/4 写入模型目录 $CODEX_HOME/models.json"
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

echo "==> 3/4 写入 $CODEX_HOME/config.toml"
if [ -f "$CODEX_HOME/config.toml" ]; then
  cp "$CODEX_HOME/config.toml" "$CODEX_HOME/config.toml.bak"
  echo "    已备份原配置到 config.toml.bak"
fi

# 提供了 DEEPSEEK_API_KEY 就写入 token（DeepSeek 官方做法，之后无需再设环境变量）；
# 未提供则回退到 env_key，运行时从环境变量读取。
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  case "$DEEPSEEK_API_KEY" in
    sk-*) AUTH_LINE="experimental_bearer_token = \"$DEEPSEEK_API_KEY\"" ;;
    *)    echo "    DEEPSEEK_API_KEY 不以 sk- 开头，中止"; exit 1 ;;
  esac
else
  AUTH_LINE='env_key = "DEEPSEEK_API_KEY"'
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
$AUTH_LINE

# 预先信任工作目录，免去首次进入时要按的「是否信任」提示（面向不熟悉命令行的使用者）
[projects."$WORKDIR"]
trust_level = "trusted"
EOF

echo "==> 4/4 启动网页终端（ttyd）"
# Codex 的交互 TUI 需要真 TTY；沙箱内的 Agent shell 是 TERM=dumb + stdin=EOF，起不来。
# 用 ttyd 包一个真终端，浏览器里即可正常跑 codex。
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -lnt 2>/dev/null | grep -q ":${TTYD_PORT} "
  else
    netstat -lnt 2>/dev/null | grep -q ":${TTYD_PORT} "
  fi
}

if port_busy; then
  echo "    端口 ${TTYD_PORT} 已在监听，跳过启动"
else
  if ! command -v ttyd >/dev/null 2>&1; then
    echo "    未安装 ttyd，从 GitHub Releases 下载..."
    TAG="$(curl -sSL -m 30 -o /dev/null -w '%{url_effective}' \
      https://github.com/tsl0922/ttyd/releases/latest 2>/dev/null | sed 's|.*/tag/||')"
    if [ -n "$TAG" ] && curl -fsSL -m 180 -o /tmp/ttyd.new \
        "https://github.com/tsl0922/ttyd/releases/download/${TAG}/ttyd.x86_64" 2>/dev/null; then
      install -m 0755 /tmp/ttyd.new /usr/local/bin/ttyd && rm -f /tmp/ttyd.new
    else
      echo "    ttyd 下载失败（检查网络/代理），跳过网页终端；CLI 不受影响"
    fi
  fi

  if command -v ttyd >/dev/null 2>&1; then
    # 直接进 Codex 交互界面（面向不熟悉命令行的使用者）；退出后落到普通 shell 兜底。
    # 用绝对路径，避免网页终端的 login shell 里 PATH 找不到 codex。
    CODEX_BIN="$(command -v codex)"
    nohup ttyd -p "$TTYD_PORT" -W \
      -t "titleFixed=Codex (DeepSeek)" -t fontSize=14 \
      -w "$WORKDIR" bash -lc "'$CODEX_BIN'; echo; echo '[Codex 已退出] 下面是一个普通终端：'; exec bash -l" \
      >/tmp/ttyd.log 2>&1 &
    sleep 1
    if port_busy; then
      echo "    已启动：http://localhost:${TTYD_PORT}/（打开即进入 Codex）"
      echo "    浏览器访问需让 Agent 对该端口执行 OpenPreview（脚本无法注册预览）"
    else
      echo "    启动失败，日志：/tmp/ttyd.log"
    fi
  fi
fi

echo
echo "完成。当前模型：$CODEX_MODEL"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  echo "已检测到 DEEPSEEK_API_KEY，可直接运行：codex"
else
  echo "尚未设置 DEEPSEEK_API_KEY，请先执行：export DEEPSEEK_API_KEY=sk-..."
fi
