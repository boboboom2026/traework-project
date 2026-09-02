import { useEffect, useState } from "react";
import { del, get, post } from "../api.js";

export default function Knowledge({ onNav, items, reload }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);

  const load = () => get("/api/knowledge").then((r) => setDocs(r.docs || [])).catch(() => {});
  const refresh = () => { load(); reload?.(); };

  useEffect(() => { load(); }, []);

  async function addDoc(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rec = {
      name: fd.get("name"), source: fd.get("source"), kind: fd.get("kind"),
      content: fd.get("content") || "",
      size: 0, status: "待嵌入",
    };
    try {
      await post("/api/knowledge", rec);
      setUploading(false);
      refresh();
    } catch (err) { alert(`失败：${err.message}`); }
  }

  const KIND = { pdf: "PDF", csv: "CSV", json: "JSON", txt: "文本", url: "网页" };

  return (
    <div>
      <div className="panel-h">
        <h3>企业知识资产（Knowledge + RAG）· {docs.length} 篇</h3>
        <button className="btn pri" onClick={() => setUploading(true)}>＋ 添加文档</button>
      </div>
      {docs.map((d) => (
        <div className="list-item" key={d.id}>
          <div>
            <div className="t">📄 {d.name} <span className="tag neutral">{KIND[d.kind] || d.kind}</span>
              <span className={"tag " + (d.status === "已嵌入" ? "ok" : "warn")}>{d.status}</span>
              {d.chunk_count > 0 && <span className="tag info">{d.chunk_count} 个分块</span>}
            </div>
            <div className="s">来源：{d.source || "直接上传"} · {d.created_at}
              {d.embed_status ? ` · ${d.embed_status}` : ""}</div>
            {d.content && <div className="s" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{(d.content || "").slice(0, 160)}{(d.content || "").length > 160 ? "…" : ""}</div>}
          </div>
          <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { if (confirm("删除该文档？")) del(`/api/knowledge/${d.id}`).then(refresh); }}>移除</button>
        </div>
      ))}
      {!docs.length && <div className="card"><div className="empty">暂无知识文档。<br />上传企业文档（PDF/CSV/JSON/文本）后，可绑定到智能体或编排用于检索增强。</div></div>}

      {uploading && (
        <div className="modal-mask" onClick={() => setUploading(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={addDoc}>
            <h2>添加知识文档</h2>
            <div className="row">
              <div className="field">
                <label>文档名称</label>
                <input className="input" name="name" required placeholder="如：2026 产品手册" />
              </div>
              <div className="field">
                <label>类型</label>
                <select className="input" name="kind" defaultValue="pdf">
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="txt">文本</option>
                  <option value="url">网页 URL</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>来源 / 链接</label>
              <input className="input" name="source" placeholder="上传文件路径或网页链接" />
            </div>
            <div className="field">
              <label>文档内容（正文）</label>
              <textarea className="input" name="content" placeholder="粘贴文档正文；提交后自动分块并建立本地索引（哈希嵌入，离线可用），供智能体/编排检索增强（RAG）。" style={{ minHeight: 120 }} />
              <div className="hint">内容将按段落分块并向量化索引；检索命中片段会在任务执行时注入系统提示。PDF/CSV/JSON 也可在此粘贴解析后的文本。</div>
            </div>
            <div className="ft">
              <button type="button" className="btn" onClick={() => setUploading(false)}>取消</button>
              <button type="submit" className="btn pri">添加并建立索引</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}