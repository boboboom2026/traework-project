/**
 * 轻量级 API 输入验证工具
 * 提供字段类型/长度/必填校验，统一返回错误格式
 */

export type ValidationRule = {
  type: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  message?: string;
};

export type ValidationSchema = Record<string, ValidationRule>;

export type ValidationErrorItem = {
  field: string;
  message: string;
};

export function validate(body: Record<string, unknown>, schema: ValidationSchema): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];

    // 必填检查
    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push({ field, message: rules.message || `${field} 为必填字段` });
      continue;
    }

    // 跳过 undefined 的非必填字段
    if (value === undefined || value === null) {
      continue;
    }

    // 类型检查
    if (rules.type === "string" && typeof value !== "string") {
      errors.push({ field, message: `${field} 必须是字符串` });
      continue;
    }
    if (rules.type === "number" && typeof value !== "number") {
      errors.push({ field, message: `${field} 必须是数字` });
      continue;
    }
    if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push({ field, message: `${field} 必须是布尔值` });
      continue;
    }
    if (rules.type === "array" && !Array.isArray(value)) {
      errors.push({ field, message: `${field} 必须是数组` });
      continue;
    }
    if (rules.type === "object" && (typeof value !== "object" || Array.isArray(value) || value === null)) {
      errors.push({ field, message: `${field} 必须是对象` });
      continue;
    }

    // 字符串长度检查
    if (typeof value === "string") {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push({ field, message: `${field} 长度不能少于 ${rules.minLength} 个字符` });
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push({ field, message: `${field} 长度不能超过 ${rules.maxLength} 个字符` });
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({ field, message: rules.message || `${field} 格式不正确` });
      }
    }

    // 数字范围检查
    if (typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({ field, message: `${field} 不能小于 ${rules.min}` });
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push({ field, message: `${field} 不能大于 ${rules.max}` });
      }
    }
  }

  return errors;
}

export function validateOrThrow(body: Record<string, unknown>, schema: ValidationSchema): void {
  const errors = validate(body, schema);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

export class ValidationError extends Error {
  public errors: ValidationErrorItem[];
  constructor(errors: ValidationErrorItem[]) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "ValidationError";
    this.errors = errors;
  }
}