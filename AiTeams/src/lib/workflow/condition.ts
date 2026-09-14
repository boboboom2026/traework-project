// ========== 确定性条件求值器 ==========
//
// 替代"用 LLM 判断分支是否成立"的脆弱做法。
// 支持一个受控的、白名单的表达式子集，结果必须为 boolean。
// 不求值未知语法，未知则抛错（显式失败，而非让模型猜）。

import type { WorkflowState } from "./types";

/**
 * 从 state 中按点路径取值：`result.status` -> state.result.status
 * 支持模板 `{{result.status}}` 或裸路径 `result.status`
 */
function resolvePath(state: WorkflowState, path: string): unknown {
  let cur: unknown = state;
  for (const seg of path.split(".")) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 展开 {{...}} 模板为字面值（用于表达式中内联变量）*/
function expandTemplate(expr: string, state: WorkflowState): string {
  return expr.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, inner: string) => {
    const v = resolvePath(state, inner.trim());
    if (v === undefined) return "undefined";
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
  });
}

/**
 * 受控表达式求值。
 * 产物必须是 boolean；否则返回 null（表示"该表达式求不出布尔结果"）。
 * 支持：
 *   - 字面量：true / false / 数字 / "字符串" / '字符串'
 *   - 比较：== != > < >= <=
 *   - 逻辑：&& || ! （括号分组）
 *   - 函数：contains(a,b) / is_empty(a) / eq(a,b)
 */
export function evaluateCondition(
  expression: string,
  state: WorkflowState,
): boolean {
  const src = expandTemplate(expression.trim(), state);
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  const value = parser.parseExpression();
  if (!parser.isEnd()) {
    throw new Error(`条件表达式存在未解析的尾随内容：${src}`);
  }
  if (typeof value !== "boolean") {
    throw new Error(`条件表达式结果不是布尔值：${src} -> ${String(value)}`);
  }
  return value;
}

// ---------- 迷你 tokenizer + 递归下降解析器 ----------

type TokenType =
  | "literal"
  | "ident"
  | "comma"
  | "lparen"
  | "rparen"
  | "op";

interface Token {
  type: TokenType;
  value: string;
  literal?: unknown;
}

// 双字符操作符优先
const OPERATORS = ["&&", "||", "==", "!=", ">=", "<=", ">", "<", "!"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", value: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", value: ")" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", value: "," });
      i++;
      continue;
    }
    // 字符串字面量
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== quote) {
        out += src[j];
        j++;
      }
      if (j >= src.length) throw new Error(`字符串字面量未闭合：${src}`);
      tokens.push({ type: "literal", value: out, literal: out });
      i = j + 1;
      continue;
    }
    // 双字符操作符
    const two = src.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    // 单字符操作符
    if (["=", ">", "<", "!"].includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    // 数字
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const numStr = src.slice(i, j);
      const num = Number(numStr);
      tokens.push({ type: "literal", value: numStr, literal: num });
      i = j;
      continue;
    }
    // 标识符（true/false/函数名/裸字符串/路径变量）
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === "true" || word === "false") {
        tokens.push({
          type: "literal",
          value: word,
          literal: word === "true",
        });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }
    // 其它字符（如 undefined）
    let j = i;
    while (j < src.length && !/[ (),\t\n\r]/.test(src[j])) j++;
    const word = src.slice(i, j);
    tokens.push({ type: "ident", value: word });
    i = j;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  isEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("意外的表达式结尾");
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.consume();
    if (t.type !== type) {
      throw new Error(`期望 ${type}，实际 ${t.type}(${t.value})`);
    }
    return t;
  }

  parseExpression(): unknown {
    return this.parseOr();
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek()?.type === "op" && this.peek()?.value === "||") {
      this.consume();
      const right = this.parseAnd();
      left = (left as boolean) || (right as boolean);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseCompare();
    while (this.peek()?.type === "op" && this.peek()?.value === "&&") {
      this.consume();
      const right = this.parseCompare();
      left = (left as boolean) && (right as boolean);
    }
    return left;
  }

  private parseCompare(): unknown {
    let left = this.parseNot();
    const opTok = this.peek();
    if (
      opTok?.type === "op" &&
      ["==", "!=", ">", "<", ">=", "<="].includes(opTok.value)
    ) {
      this.consume();
      const right = this.parseNot();
      return compare(left, opTok.value, right);
    }
    return left;
  }

  private parseNot(): unknown {
    if (this.peek()?.type === "op" && this.peek()?.value === "!") {
      this.consume();
      return !(this.parseNot() as boolean);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const t = this.peek();
    if (!t) throw new Error("意外的表达式结尾");
    // 括号分组
    if (t.type === "lparen") {
      this.consume();
      const inner = this.parseExpression();
      this.expect("rparen");
      return inner;
    }
    // 函数调用
    if (t.type === "ident" && this.tokens[this.pos + 1]?.type === "lparen") {
      const name = this.consume().value;
      this.consume(); // (
      const args: unknown[] = [];
      if (this.peek()?.type !== "rparen") {
        args.push(this.parseExpression());
        while (this.peek()?.type === "comma") {
          this.consume();
          args.push(this.parseExpression());
        }
      }
      this.expect("rparen");
      return this.callFunction(name, args);
    }
    // 字面量
    if (t.type === "literal") {
      this.consume();
      return t.literal;
    }
    // 裸标识符：当作字符串字面量（如 undefined / 裸词）
    if (t.type === "ident") {
      const word = this.consume().value;
      if (word === "undefined") return undefined;
      if (word === "null") return null;
      return word; // 视为字符串
    }
    throw new Error(`无法解析表达式标记：${t.value}`);
  }

  private callFunction(name: string, args: unknown[]): unknown {
    switch (name) {
      case "contains": {
        if (args.length < 2) throw new Error("contains 需要两个参数");
        const a = args[0] == null ? "" : String(args[0]);
        const b = args[1] == null ? "" : String(args[1]);
        return a.includes(b);
      }
      case "is_empty": {
        const a = args[0];
        if (a == null) return true;
        if (Array.isArray(a)) return a.length === 0;
        if (typeof a === "string") return a.length === 0;
        return false;
      }
      case "eq": {
        return args[0] === args[1];
      }
      default:
        throw new Error(`不支持的条件函数：${name}`);
    }
  }
}

function compare(left: unknown, op: string, right: unknown): boolean {
  switch (op) {
    case "==":
      return left === right || String(left) === String(right);
    case "!=":
      return !(left === right || String(left) === String(right));
    case ">":
    case "<":
    case ">=":
    case "<=": {
      const l = Number(left);
      const r = Number(right);
      if (Number.isNaN(l) || Number.isNaN(r)) {
        throw new Error(`比较操作需要数字：${String(left)} vs ${String(right)}`);
      }
      if (op === ">") return l > r;
      if (op === "<") return l < r;
      if (op === ">=") return l >= r;
      return l <= r;
    }
    default:
      throw new Error(`不支持的操作符：${op}`);
  }
}