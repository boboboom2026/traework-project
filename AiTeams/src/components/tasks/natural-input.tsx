"use client";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface InputKeySpec {
  /** 变量名，需与提示词中的 {{变量}} 一致 */
  key: string;
  /** 中文标签 */
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export type InputMode = "natural" | "json";

interface NaturalInputProps {
  keys: InputKeySpec[];
  /** 自然语言模式下的变量取值 */
  values: Record<string, string>;
  onValuesChange: (next: Record<string, string>) => void;
  /** 高级模式下的原始 JSON 文本 */
  rawJson: string;
  onRawJsonChange: (next: string) => void;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
}

function ModeSwitch({ mode, onModeChange }: { mode: InputMode; onModeChange: (mode: InputMode) => void }) {
  const options: Array<{ value: InputMode; label: string }> = [
    { value: "natural", label: "自然语言" },
    { value: "json", label: "高级 (JSON)" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onModeChange(option.value)}
          className={cn(
            "rounded-[calc(var(--radius)-4px)] px-2 py-0.5 text-xs transition-colors",
            mode === option.value
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 任务初始输入
 * - 自然语言模式：直接用人话描述需求，按变量渲染为一个或多个输入项，界面上不出现 JSON
 * - 高级模式：保留原始 JSON 编辑能力（外部系统调用 / 多变量复杂场景）
 */
export function NaturalInput({
  keys,
  values,
  onValuesChange,
  rawJson,
  onRawJsonChange,
  mode,
  onModeChange,
}: NaturalInputProps) {
  const missingKeys = keys.filter((item) => item.required !== false && !(values[item.key] ?? "").trim());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {mode === "natural" ? "用一句话描述你的需求即可" : "JSON 格式，key 需与提示词变量一致"}
        </span>
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>

      {mode === "natural" ? (
        <div className="space-y-3">
          {keys.length === 0 ? (
            <Textarea
              value={values.__freeform ?? ""}
              onChange={(event) => onValuesChange({ ...values, __freeform: event.target.value })}
              placeholder="本任务无需额外输入，可直接运行；如需补充说明可写在这里"
              className="min-h-24 resize-y text-sm"
            />
          ) : (
            keys.map((item) => (
              <div key={item.key} className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium" htmlFor={`input-${item.key}`}>
                  {item.label ?? item.key}
                  {item.required === false ? (
                    <span className="font-normal text-muted-foreground">（选填）</span>
                  ) : null}
                </label>
                <Textarea
                  id={`input-${item.key}`}
                  value={values[item.key] ?? ""}
                  onChange={(event) => onValuesChange({ ...values, [item.key]: event.target.value })}
                  placeholder={item.placeholder ?? "用自然语言描述，例如：帮我写一篇……"}
                  className="min-h-24 resize-y text-sm"
                />
                {item.description ? (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : (
        <Textarea
          value={rawJson}
          onChange={(event) => onRawJsonChange(event.target.value)}
          placeholder='{"user_input": "……"}'
          className="min-h-28 resize-y font-mono text-xs"
        />
      )}

      {mode === "natural" && missingKeys.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          还需填写：{missingKeys.map((item) => item.label ?? item.key).join("、")}
        </p>
      ) : null}
    </div>
  );
}
