/**
 * Prompt 注入检测模块
 * 在用户消息进入 LLM 之前，检测常见的注入攻击模式
 */

const INJECTION_PATTERNS: RegExp[] = [
  // 忽略指令
  /忽略(?:之前|以上|所有|掉).*(?:指令|规则|提示|内容)/i,
  /无视(?:上述|以上|所有).*(?:指令|规则|提示)/i,
  /不要(?:管|理会|遵循).*(?:指令|规则|提示)/i,
  // 角色扮演
  /你现在是(?:管理员|系统管理员|root|superuser)/i,
  /扮演(?:管理员|系统管理员|root|superuser).*(?:角色)/i,
  // 系统指令泄露
  /system prompt|系统提示词|规则说明|系统指令/i,
  // 重复输出
  /重复(?:输出|回复|说一遍).*(?:上面|内容|这句话)/i,
  /把(?:上面|之前|以上).*(?:重复|再说一遍)/i,
  // 代码/命令执行
  /执行.*(?:SQL|命令|删除|DROP|DELETE|UPDATE|INSERT|TRUNCATE)/i,
  /exec(?:ute)?.*(?:sql|command|delete|drop)/i,
];

/**
 * 检测输入是否包含 Prompt 注入攻击
 * @param input 用户输入文本
 * @returns true=检测到注入，false=安全
 */
export function detectPromptInjection(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  return INJECTION_PATTERNS.some((p) => p.test(input));
}

/**
 * 获取注入检测结果详情
 * @param input 用户输入文本
 * @returns 检测结果，包含是否命中及命中的模式
 */
export function checkInjection(input: string): {
  detected: boolean;
  matchedPattern?: string;
} {
  if (!input || typeof input !== "string") return { detected: false };

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, matchedPattern: pattern.source };
    }
  }

  return { detected: false };
}