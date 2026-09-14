/**
 * Cron 表达式匹配器
 * 支持标准 5 位 cron 格式: minute hour dayOfMonth month dayOfWeek
 * 示例:
 *   "0 9 * * *"   → 每天 9:00
 *   "0 9 * * 1"   → 每周一 9:00
 *   "0 9 1 * *"   → 每月1号 9:00
 *   "0/30 * * * *" → 每30分钟
 */

export interface CronMatch {
  matches: boolean;
  nextRun: Date | null;
  description: string;
}

/** 将 cron 表达式转为人类可读描述 */
export function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 常见模式匹配
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `每天 ${hour}:00`;
  }
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const days = ["日", "一", "二", "三", "四", "五", "六"];
    const dayNum = parseInt(dayOfWeek);
    if (!isNaN(dayNum)) return `每周${days[dayNum]} ${hour}:00`;
    return `每周 ${hour}:00`;
  }
  if (minute === "0" && hour !== "*" && dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    return `每月${dayOfMonth}号 ${hour}:00`;
  }
  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const interval = minute.slice(2);
    return `每${interval}分钟`;
  }
  if (minute === "30" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `每天 ${hour}:30`;
  }

  return expression;
}

/** 检查某个 cron 部分是否匹配当前值 */
function partMatches(part: string, current: number, min: number, max: number): boolean {
  if (part === "*") return true;

  // */n 步长
  const stepMatch = part.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]);
    return (current - min) % step === 0;
  }

  // 逗号分隔: 1,3,5
  if (part.includes(",")) {
    return part.split(",").some(p => partMatches(p.trim(), current, min, max));
  }

  // 范围: 1-5
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1]);
    const hi = parseInt(rangeMatch[2]);
    return current >= lo && current <= hi;
  }

  // 单个值
  const val = parseInt(part);
  return !isNaN(val) && val === current;
}

/** 检查 cron 表达式是否匹配给定时间 */
export function matchesCron(expression: string, date: Date = new Date()): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return (
    partMatches(minute, date.getMinutes(), 0, 59) &&
    partMatches(hour, date.getHours(), 0, 23) &&
    partMatches(dayOfMonth, date.getDate(), 1, 31) &&
    partMatches(month, date.getMonth() + 1, 1, 12) &&
    partMatches(dayOfWeek, date.getDay(), 0, 6)
  );
}

/** 计算下次执行时间（暴力搜索，最多搜索 366 天） */
export function getNextRun(expression: string, from: Date = new Date()): Date | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  // 从下一分钟开始搜索
  const start = new Date(from);
  start.setMinutes(start.getMinutes() + 1, 0, 0);

  // 每分钟递增搜索，最多搜索 525600 分钟 (约1年)
  for (let i = 0; i < 525600; i++) {
    const candidate = new Date(start.getTime() + i * 60000);
    if (matchesCron(expression, candidate)) {
      return candidate;
    }
  }

  return null;
}

/** 常用调度预设 */
export const SCHEDULE_PRESETS = [
  { label: "每天 9:00", cron: "0 9 * * *" },
  { label: "每天 18:00", cron: "0 18 * * *" },
  { label: "每周一 9:00", cron: "0 9 * * 1" },
  { label: "每周五 17:00", cron: "0 17 * * 5" },
  { label: "每月1号 9:00", cron: "0 9 1 * *" },
  { label: "每30分钟", cron: "*/30 * * * *" },
  { label: "每小时", cron: "0 * * * *" },
] as const;

/** 完整匹配：是否匹配 + 下次运行 + 描述 */
export function matchCronExpression(expression: string, now: Date = new Date()): CronMatch {
  const valid = expression.trim().split(/\s+/).length === 5;
  if (!valid) {
    return { matches: false, nextRun: null, description: "无效的 cron 表达式" };
  }

  return {
    matches: matchesCron(expression, now),
    nextRun: getNextRun(expression, now),
    description: describeCron(expression),
  };
}
