# -*- coding: utf-8 -*-
"""轻量知识检索（RAG 检索端）：本地哈希嵌入 + 余弦相似度，零外部依赖。

没有接入向量数据库 / embedding API 时也能离线工作：
- tokenize：英文按单词、中文按双字 bigram 切分
- embed：词频加权稀疏向量 + L2 归一化（哈希嵌入）
- search：query 向量与文档分块向量的余弦相似度，返回 top-k

后续若接入 embedding provider（如 OpenAI / SiliconFlow），可平滑替换其中的 embed()。
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Dict, List, Optional

_EN_RE = re.compile(r"[a-z0-9_]+")
_EN_STOP = {
    "the", "and", "for", "with", "from", "that", "this", "these", "those",
    "are", "is", "of", "in", "on", "to", "a", "an", "or", "as", "at", "by",
    "we", "you", "our", "your", "it", "its", "be", "been", "was", "were", "not",
}
_CHUNK_SIZE = 400   # 每块最大字符数
_CHUNK_OVERLAP = 40  # 相邻块重叠，避免切断语义
_MAX_SNIPPET = 320   # 注入片段的截断长度


def tokenize(text: str) -> List[str]:
    """中英混合分词：英文小写单词（去停用词）+ 中文双字 bigram。"""
    text = unicodedata.normalize("NFKC", text or "").lower()
    toks: List[str] = []
    for m in _EN_RE.finditer(text):
        w = m.group()
        if w not in _EN_STOP and len(w) > 1:
            toks.append(w)
    zh = re.sub(r"[^\u4e00-\u9fff]", "", text)
    if not zh:
        return toks
    if len(zh) == 1:
        toks.append(zh)
    for i in range(len(zh) - 1):
        toks.append(zh[i:i + 2])
    return toks


def embed(text: str) -> Dict[str, float]:
    """哈希嵌入：词频向量经 L2 归一化（稀疏 dict 存储）。"""
    vec: Dict[str, float] = {}
    for tok in tokenize(text):
        vec[tok] = vec.get(tok, 0.0) + 1.0
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {k: v / norm for k, v in vec.items()}


def _cosine(a: Dict[str, float], b: Dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    small, large = (a, b) if len(a) <= len(b) else (b, a)
    return sum(w * large.get(k, 0.0) for k, w in small.items())


def chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> List[str]:
    """按段落切块，长段落硬切，块间保留重叠。"""
    paras = [p.strip() for p in re.split(r"\n+", (text or "")) if p.strip()]
    chunks: List[str] = []
    buf = ""
    for p in paras:
        while len(p) > size:
            chunks.append(p[:size])
            p = p[size:]
        if buf and len(buf) + len(p) > size - overlap:
            chunks.append(buf)
            buf = ""
        buf = (buf + "\n" + p) if buf else p
    if buf:
        chunks.append(buf)
    return chunks or [""]


def build_entries(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """把知识文档转换为可检索的分块条目（每块一个向量）。"""
    entries: List[Dict[str, Any]] = []
    for d in docs:
        content = d.get("content") or ""
        if not content.strip():
            continue
        for idx, chunk in enumerate(chunk_text(content)):
            entries.append({
                "doc_id": d["id"], "doc_name": d.get("name", ""), "kind": d.get("kind", ""),
                "idx": idx, "text": chunk, "vec": embed(chunk),
            })
    return entries


def search(query: str, docs: List[Dict[str, Any]], top_k: int = 3,
           min_score: float = 0.02) -> List[Dict[str, Any]]:
    """基于哈希嵌入的余弦相似度检索，返回按相关度降序的片段列表。"""
    qv = embed(query)
    if not qv:
        return []
    hits: List[Dict[str, Any]] = []
    for e in build_entries(docs):
        score = _cosine(qv, e["vec"])
        if score < min_score:
            continue
        hits.append({
            "doc_id": e["doc_id"], "doc_name": e["doc_name"], "kind": e["kind"],
            "score": round(float(score), 3), "text": e["text"][:_MAX_SNIPPET],
        })
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits[:top_k]