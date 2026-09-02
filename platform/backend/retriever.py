# -*- coding: utf-8 -*-
"""知识检索（RAG 检索端）：真实 embedding provider + 本地哈希双轨。

- 配置了 embedding provider（kind=embedding）时：query/文档块由外部嵌入 API 生成稠密向量，
  余弦相似度检索；文档向量在写入时预计算并缓存（vectors 字段），运行期零额外请求。
- 未配置或调用失败时：自动回退本地哈希嵌入（英文单词 + 中文 bigram 的稀疏向量），离线可用。

分词与分块逻辑与嵌入方式解耦，两种模式共用。
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Dict, List, Optional

import llm_client

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
    """本地哈希嵌入（回退方案）：词频向量经 L2 归一化（稀疏 dict 存储）。"""
    vec: Dict[str, float] = {}
    for tok in tokenize(text):
        vec[tok] = vec.get(tok, 0.0) + 1.0
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {k: v / norm for k, v in vec.items()}


def _dot(a: Any, b: Any) -> float:
    """余弦（等价点积，两向量均已归一化）：稠密 list 或稀疏 dict 点积。"""
    if not a or not b:
        return 0.0
    if isinstance(a, list):
        return sum(x * y for x, y in zip(a, b))
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


def pick_embedding_provider(providers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """从 llm_providers 中选取嵌入用途提供商（kind=embedding，优先已填 Key 的）。"""
    emb = [p for p in (providers or []) if p.get("kind") == "embedding" and p.get("model")]
    emb.sort(key=lambda p: 0 if p.get("api_key") else 1)
    return emb[0] if emb else None


def embed_query(query: str, provider: Optional[Dict[str, Any]]) -> Any:
    """Query 向量化：有 embedding provider 用真实嵌入，失败/未配置返回 None（由调用方回退本地）。"""
    if provider:
        try:
            return llm_client.embed_texts(provider, [query])[0]
        except Exception:  # noqa: BLE001
            return None
    return None


def search_docs(query_text: str, query_vec: Any, docs: List[Dict[str, Any]],
                top_k: int = 3, min_score: float = 0.02) -> List[Dict[str, Any]]:
    """相似度检索：稠密向量优先（文档写入时预计算缓存），否则回退本地哈希。"""
    q_dense = query_vec if isinstance(query_vec, list) else None
    q_local = query_vec if isinstance(query_vec, dict) else embed(query_text)
    hits: List[Dict[str, Any]] = []
    for doc in docs:
        content = doc.get("content") or ""
        if not content.strip():
            continue
        chunks = chunk_text(content)
        stored = doc.get("vectors")
        use_dense = q_dense is not None and isinstance(stored, list) and len(stored) == len(chunks)
        for i, chunk in enumerate(chunks):
            if use_dense:
                score = _dot(q_dense, [float(x) for x in stored[i]])
            else:
                score = _dot(q_local, embed(chunk))
            if score < min_score:
                continue
            hits.append({
                "doc_id": doc["id"], "doc_name": doc.get("name", ""), "kind": doc.get("kind", ""),
                "score": round(float(score), 3), "text": chunk[:_MAX_SNIPPET],
            })
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits[:top_k]