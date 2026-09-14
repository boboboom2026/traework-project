import { NextRequest, NextResponse } from "next/server";

// POST /api/skills/import - 导入技能（从文件内容，Markdown 格式）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, userId, name, description, content, sourceFile } = body;

    if (!teamId) {
      return NextResponse.json({ error: "团队ID不能为空" }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: "技能内容不能为空" }, { status: 400 });
    }

    // 内容直接作为 Markdown 文本
    const markdownContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);

    // 从文件名提取技能名称
    let skillName = name;
    if (!skillName && sourceFile) {
      skillName = sourceFile.replace(/\.(md|json|txt|yaml|yml)$/i, "");
    }
    if (!skillName) {
      skillName = "未命名技能";
    }

    // 尝试从 Markdown frontmatter 提取描述
    let skillDescription = description;
    if (!skillDescription && typeof markdownContent === "string") {
      const descMatch = markdownContent.match(/^---\n[\s\S]*?description:\s*["']?(.+?)["']?\n[\s\S]*?---/m);
      if (descMatch) {
        skillDescription = descMatch[1];
      }
      // 如果没有 frontmatter，尝试从第一段提取
      if (!skillDescription) {
        const lines = markdownContent.split("\n").filter((l: string) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
        if (lines.length > 0) {
          skillDescription = lines[0].substring(0, 200);
        }
      }
    }

    return NextResponse.json({
      success: true,
      preview: {
        name: skillName,
        description: skillDescription || "",
        content: markdownContent,
        sourceFile: sourceFile || null,
        sourceType: sourceFile ? "file_upload" : "manual"
      }
    });
  } catch (error) {
    console.error("导入技能失败:", error);
    return NextResponse.json({ error: "导入技能失败" }, { status: 500 });
  }
}
