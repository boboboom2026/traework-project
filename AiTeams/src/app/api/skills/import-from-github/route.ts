import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from "fs";
import { join, sep } from "path";
import { tmpdir } from "os";

interface GitHubSkill {
  name: string;
  description: string;
  content: string;
  version: string;
  sourceFile: string;
  sourceUrl: string;
}

// 从 GitHub URL 提取 owner/repo
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const pattern = /^(?:https?:\/\/)?github\.com\/([^\/]+)\/([^\/\?#]+?)(?:\/|$|\.git)/;
  const match = url.match(pattern);
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""),
    };
  }
  // 裸格式: owner/repo
  const bareMatch = url.match(/^([^\/]+)\/([^\/\?#]+?)$/);
  if (bareMatch) {
    return {
      owner: bareMatch[1],
      repo: bareMatch[2].replace(/\.git$/, ""),
    };
  }
  return null;
}

// 解析 SKILL.md 的 YAML frontmatter
function parseSkillMd(
  content: string,
  filePath: string,
  repoUrl: string
): GitHubSkill {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  let name = "";
  let description = "";
  let version = "1.0.0";

  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    const nameMatch = yaml.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = yaml.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (descMatch) description = descMatch[1].trim();

    const versionMatch = yaml.match(/^version:\s*["']?(.+?)["']?\s*$/m);
    if (versionMatch) version = versionMatch[1].trim();
  }

  if (!name) {
    const dirName = filePath.split("/").slice(-2, -1)[0] || filePath.replace(/\.md$/i, "");
    name = dirName;
  }

  return {
    name,
    description: description || `来自 ${filePath} 的技能`,
    content,
    version,
    sourceFile: filePath,
    sourceUrl: `${repoUrl}/blob/main/${filePath}`,
  };
}

// 递归扫描目录，查找所有 SKILL.md
function scanForSkills(dir: string, basePath: string, repoUrl: string): GitHubSkill[] {
  const skills: GitHubSkill[] = [];
  
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = basePath ? join(basePath, entry) : entry;
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        skills.push(...scanForSkills(fullPath, relativePath, repoUrl));
      } else if (stat.isFile() && entry.toLowerCase() === "skill.md") {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const skill = parseSkillMd(content, relativePath, repoUrl);
          skills.push(skill);
        } catch (e) {
          console.error(`解析 ${fullPath} 失败:`, e);
        }
      }
    }
  } catch (e) {
    console.error(`扫描目录 ${dir} 失败:`, e);
  }
  
  return skills;
}

// POST /api/skills/import-from-github - 从 GitHub 仓库导入技能
export async function POST(request: NextRequest) {
  const tmpDir = mkdtempSync(join(tmpdir(), "gh-import-"));
  
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "GitHub URL 不能为空" }, { status: 400 });
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      return NextResponse.json({
        error: "无法解析的 GitHub URL",
        hint: "支持的格式：https://github.com/owner/repo 或 owner/repo",
      }, { status: 400 });
    }

    const { owner, repo } = parsed;
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    const repoUrl = `https://github.com/${owner}/${repo}`;

    // 使用 git clone --depth 1 快速克隆（只取最新版本）
    try {
      execSync(
        `git clone --depth 1 --single-branch "${cloneUrl}" "${tmpDir}/repo" 2>&1`,
        { timeout: 60000, stdio: "pipe" }
      );
    } catch (e: any) {
      const msg = e.stderr?.toString() || e.message || "克隆失败";
      if (msg.includes("Repository not found") || msg.includes("404")) {
        return NextResponse.json({
          error: `仓库不存在：${owner}/${repo}`,
          hint: "请检查仓库名称是否正确（注意大小写）",
        }, { status: 404 });
      }
      if (msg.includes("timeout") || msg.includes("Could not")) {
        return NextResponse.json({
          error: "仓库克隆超时，请检查网络连接",
        }, { status: 500 });
      }
      return NextResponse.json({
        error: `克隆仓库失败：${msg}`,
        hint: "请确保仓库为公开仓库",
      }, { status: 500 });
    }

    // 扫描所有 SKILL.md 文件
    const repoDir = join(tmpDir, "repo");
    const skills = scanForSkills(repoDir, "", repoUrl);

    if (skills.length === 0) {
      return NextResponse.json({
        success: true,
        skills: [],
        message: "未在仓库中找到 SKILL.md 文件",
      });
    }

    return NextResponse.json({
      success: true,
      skills,
      message: `找到 ${skills.length} 个技能`,
    });
  } catch (error) {
    console.error("从 GitHub 导入技能失败:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "从 GitHub 导入技能失败",
    }, { status: 500 });
  } finally {
    // 清理临时文件
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}