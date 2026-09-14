/**
 * Cron 表达式解析工具
 * 支持标准 5 字段 cron 表达式: 分 时 日 月 周
 */

/**
 * 解析 cron 表达式，计算下次执行时间
 * @param cronExpr cron 表达式，如 "0 9 * * 1-5"
 * @param timezone 时区，如 "Asia/Shanghai"
 * @returns 下次执行时间
 */
export function parseCronNext(cronExpr: string, timezone: string = "Asia/Shanghai"): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  const [minuteStr, hourStr, dayStr, monthStr, weekdayStr] = parts;

  // 获取当前时间
  const now = new Date();
  const targetTz = timezone || "Asia/Shanghai";

  // 从当前时间的下一分钟开始搜索
  const startMinute = new Date(now);
  startMinute.setSeconds(0, 0);
  startMinute.setMinutes(startMinute.getMinutes() + 1);

  // 搜索未来 366 天内的匹配时间
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 366);

  const candidate = new Date(startMinute);

  while (candidate < maxDate) {
    // 检查月份
    if (!matchField(monthStr, candidate.getMonth() + 1, 1, 12)) {
      candidate.setMonth(candidate.getMonth() + 1, 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    // 检查日期和星期
    const dayMatch = matchField(dayStr, candidate.getDate(), 1, 31);
    const weekdayMatch = matchField(weekdayStr, candidate.getDay(), 0, 7);

    if (!dayMatch || !weekdayMatch) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    // 检查小时
    if (!matchField(hourStr, candidate.getHours(), 0, 23)) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
      continue;
    }

    // 检查分钟
    if (!matchField(minuteStr, candidate.getMinutes(), 0, 59)) {
      candidate.setMinutes(candidate.getMinutes() + 1, 0, 0);
      continue;
    }

    // 匹配成功
    return candidate;
  }

  throw new Error(`No matching time found within 366 days for cron: ${cronExpr}`);
}

/**
 * 匹配 cron 字段
 */
function matchField(field: string, value: number, min: number, max: number): boolean {
  // 处理逗号分隔的多值
  const parts = field.split(",");
  for (const part of parts) {
    if (matchSingleField(part.trim(), value, min, max)) {
      return true;
    }
  }
  return false;
}

function matchSingleField(field: string, value: number, min: number, max: number): boolean {
  // 通配符
  if (field === "*") return true;

  // 范围: 1-5
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  // 步长: */15
  if (field.includes("/")) {
    const [range, step] = field.split("/");
    const stepNum = parseInt(step, 10);
    if (range === "*") {
      return value % stepNum === 0;
    }
    const start = parseInt(range, 10);
    return value >= start && (value - start) % stepNum === 0;
  }

  // 单值
  const num = parseInt(field, 10);
  return value === num;
}

/**
 * 生成人类可读的 cron 描述
 */
export function describeCron(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return cronExpr;

  const [minute, hour, day, month, weekday] = parts;

  // 常见模式识别
  if (cronExpr === "0 9 * * *") return "每天 09:00";
  if (cronExpr === "0 9 * * 1-5") return "工作日 09:00";
  if (cronExpr === "0 9 * * 1") return "每周一 09:00";
  if (cronExpr === "0 9 1 * *") return "每月 1 日 09:00";
  if (cronExpr === "0 * * * *") return "每小时整点";
  if (cronExpr.startsWith("*/") && hour === "*" && day === "*") return `每 ${minute.slice(2)} 分钟`;

  let desc = "";

  // 时间部分
  if (minute !== "*" && hour !== "*") {
    desc += `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } else if (minute === "*" && hour !== "*") {
    desc += `每小时 ${hour} 点`;
  } else if (minute !== "*" && hour === "*") {
    desc += `每小时的第 ${minute} 分钟`;
  } else {
    desc += "每分钟";
  }

  // 日期部分
  if (day !== "*") {
    desc += `，每月 ${day} 日`;
  }

  // 月份部分
  if (month !== "*") {
    desc += `，${month} 月`;
  }

  // 星期部分
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  if (weekday !== "*") {
    if (weekday.includes("-")) {
      const [start, end] = weekday.split("-");
      desc += `，周${weekdays[parseInt(start)]}到周${weekdays[parseInt(end)]}`;
    } else {
      desc += `，周${weekdays[parseInt(weekday)]}`;
    }
  }

  return desc;
}

/**
 * 根据调度类型计算下次执行时间
 */
export function calculateNextRun(
  scheduleType: string,
  cronExpr: string | null,
  intervalMs: number | null,
  atTime: string | null,
  timezone: string = "Asia/Shanghai"
): string | null {
  switch (scheduleType) {
    case "cron":
      if (!cronExpr) return null;
      try {
        return parseCronNext(cronExpr, timezone).toISOString();
      } catch {
        return null;
      }
    case "every":
      if (!intervalMs) return null;
      return new Date(Date.now() + intervalMs).toISOString();
    case "at":
      // 一次性任务，执行后不再计算
      return null;
    default:
      return null;
  }
}

/**
 * 常用 cron 预设
 */
export const CRON_PRESETS = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "每天 18:00", value: "0 18 * * *" },
  { label: "工作日 09:00", value: "0 9 * * 1-5" },
  { label: "工作日 18:00", value: "0 18 * * 1-5" },
  { label: "每周一 09:00", value: "0 9 * * 1" },
  { label: "每周五 17:00", value: "0 17 * * 5" },
  { label: "每月 1 日 09:00", value: "0 9 1 * *" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
  { label: "每 15 分钟", value: "*/15 * * * *" },
];
