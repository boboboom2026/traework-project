#!/bin/bash
# ============================================================================
# 本地数据层供给脚本（无任何云服务依赖）
#
# 职责：
#   1. 启动 PostgreSQL 并创建 aiteams 库 / anon·authenticated·service_role 角色
#   2. 应用 drizzle 迁移（幂等：仅当表不存在时执行）
#   3. 安装并启动 PostgREST（提供 Supabase REST 兼容端点）
#   4. 生成 .env（含 JWT 密钥与 anon/service_role token）
#   5. 启动 supabase-proxy（把 /rest/v1/* 映射到 PostgREST）
#
# 用法：bash ./scripts/dev-local.sh
# ============================================================================
set -Eeuo pipefail

WORKSPACE_PATH="${WORKSPACE_PATH:-$(pwd)}"
cd "${WORKSPACE_PATH}"

PGRST_DIR=/opt/postgrest
PGRST_VERSION=v12.2.3
PGRST_PORT=3000
PROXY_PORT=3001
DB_NAME=aiteams
DB_USER=aiteams
DB_PASS=aiteams
DB_HOST=127.0.0.1
DB_PORT=5432

log() { echo "[dev-local] $*"; }

# ---------------------------------------------------------------- PostgreSQL
if ! pg_isready -q 2>/dev/null; then
  log "启动 PostgreSQL..."
  pg_ctlcluster 16 main start || true
  for _ in $(seq 1 20); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi
pg_isready || { log "PostgreSQL 启动失败"; exit 1; }
log "PostgreSQL 就绪"

log "配置角色与数据库..."
sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aiteams') THEN CREATE ROLE aiteams LOGIN PASSWORD 'aiteams' CREATEDB SUPERUSER; END IF;
END $$;
SQL

sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

sudo -u postgres psql -q -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO anon, authenticated, service_role, aiteams;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE aiteams IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE aiteams IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE aiteams IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

# ---------------------------------------------------------------- 迁移
# 增量幂等：把已应用的迁移文件名记录在 _drizzle_migrations，未记录的才执行。
# 注意：不能只用「users 表是否存在」判断，否则新增迁移在已有库上会被跳过。
sudo -u postgres psql -q -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS _drizzle_migrations (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

APPLIED=0
for f in $(ls drizzle/*.sql | sort); do
  tag=$(basename "${f}")
  seen=$(sudo -u postgres psql -qtAd "${DB_NAME}" -c \
    "SELECT 1 FROM _drizzle_migrations WHERE tag='${tag}'")
  if [ "${seen:-}" = "1" ]; then
    continue
  fi
  log "  -> 应用 ${f}"
  PGPASSWORD="${DB_PASS}" psql -q -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 -f "${f}" >/dev/null
  sudo -u postgres psql -q -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO _drizzle_migrations (tag) VALUES ('${tag}')"
  APPLIED=$((APPLIED + 1))
done
if [ "${APPLIED}" -eq 0 ]; then
  log "数据库迁移已是最新"
else
  log "本次应用了 ${APPLIED} 个迁移"
fi

# 让 PostgREST 重新加载 schema 缓存（新增列后必须，否则报 PGRST204）
sudo -u postgres psql -q -d "${DB_NAME}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null

# ---------------------------------------------------------------- PostgREST
if [ ! -x "${PGRST_DIR}/postgrest" ]; then
  log "安装 PostgREST ${PGRST_VERSION}..."
  mkdir -p "${PGRST_DIR}"
  curl -sL -o "${PGRST_DIR}/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-linux-static-x64.tar.xz"
  tar -xJf "${PGRST_DIR}/pgrst.tar.xz" -C "${PGRST_DIR}"
  chmod +x "${PGRST_DIR}/postgrest"
fi

# JWT 密钥（复用已有，保证 .env 与 PostgREST 一致）
SECRET_FILE="${PGRST_DIR}/.jwt-secret"
if [ ! -f "${SECRET_FILE}" ]; then
  node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' > "${SECRET_FILE}"
fi
JWT_SECRET=$(cat "${SECRET_FILE}")

CAT_ANON=$(node -e '
const crypto=require("crypto"),secret=process.argv[1];
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const iat=Math.floor(Date.now()/1000),exp=iat+60*60*24*365*10;
const h=b64({alg:"HS256",typ:"JWT"}),p=b64({role:"anon",iss:"aiteams",iat,exp});
console.log(`${h}.${p}.${crypto.createHmac("sha256",secret).update(`${h}.${p}`).digest("base64url")}`);
' "${JWT_SECRET}")
CAT_SERVICE=$(node -e '
const crypto=require("crypto"),secret=process.argv[1];
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const iat=Math.floor(Date.now()/1000),exp=iat+60*60*24*365*10;
const h=b64({alg:"HS256",typ:"JWT"}),p=b64({role:"service_role",iss:"aiteams",iat,exp});
console.log(`${h}.${p}.${crypto.createHmac("sha256",secret).update(`${h}.${p}`).digest("base64url")}`);
' "${JWT_SECRET}")

cat > "${PGRST_DIR}/aiteams.conf" <<CONF
db-uri = "postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-host = "127.0.0.1"
server-port = ${PGRST_PORT}
db-pool = 10
CONF

if ! ss -H -lnt 2>/dev/null | grep -q ":${PGRST_PORT}\b"; then
  log "启动 PostgREST (127.0.0.1:${PGRST_PORT})..."
  (cd "${PGRST_DIR}" && nohup ./postgrest aiteams.conf > postgrest.log 2>&1 &)
  for _ in $(seq 1 20); do
    ss -H -lnt 2>/dev/null | grep -q ":${PGRST_PORT}\b" && break
    sleep 1
  done
else
  log "PostgREST 已在运行"
fi

# ---------------------------------------------------------------- .env
if [ ! -f .env ]; then
  log "生成 .env..."
  cat > .env <<ENV
# ===== 数据库（Drizzle 直连） =====
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ===== REST 端点（本地 PostgREST 代理，Supabase 兼容） =====
SUPABASE_URL=http://127.0.0.1:${PROXY_PORT}
SUPABASE_ANON_KEY=${CAT_ANON}
SUPABASE_SERVICE_ROLE_KEY=${CAT_SERVICE}
POSTGREST_URL=http://127.0.0.1:${PGRST_PORT}
SUPABASE_PROXY_PORT=${PROXY_PORT}

# ===== LLM（OpenAI 兼容，留空则 AI 能力不可用，不影响登录） =====
LLM_API_KEY=
LLM_BASE_URL=
# 主力模型 / 轻量模型（留空则用内置默认，见 src/lib/llm/model-catalog.ts）
LLM_MODEL=
LLM_MODEL_LITE=

# ===== Embedding =====
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024

# ===== 图片生成 =====
IMAGE_MODEL=gpt-image-1

# ===== 网络搜索（Serper 协议） =====
SEARCH_API_KEY=
SEARCH_API_BASE=https://google.serper.dev/search

# ===== S3 对象存储（留空则文件上传功能不可用） =====
S3_ENDPOINT_URL=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_NAME=
S3_REGION=cn-beijing

# ===== 应用 =====
APP_ENV=DEV
APP_BASE_URL=http://localhost:5000
ENV
else
  log ".env 已存在，跳过生成"
fi

# ---------------------------------------------------------------- 代理
if ! ss -H -lnt 2>/dev/null | grep -q ":${PROXY_PORT}\b"; then
  log "启动 supabase-proxy (127.0.0.1:${PROXY_PORT})..."
  nohup pnpm tsx scripts/supabase-proxy.ts > /tmp/supabase-proxy.log 2>&1 &
  for _ in $(seq 1 20); do
    ss -H -lnt 2>/dev/null | grep -q ":${PROXY_PORT}\b" && break
    sleep 1
  done
else
  log "supabase-proxy 已在运行"
fi

log "本地数据层就绪：PostgreSQL ${DB_HOST}:${DB_PORT} / PostgREST ${PGRST_PORT} / 代理 ${PROXY_PORT}"
