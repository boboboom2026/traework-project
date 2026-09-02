# -*- coding: utf-8 -*-
"""CrewAI 官方工具适配层（平台内置 · 零外部依赖）。

背景：官方 crewAI-tools 强依赖 crewai 主包（要求 Python <3.14），当前环境为 Python 3.14，
无法直接安装运行。本模块以官方「工具清单」为蓝本，在平台内自建适配层：

  状态策略：
    local      → 平台本地实现（文件/目录/网页/文档检索等），开箱即用
    key:ENV    → 需 API Key 的真实 HTTP 工具：读环境变量，有 Key 即真实调用，无 Key 返回配置提示
    stub       → 依赖第三方 SDK / 数据库 / 商业服务，未接入：展示清单，调用返回说明

接入方式：build_crewai_tools() 合并进平台工具目录（engine.build_tools）。
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

from agent_framework import Tool

# =====================================================================
# 官方工具清单（依据 crewAIInc/crewAI-tools 仓库 tools/ 目录整理）
# (工具名, 说明, 分类, 状态, 所需密钥/依赖, 参数名)
# =====================================================================
CREWAI_TOOL_SPECS: List[Tuple[str, str, str, str, str, str]] = [
    # ============ 官方工具·本地真实实现（16）============
    # FileReadTool / FileWriterTool / DirectoryReadTool / DirectorySearchTool
    ("file_read", "读取本地文件内容（支持按行读取）", "文档与知识", "local", "", "file_path"),
    ("file_write", "写入/创建本地文件", "文档与知识", "local", "", "content"),
    ("directory_read", "列出目录下的文件清单", "文档与知识", "local", "", "directory"),
    ("directory_search", "在指定目录内按关键词搜索文件内容", "文档与知识", "local", "", "directory"),
    # TXTSearchTool / JSONSearchTool / CSVSearchTool / MDXSearchTool / XMLSearchTool
    ("txt_search", "搜索 .txt 文件内容（关键词命中 + 上下文）", "文档与知识", "local", "", "file_path"),
    ("json_search", "搜索 JSON 文件内容（关键词命中 + 上下文）", "文档与知识", "local", "", "file_path"),
    ("csv_search", "搜索 CSV 文件内容（关键词命中行）", "文档与知识", "local", "", "file_path"),
    ("mdx_search", "搜索 Markdown 文件内容（关键词命中 + 上下文）", "文档与知识", "local", "", "file_path"),
    ("xml_search", "搜索 XML 文件内容（关键词命中 + 上下文）", "文档与知识", "local", "", "file_path"),
    # CodeInterpreterTool
    ("code_interpreter", "在受限沙箱中执行 Python 代码（真实）", "数据与计算", "local", "", "code"),
    # ScrapeWebsiteTool / ScrapeElementFromWebsiteTool / WebsiteSearchTool
    ("scrape_website", "抓取网页正文文本（真实 http 请求）", "网页抓取", "local", "", "url"),
    ("scrape_element", "抓取网页中指定标签/类的文本片段", "网页抓取", "local", "", "url"),
    ("website_search", "抓取指定网站并按关键词过滤内容", "网页抓取", "local", "", "url"),
    # ArxivPaperTool / JinaScrapeWebsiteTool / RagTool（平台 RAG 检索）
    ("arxiv_search", "搜索 arXiv 学术论文（真实 API，无需 Key）", "搜索与信息", "local", "", "query"),
    ("jina_scrape", "通过 Jina Reader 抓取网页转 Markdown（免费，无需 Key）", "网页抓取", "local", "", "url"),
    ("rag_search", "检索平台企业知识库（RAG 检索接口）", "文档与知识", "local", "", "query"),

    # ============ 官方工具·需 API Key 的真实 HTTP 工具（10）============
    # SerperDevTool / TavilySearchTool / TavilyExtractorTool
    ("serper_search", "Serper 搜索引擎（Google 结果，真实）", "搜索与信息", "key:SERPER_API_KEY", "SERPER_API_KEY", "query"),
    ("tavily_search", "Tavily AI 搜索（真实）", "搜索与信息", "key:TAVILY_API_KEY", "TAVILY_API_KEY", "query"),
    ("tavily_extractor", "Tavily 网页提取器（真实）", "网页抓取", "key:TAVILY_API_KEY", "TAVILY_API_KEY", "url"),
    # BraveSearchTool / FirecrawlSearchTool / FirecrawlScrapeWebsiteTool
    ("brave_search", "Brave 网页搜索（真实）", "搜索与信息", "key:BRAVE_API_KEY", "BRAVE_API_KEY", "query"),
    ("firecrawl_search", "Firecrawl 搜索（真实）", "搜索与信息", "key:FIRECRAWL_API_KEY", "FIRECRAWL_API_KEY", "query"),
    ("firecrawl_scrape", "Firecrawl 网页抓取（真实）", "网页抓取", "key:FIRECRAWL_API_KEY", "FIRECRAWL_API_KEY", "url"),
    # GithubSearchTool / SerpApiGoogleSearchTool / LinkupSearchTool / EXASearchTool
    ("github_search", "GitHub 代码/仓库搜索（真实，读 GH_TOKEN）", "搜索与信息", "key:GITHUB_TOKEN", "GITHUB_TOKEN", "query"),
    ("serpapi_search", "SerpAPI Google 搜索（真实）", "搜索与信息", "key:SERPAPI_API_KEY", "SERPAPI_API_KEY", "query"),
    ("linkup_search", "Linkup 搜索（真实）", "搜索与信息", "key:LINKUP_API_KEY", "LINKUP_API_KEY", "query"),
    ("exa_search", "Exa 神经搜索（真实）", "搜索与信息", "key:EXA_API_KEY", "EXA_API_KEY", "query"),

    # ============ 官方工具·占位（依赖第三方 SDK/数据库/商业服务，59）============
    # ---- 文档与知识 ----
    ("docx_search", "搜索 Word 文档内容", "文档与知识", "stub", "需 python-docx", "file_path"),
    ("pdf_search", "搜索 PDF 文档内容", "文档与知识", "stub", "需 pypdf/pdfplumber", "file_path"),
    ("code_docs_search", "搜索代码文档库（embeddings）", "文档与知识", "stub", "需 embedding 服务", "query"),
    ("file_compressor", "文件压缩", "文档与知识", "stub", "需压缩依赖", "file_path"),
    # ---- 数据与计算（数据库 / 向量库）----
    ("mysql_search", "MySQL 数据库查询", "数据与计算", "stub", "需 MySQL 连接配置", "query"),
    ("pg_search", "PostgreSQL 数据库查询", "数据与计算", "stub", "需 PG 连接配置", "query"),
    ("mongodb_search", "MongoDB 向量检索", "数据与计算", "stub", "需 MongoDB 连接", "query"),
    ("snowflake_search", "Snowflake 数据仓库查询", "数据与计算", "stub", "需 Snowflake 凭据", "query"),
    ("databricks_query", "Databricks SQL 查询", "数据与计算", "stub", "需 Databricks 凭据", "query"),
    ("couchbase_search", "Couchbase FTS/向量检索", "数据与计算", "stub", "需 Couchbase 连接", "query"),
    ("singlestore_search", "SingleStore 检索", "数据与计算", "stub", "需 SingleStore 连接", "query"),
    ("qdrant_search", "Qdrant 向量检索", "数据与计算", "stub", "需 Qdrant 连接", "query"),
    ("weaviate_search", "Weaviate 向量检索", "数据与计算", "stub", "需 Weaviate 连接", "query"),
    ("nl2sql", "自然语言转 SQL 查询", "数据与计算", "stub", "需 LLM + 数据库", "query"),
    # ---- 内容与生成 ----
    ("dalle_image", "DALL·E 图像生成", "内容与生成", "stub", "需 OPENAI_API_KEY", "prompt"),
    ("vision_analyze", "图像视觉理解", "内容与生成", "stub", "需 OPENAI_API_KEY", "image_path"),
    ("ocr_tool", "图片文字识别（OCR）", "内容与生成", "stub", "需 OCR 依赖", "image_path"),
    ("youtube_channel_search", "YouTube 频道视频检索", "内容与生成", "stub", "需 YOUTUBE_API_KEY", "query"),
    ("youtube_video_search", "YouTube 视频检索", "内容与生成", "stub", "需 YOUTUBE_API_KEY", "query"),
    # ---- 网页抓取 ----
    ("selenium_scraping", "Selenium 浏览器自动化抓取", "网页抓取", "stub", "需 selenium + 浏览器", "url"),
    ("browserbase_load", "Browserbase 云浏览器加载", "网页抓取", "stub", "需 BROWSERBASE_API_KEY", "url"),
    ("hyperbrowser_load", "Hyperbrowser 浏览器加载", "网页抓取", "stub", "需 HYPERBROWSER_API_KEY", "url"),
    ("stagehand", "Stagehand 浏览器自动化", "网页抓取", "stub", "需 Stagehand 依赖", "url"),
    ("firecrawl_crawl", "Firecrawl 整站爬取", "网页抓取", "stub", "需 FIRECRAWL_API_KEY", "url"),
    ("scrapfly_scrape", "Scrapfly 网页抓取", "网页抓取", "stub", "需 SCRAPFLY_API_KEY", "url"),
    ("scrapegraph_scrape", "ScrapeGraph AI 抓取", "网页抓取", "stub", "需 SCRAPEGRAPH_API_KEY", "url"),
    ("spider_scrape", "Spider 网页抓取", "网页抓取", "stub", "需 SPIDER_API_KEY", "url"),
    ("brightdata_dataset", "BrightData 数据集", "网页抓取", "stub", "需 BRIGHTDATA_API_TOKEN", "query"),
    ("brightdata_search", "BrightData 搜索", "网页抓取", "stub", "需 BRIGHTDATA_API_TOKEN", "query"),
    ("brightdata_unlocker", "BrightData 网页解锁", "网页抓取", "stub", "需 BRIGHTDATA_API_TOKEN", "url"),
    ("oxylabs_universal", "Oxylabs 通用抓取", "网页抓取", "stub", "需 OXYLABS 凭据", "url"),
    ("oxylabs_amazon_product", "Oxylabs Amazon 商品抓取", "网页抓取", "stub", "需 OXYLABS 凭据", "query"),
    ("oxylabs_amazon_search", "Oxylabs Amazon 搜索抓取", "网页抓取", "stub", "需 OXYLABS 凭据", "query"),
    ("oxylabs_google_search", "Oxylabs Google 搜索抓取", "网页抓取", "stub", "需 OXYLABS 凭据", "query"),
    ("serper_scrape", "Serper 网页抓取", "网页抓取", "stub", "需 SERPER_API_KEY", "url"),
    ("serply_markdown", "Serply 网页转 Markdown", "网页抓取", "stub", "需 SERPLY_API_KEY", "url"),
    # ---- 搜索与信息 ----
    ("serply_web", "Serply 网页搜索", "搜索与信息", "stub", "需 SERPLY_API_KEY", "query"),
    ("serply_news", "Serply 新闻搜索", "搜索与信息", "stub", "需 SERPLY_API_KEY", "query"),
    ("serply_job", "Serply 职位搜索", "搜索与信息", "stub", "需 SERPLY_API_KEY", "query"),
    ("serply_scholar", "Serply 学术搜索", "搜索与信息", "stub", "需 SERPLY_API_KEY", "query"),
    ("serpapi_shopping", "SerpAPI Google 购物搜索", "搜索与信息", "stub", "需 SERPAPI_API_KEY", "query"),
    # ---- 自动化与平台 ----
    ("apify_actors", "Apify Actor 运行", "自动化与平台", "stub", "需 APIFY_API_TOKEN", "actor"),
    ("composio", "Composio 集成 300+ 应用", "自动化与平台", "stub", "需 COMPOSIO_API_KEY", "action"),
    ("zapier_action", "Zapier 动作执行", "自动化与平台", "stub", "需 Zapier NLA", "action"),
    ("multion", "MultiOn 浏览器代理", "自动化与平台", "stub", "需 MULTION_API_KEY", "prompt"),
    ("crewai_platform", "CrewAI 平台工具", "自动化与平台", "stub", "需 CrewAI 平台凭据", "query"),
    ("crewai_enterprise", "CrewAI 企业级工具", "自动化与平台", "stub", "需企业版授权", "query"),
    ("generate_automation", "生成 CrewAI 自动化", "自动化与平台", "stub", "需平台自动化服务", "query"),
    ("invoke_automation", "触发 CrewAI 自动化", "自动化与平台", "stub", "需平台自动化服务", "query"),
    ("parallel_search", "并行执行多个搜索", "自动化与平台", "stub", "需编排配置", "queries"),
    ("llamaindex", "LlamaIndex 工具桥接", "自动化与平台", "stub", "需 LlamaIndex 依赖", "query"),
    ("ai_mind", "AI Mind 心智工具", "自动化与平台", "stub", "需 AI Mind 服务", "query"),
    ("contextualai_create_agent", "ContextualAI 创建智能体", "自动化与平台", "stub", "需 CONTEXTUALAI_API_KEY", "config"),
    ("contextualai_parse", "ContextualAI 解析", "自动化与平台", "stub", "需 CONTEXTUALAI_API_KEY", "query"),
    ("contextualai_query", "ContextualAI 查询", "自动化与平台", "stub", "需 CONTEXTUALAI_API_KEY", "query"),
    ("contextualai_rerank", "ContextualAI 重排序", "自动化与平台", "stub", "需 CONTEXTUALAI_API_KEY", "query"),
    ("patronus_eval", "Patronus AI 评估", "自动化与平台", "stub", "需 PATRONUS_API_KEY", "query"),
    ("patronus_local_eval", "Patronus 本地评估器", "自动化与平台", "stub", "需本地评估服务", "query"),
    ("patronus_criteria_eval", "Patronus 预置标准评估", "自动化与平台", "stub", "需 PATRONUS_API_KEY", "query"),
]


def _http_json(url: str, headers: Dict[str, str], payload: Optional[dict] = None,
               timeout: int = 20) -> Any:
    """通用 HTTP JSON 请求（POST/GET），返回解析结果；失败抛异常。"""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _key_or_hint(env: str, tool: str) -> Optional[str]:
    """返回密钥；缺失返回 None（由调用方给出配置提示）。"""
    return os.environ.get(env) or None


# =====================================================================
# 本地实现
# =====================================================================
def _impl_file_read(file_path: str = "", **_: Any) -> str:
    path = file_path
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(8000)
        return f"[file_read] 已读取 {path}（{len(content)} 字符）：\n{content[:3000]}"
    except Exception as exc:  # noqa: BLE001
        return f"[file_read] 读取失败：{str(exc)[:160]}"


def _impl_file_write(content: str = "", **_: Any) -> str:
    try:
        path, text = (content or "").split("|", 1) if "|" in (content or "") else ("out.txt", content or "")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return f"[file_write] 已写入 {path}（{len(text)} 字符）"
    except Exception as exc:  # noqa: BLE001
        return f"[file_write] 写入失败：{str(exc)[:160]}"


def _impl_directory_read(directory: str = ".", **_: Any) -> str:
    try:
        names = sorted(os.listdir(directory))[:100]
        return f"[directory_read] {directory} 共 {len(names)} 项：\n" + "\n".join(f"- {n}" for n in names)
    except Exception as exc:  # noqa: BLE001
        return f"[directory_read] 读取失败：{str(exc)[:160]}"


def _search_file(path: str, keyword: str, ctx: int = 2) -> str:
    """在文本文件中按关键词命中并返回上下文片段。"""
    if not keyword:
        return f"[{os.path.splitext(path)[1].lstrip('.') or 'file'}_search] 请提供关键词"
    try:
        lines = open(path, "r", encoding="utf-8", errors="replace").read().splitlines()
    except Exception as exc:  # noqa: BLE001
        return f"[search] 读取失败：{str(exc)[:140]}"
    hits = [i for i, ln in enumerate(lines) if keyword.lower() in ln.lower()]
    if not hits:
        return f"[search] 「{keyword}」在 {path} 中未命中（共 {len(lines)} 行）"
    out = []
    for i in hits[:8]:
        lo, hi = max(0, i - ctx), min(len(lines), i + ctx + 1)
        out.append("\n".join(f"{j + 1}:{lines[j]}" for j in range(lo, hi)))
    return f"[search] 「{keyword}」命中 {len(hits)} 处：\n" + "\n---\n".join(out)


def _impl_txt_search(file_path: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    return _search_file(file_path, keyword)


def _impl_mdx_search(file_path: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    return _search_file(file_path, keyword)


def _impl_xml_search(file_path: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    return _search_file(file_path, keyword)


def _impl_json_search(file_path: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    try:
        obj = json.load(open(file_path, "r", encoding="utf-8"))
        text = json.dumps(obj, ensure_ascii=False)
        idx = text.lower().find(keyword.lower())
        if idx < 0:
            return f"[json_search] 「{keyword}」未命中 {file_path}"
        return f"[json_search] 命中：…{text[max(0, idx - 120): idx + 240]}…"
    except Exception as exc:  # noqa: BLE001
        return f"[json_search] 处理失败：{str(exc)[:140]}"


def _impl_csv_search(file_path: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    try:
        rows = [r for r in open(file_path, "r", encoding="utf-8", errors="replace").read().splitlines()
                if keyword.lower() in r.lower()]
        if not rows:
            return f"[csv_search] 「{keyword}」未命中 {file_path}"
        return f"[csv_search] 命中 {len(rows)} 行：\n" + "\n".join(f"- {r[:160]}" for r in rows[:10])
    except Exception as exc:  # noqa: BLE001
        return f"[csv_search] 处理失败：{str(exc)[:140]}"


def _impl_directory_search(directory: str = ".", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    if not keyword:
        return "[directory_search] 请提供关键词（keyword）"
    hits: List[str] = []
    for root, _dirs, files in os.walk(directory):
        for fn in files:
            if fn.startswith(".") or len(hits) >= 12:
                continue
            p = os.path.join(root, fn)
            try:
                if keyword.lower() in open(p, "r", encoding="utf-8", errors="ignore").read(20000).lower():
                    hits.append(p)
            except Exception:  # noqa: BLE001
                continue
    if not hits:
        return f"[directory_search] 目录 {directory} 未命中「{keyword}」"
    return f"[directory_search] 「{keyword}」命中 {len(hits)} 个文件：\n" + "\n".join(f"- {h}" for h in hits)


def _impl_code_interpreter(code: str = "", **_: Any) -> str:
    import contextlib
    import io
    safe = {"len": len, "range": range, "abs": abs, "min": min, "max": max, "sum": sum,
            "str": str, "int": int, "float": float, "list": list, "dict": dict,
            "tuple": tuple, "set": set, "sorted": sorted, "round": round, "print": print}
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec((code or ""), {"__builtins__": safe})  # noqa: S102 受限沙箱
        out = buf.getvalue()
        return f"[code_interpreter] 执行成功：\n{out[:1500]}" if out else "[code_interpreter] 执行成功（无输出）"
    except Exception as exc:  # noqa: BLE001
        return f"[code_interpreter] 执行出错：{str(exc)[:200]}"


def _scrape(url: str) -> str:
    import html as _html
    if not (url or "").startswith(("http://", "https://")):
        raise ValueError("仅支持 http(s) 链接")
    with urllib.request.urlopen(url, timeout=12) as r:
        data = r.read(60000).decode("utf-8", "replace")
    data = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", data, flags=re.I)
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", data))).strip()


def _impl_scrape_website(url: str = "", **_: Any) -> str:
    try:
        text = _scrape(url)
        if not text:
            return "[scrape_website] 页面无可提取文本（可能为 JS 渲染站点）"
        return f"[scrape_website] 抓取成功（{len(text)} 字符）：{text[:1500]}"
    except Exception as exc:  # noqa: BLE001
        return f"[scrape_website] 抓取失败：{str(exc)[:160]}"


def _impl_scrape_element(url: str = "", **kw: Any) -> str:
    target = kw.get("element") or kw.get("tag") or "p"
    try:
        import html as _html
        if not (url or "").startswith(("http://", "https://")):
            raise ValueError("仅支持 http(s) 链接")
        with urllib.request.urlopen(url, timeout=12) as r:
            data = r.read(60000).decode("utf-8", "replace")
        parts = re.findall(rf"<{target}[^>]*>([\s\S]*?)</{target}>", data, flags=re.I)[:10]
        parts = [_html.unescape(re.sub(r"<[^>]+>", " ", p)).strip() for p in parts if p.strip()]
        return f"[scrape_element] 提取到 {len(parts)} 个 <{target}>：\n" + "\n".join(f"- {p[:200]}" for p in parts) if parts else f"[scrape_element] 未找到 <{target}> 元素"
    except Exception as exc:  # noqa: BLE001
        return f"[scrape_element] 抓取失败：{str(exc)[:160]}"


def _impl_website_search(url: str = "", **kw: Any) -> str:
    keyword = kw.get("keyword") or kw.get("query") or ""
    try:
        text = _scrape(url)
        if not text:
            return "[website_search] 页面无可提取文本"
        if keyword and keyword.lower() not in text.lower():
            return f"[website_search] 页面未命中「{keyword}」（全文 {len(text)} 字符）"
        return f"[website_search] 页面内容（{len(text)} 字符）：{text[:1200]}"
    except Exception as exc:  # noqa: BLE001
        return f"[website_search] 抓取失败：{str(exc)[:160]}"


def _impl_arxiv_search(query: str = "", **_: Any) -> str:
    try:
        q = urllib.parse.quote(query or "")
        d = _http_json(f"http://export.arxiv.org/api/query?search_query=all:{q}&max_results=5",
                       {"User-Agent": "Mozilla/5.0"})
        entries = re.findall(r"<entry>([\s\S]*?)</entry>", d) if isinstance(d, str) else []
        if isinstance(d, str) and not entries:
            return f"[arxiv_search] 「{query}」无结果"
        if isinstance(d, str):
            lines = []
            for e in entries[:5]:
                t = re.search(r"<title>(.*?)</title>", e, re.S)
                lines.append("- " + (t.group(1).strip()[:120] if t else ""))
            return f"[arxiv_search] 「{query}」结果 {len(entries)} 条：\n" + "\n".join(lines)
        return f"[arxiv_search] 返回异常，请检查查询词"
    except Exception as exc:  # noqa: BLE001
        return f"[arxiv_search] 检索失败：{str(exc)[:160]}"


def _impl_jina_scrape(url: str = "", **_: Any) -> str:
    try:
        text = _scrape("https://r.jina.ai/" + url)
        return f"[jina_scrape] 抓取成功（{len(text)} 字符）：\n{text[:1500]}" if text else "[jina_scrape] 无内容"
    except Exception as exc:  # noqa: BLE001
        return f"[jina_scrape] 抓取失败：{str(exc)[:160]}"


def _impl_rag_search(query: str = "", **_: Any) -> str:
    try:
        import retriever
        docs, scores = retriever.search(query or "", top_k=3)
        if not docs:
            return f"[rag_search] 知识库未命中「{query}」"
        lines = [f"- [{s:.3f}] {d[:200]}" for d, s in zip(docs, scores)]
        return f"[rag_search] 命中 {len(docs)} 条：\n" + "\n".join(lines)
    except Exception as exc:  # noqa: BLE001
        return f"[rag_search] 检索失败：{str(exc)[:160]}"


# =====================================================================
# 需 API Key 的真实 HTTP 工具
# =====================================================================
def _key_serper(query: str = "", **_: Any) -> str:
    key = _key_or_hint("SERPER_API_KEY", "serper_search")
    if not key:
        return "[serper_search] 未配置 SERPER_API_KEY，请先在环境变量中配置后使用"
    try:
        d = _http_json("https://google.serper.dev/search", {"X-API-KEY": key, "Content-Type": "application/json"},
                       {"q": query})
        items = d.get("organic") or []
        lines = [f"- {it.get('title', '')}（{it.get('link', '')}）{it.get('snippet', '')[:120]}" for it in items[:6]]
        return f"[serper_search] 「{query}」结果 {len(items)} 条：\n" + "\n".join(lines) if lines else f"[serper_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[serper_search] 请求失败：{str(exc)[:160]}"


def _key_tavily(query: str = "", **_: Any) -> str:
    key = _key_or_hint("TAVILY_API_KEY", "tavily_search")
    if not key:
        return "[tavily_search] 未配置 TAVILY_API_KEY"
    try:
        d = _http_json("https://api.tavily.com/search", {"Content-Type": "application/json"},
                       {"api_key": key, "query": query, "max_results": 5})
        lines = [f"- {it.get('title', '')}（{it.get('url', '')}）{it.get('content', '')[:120]}" for it in (d.get("results") or [])]
        return f"[tavily_search] 结果 {len(lines)} 条：\n" + "\n".join(lines) if lines else "[tavily_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[tavily_search] 请求失败：{str(exc)[:160]}"


def _key_tavily_extractor(url: str = "", **_: Any) -> str:
    key = _key_or_hint("TAVILY_API_KEY", "tavily_extractor")
    if not key:
        return "[tavily_extractor] 未配置 TAVILY_API_KEY"
    try:
        d = _http_json("https://api.tavily.com/extract", {"Content-Type": "application/json"},
                       {"api_key": key, "urls": [url]})
        res = (d.get("results") or [{}])[0]
        content = (res.get("raw_content") or res.get("content") or "")[:1500]
        return f"[tavily_extractor] 提取成功：{content}" if content else "[tavily_extractor] 无内容"
    except Exception as exc:  # noqa: BLE001
        return f"[tavily_extractor] 请求失败：{str(exc)[:160]}"


def _key_brave(query: str = "", **_: Any) -> str:
    key = _key_or_hint("BRAVE_API_KEY", "brave_search")
    if not key:
        return "[brave_search] 未配置 BRAVE_API_KEY"
    try:
        d = _http_json(f"https://api.search.brave.com/res/v1/web/search?q={urllib.parse.quote(query)}",
                       {"X-Subscription-Token": key, "Accept": "application/json"})
        items = d.get("web", {}).get("results") or []
        lines = [f"- {it.get('title', '')}（{it.get('url', '')}）{it.get('description', '')[:120]}" for it in items[:6]]
        return f"[brave_search] 结果 {len(items)} 条：\n" + "\n".join(lines) if lines else "[brave_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[brave_search] 请求失败：{str(exc)[:160]}"


def _key_firecrawl_search(query: str = "", **_: Any) -> str:
    key = _key_or_hint("FIRECRAWL_API_KEY", "firecrawl_search")
    if not key:
        return "[firecrawl_search] 未配置 FIRECRAWL_API_KEY"
    try:
        d = _http_json("https://api.firecrawl.dev/v1/search", {"Authorization": f"Bearer {key}",
                       "Content-Type": "application/json"}, {"query": query, "limit": 5})
        lines = [f"- {it.get('title', '')}（{it.get('url', '')}）{it.get('description', '')[:120]}" for it in (d.get("data") or [])]
        return f"[firecrawl_search] 结果 {len(lines)} 条：\n" + "\n".join(lines) if lines else "[firecrawl_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[firecrawl_search] 请求失败：{str(exc)[:160]}"


def _key_firecrawl_scrape(url: str = "", **_: Any) -> str:
    key = _key_or_hint("FIRECRAWL_API_KEY", "firecrawl_scrape")
    if not key:
        return "[firecrawl_scrape] 未配置 FIRECRAWL_API_KEY"
    try:
        d = _http_json("https://api.firecrawl.dev/v1/scrape", {"Authorization": f"Bearer {key}",
                       "Content-Type": "application/json"}, {"url": url})
        content = (d.get("data") or {}).get("markdown") or ""
        return f"[firecrawl_scrape] 抓取成功（{len(content)} 字符）：\n{content[:1500]}" if content else "[firecrawl_scrape] 无内容"
    except Exception as exc:  # noqa: BLE001
        return f"[firecrawl_scrape] 请求失败：{str(exc)[:160]}"


def _key_github(query: str = "", **_: Any) -> str:
    key = _key_or_hint("GITHUB_TOKEN", "github_search") or _key_or_hint("GH_TOKEN", "github_search")
    if not key:
        return "[github_search] 未配置 GITHUB_TOKEN/GH_TOKEN"
    try:
        d = _http_json(f"https://api.github.com/search/repositories?q={urllib.parse.quote(query)}&per_page=5",
                       {"Authorization": f"Bearer {key}", "Accept": "application/vnd.github+json",
                        "User-Agent": "crewai-platform"})
        items = d.get("items") or []
        lines = [f"- {it.get('full_name', '')}（★{it.get('stargazers_count', 0)}）{it.get('description', '')[:120]}" for it in items]
        return f"[github_search] 结果 {len(items)} 条：\n" + "\n".join(lines) if lines else "[github_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[github_search] 请求失败：{str(exc)[:160]}"


def _key_serpapi(query: str = "", **_: Any) -> str:
    key = _key_or_hint("SERPAPI_API_KEY", "serpapi_search")
    if not key:
        return "[serpapi_search] 未配置 SERPAPI_API_KEY"
    try:
        d = _http_json(f"https://serpapi.com/search.json?q={urllib.parse.quote(query)}&engine=google",
                       {"User-Agent": "Mozilla/5.0"})
        items = d.get("organic_results") or []
        lines = [f"- {it.get('title', '')}（{it.get('link', '')}）{it.get('snippet', '')[:120]}" for it in items[:6]]
        return f"[serpapi_search] 结果 {len(items)} 条：\n" + "\n".join(lines) if lines else "[serpapi_search] 无结果（可能需配置 engine/参数）"
    except Exception as exc:  # noqa: BLE001
        return f"[serpapi_search] 请求失败：{str(exc)[:160]}"


def _key_linkup(query: str = "", **_: Any) -> str:
    key = _key_or_hint("LINKUP_API_KEY", "linkup_search")
    if not key:
        return "[linkup_search] 未配置 LINKUP_API_KEY"
    try:
        d = _http_json("https://api.linkup.so/v1/search", {"Authorization": f"Bearer {key}",
                       "Content-Type": "application/json"}, {"q": query, "depth": "standard", "limit": 5})
        lines = [f"- {it.get('name', '')}（{it.get('url', '')}）{it.get('content', '')[:120]}" for it in (d.get("results") or [])]
        return f"[linkup_search] 结果 {len(lines)} 条：\n" + "\n".join(lines) if lines else "[linkup_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[linkup_search] 请求失败：{str(exc)[:160]}"


def _key_exa(query: str = "", **_: Any) -> str:
    key = _key_or_hint("EXA_API_KEY", "exa_search")
    if not key:
        return "[exa_search] 未配置 EXA_API_KEY"
    try:
        d = _http_json("https://api.exa.ai/search", {"x-api-key": key, "Content-Type": "application/json"},
                       {"query": query, "numResults": 5})
        lines = [f"- {it.get('title', '')}（{it.get('url', '')}）{it.get('text', '')[:120]}" for it in (d.get("results") or [])]
        return f"[exa_search] 结果 {len(lines)} 条：\n" + "\n".join(lines) if lines else "[exa_search] 无结果"
    except Exception as exc:  # noqa: BLE001
        return f"[exa_search] 请求失败：{str(exc)[:160]}"


# =====================================================================
# 构建
# =====================================================================
_LOCAL: Dict[str, Callable] = {
    "file_read": _impl_file_read, "file_write": _impl_file_write,
    "directory_read": _impl_directory_read, "directory_search": _impl_directory_search,
    "txt_search": _impl_txt_search, "json_search": _impl_json_search,
    "csv_search": _impl_csv_search, "mdx_search": _impl_mdx_search,
    "xml_search": _impl_xml_search, "code_interpreter": _impl_code_interpreter,
    "scrape_website": _impl_scrape_website, "scrape_element": _impl_scrape_element,
    "website_search": _impl_website_search, "arxiv_search": _impl_arxiv_search,
    "jina_scrape": _impl_jina_scrape, "rag_search": _impl_rag_search,
}

_KEY: Dict[str, Callable] = {
    "serper_search": _key_serper, "tavily_search": _key_tavily,
    "tavily_extractor": _key_tavily_extractor, "brave_search": _key_brave,
    "firecrawl_search": _key_firecrawl_search, "firecrawl_scrape": _key_firecrawl_scrape,
    "github_search": _key_github, "serpapi_search": _key_serpapi,
    "linkup_search": _key_linkup, "exa_search": _key_exa,
}


def _stub_fn(name: str, note: str) -> Callable[..., str]:
    def fn(**_: Any) -> str:
        return f"[{name}] 该工具为 CrewAI 官方工具占位：尚未接入（{note}）。请按说明配置依赖/服务后启用。"
    fn.__name__ = f"stub_{name}"
    return fn


def build_crewai_tools() -> Dict[str, Tool]:
    """构造适配层工具目录（合并进平台 build_tools）。"""
    tools: Dict[str, Tool] = {}
    for name, desc, cat, mode, note, param in CREWAI_TOOL_SPECS:
        if mode == "local":
            func = _LOCAL[name]
            args = [{"name": param, "type": "str", "required": False, "desc": param}] if param else []
            real = True
        elif mode.startswith("key:"):
            func = _KEY[name]
            args = [{"name": param, "type": "str", "required": False, "desc": param}]
            real = bool(os.environ.get(mode.split(":", 1)[1]))
        else:
            func = _stub_fn(name, note)
            args = [{"name": param, "type": "str", "required": False, "desc": param}] if param else []
            real = False
        tools[name] = Tool(name=name, description=desc, func=func, args_schema=args,
                           requires_approval=False, action_tag="")
    return tools


def crewai_tool_meta() -> Dict[str, Dict[str, Any]]:
    """name → {category, real, source, status, note}。"""
    meta: Dict[str, Dict[str, Any]] = {}
    for name, _desc, cat, mode, note, _param in CREWAI_TOOL_SPECS:
        if mode == "local":
            status, real = "ready", True
        elif mode.startswith("key:"):
            env = mode.split(":", 1)[1]
            # GitHub 工具兼容 GH_TOKEN 环境变量
            configured = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")) if env == "GITHUB_TOKEN" else os.environ.get(env)
            status, real = ("ready" if configured else "needs_key"), bool(configured)
        else:
            status, real = "stub", False
        meta[name] = {"category": cat, "real": real, "source": "crewai-tools",
                      "status": status, "note": note or ""}
    return meta