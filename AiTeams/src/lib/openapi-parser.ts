/**
 * OpenAPI 解析器 - 解析 OpenAPI 3.x / Swagger 2.0 文档
 * 提取所有 API 端点，转换为工具定义
 */

export interface ParsedEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody: ParsedRequestBody | null;
  responses: Record<string, unknown>;
}

export interface ParsedParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required: boolean;
  description: string;
  schema: Record<string, unknown>;
}

export interface ParsedRequestBody {
  required: boolean;
  content: Record<string, { schema: Record<string, unknown> }>;
}

export interface ParsedOpenAPI {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  endpoints: ParsedEndpoint[];
}

/**
 * 解析 OpenAPI 文档（支持 JSON 和 YAML 格式）
 */
export function parseOpenAPISchema(raw: string | object): ParsedOpenAPI {
  const doc = typeof raw === "string" ? JSON.parse(raw) : raw;

  const info = doc.info || {};
  const title = info.title || "未命名服务";
  const version = info.version || "1.0";
  const description = info.description || "";

  // 提取 base URL
  let baseUrl = "";
  if (doc.servers && doc.servers.length > 0) {
    baseUrl = doc.servers[0].url;
  } else if (doc.host) {
    // Swagger 2.0 格式
    const scheme = (doc.schemes && doc.schemes[0]) || "https";
    baseUrl = `${scheme}://${doc.host}${doc.basePath || ""}`;
  }

  const endpoints: ParsedEndpoint[] = [];
  const paths = doc.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const methods = pathItem as Record<string, unknown>;
    for (const method of ["get", "post", "put", "delete", "patch", "head", "options"] as const) {
      const operation = methods[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      const parameters: ParsedParameter[] = [];
      // 路径级参数
      const pathParams = (methods.parameters as Array<Record<string, unknown>>) || [];
      // 操作级参数
      const opParams = (operation.parameters as Array<Record<string, unknown>>) || [];

      for (const param of [...pathParams, ...opParams]) {
        parameters.push({
          name: (param.name as string) || "",
          in: (param.in as "query" | "path" | "header" | "cookie") || "query",
          required: (param.required as boolean) || false,
          description: (param.description as string) || "",
          schema: (param.schema as Record<string, unknown>) || { type: "string" },
        });
      }

      let requestBody: ParsedRequestBody | null = null;
      if (operation.requestBody) {
        const rb = operation.requestBody as Record<string, unknown>;
        requestBody = {
          required: (rb.required as boolean) || false,
          content: (rb.content as Record<string, { schema: Record<string, unknown> }>) || {},
        };
      }

      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: (operation.summary as string) || (operation.operationId as string) || "",
        description: (operation.description as string) || (operation.summary as string) || "",
        operationId: (operation.operationId as string) || `${method}_${path.replace(/\//g, "_")}`,
        tags: (operation.tags as string[]) || [],
        parameters,
        requestBody,
        responses: (operation.responses as Record<string, unknown>) || {},
      });
    }
  }

  return { title, version, description, baseUrl, endpoints };
}

/**
 * 将 OpenAPI 端点转换为 HTTP 工具定义
 */
export function endpointToToolDefinition(endpoint: ParsedEndpoint, serviceId: string, baseUrl: string): {
  name: string;
  description: string;
  action: string;
  slug: string;
  tool_type: string;
  mcp_service_id: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyTemplate: string;
  };
} {
  // 生成 slug
  const slug = endpoint.operationId
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 60);

  const action = `http_${slug}`;

  // 构建 URL（替换路径参数为模板变量）
  let url = `${baseUrl}${endpoint.path}`;
  const pathParams = endpoint.parameters.filter((p) => p.in === "path");
  for (const param of pathParams) {
    url = url.replace(`{${param.name}}`, `{{${param.name}}}`);
  }

  // 构建参数列表
  const queryParams = endpoint.parameters.filter((p) => p.in === "query");
  const parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }> = [];

  for (const param of [...pathParams, ...queryParams]) {
    const type = (param.schema?.type as string) || "string";
    parameters.push({
      name: param.name,
      type: type === "integer" ? "number" : type,
      description: param.description || param.name,
      required: param.required,
    });
  }

  // 构建请求体模板
  let bodyTemplate = "";
  if (endpoint.requestBody && endpoint.requestBody.content) {
    const jsonContent = endpoint.requestBody.content["application/json"];
    if (jsonContent?.schema) {
      bodyTemplate = schemaToBodyTemplate(jsonContent.schema);
    }
  }

  // 构建配置
  const config = {
    url,
    method: endpoint.method,
    headers: {
      "Content-Type": "application/json",
    },
    bodyTemplate,
  };

  return {
    name: `${endpoint.summary || endpoint.operationId}`,
    description: endpoint.description || endpoint.summary || "",
    action,
    slug,
    tool_type: "http",
    mcp_service_id: serviceId,
    parameters,
    config,
  };
}

/**
 * 从 JSON Schema 生成 bodyTemplate 示例
 */
function schemaToBodyTemplate(schema: Record<string, unknown>): string {
  if (!schema || !schema.properties) return "{}";

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = (schema.required as string[]) || [];

  const obj: Record<string, string> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const placeholder = isRequired ? `{{${key}}}` : `{{${key}?}}`;
    obj[key] = placeholder;
  }

  return JSON.stringify(obj, null, 2);
}

/**
 * 从 URL 获取 OpenAPI 文档
 */
export async function fetchOpenAPISchema(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json, application/yaml, text/yaml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`获取 OpenAPI 文档失败: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  // 简单处理 YAML 格式（直接转 JSON，生产环境可用 js-yaml 库）
  if (contentType.includes("yaml") || text.trim().startsWith("openapi:") || text.trim().startsWith("swagger:")) {
    // 简单 YAML 到 JSON 转换（仅处理基本结构）
    return convertYamlToJson(text);
  }

  return text;
}

/**
 * 简易 YAML 转 JSON（仅处理 OpenAPI 文档的基本结构）
 */
function convertYamlToJson(yaml: string): string {
  // 这是一个简化实现，对于 OpenAPI 文档的层级结构足够
  // 生产环境建议使用 js-yaml 库
  const lines = yaml.split("\n");
  const result = yamlToJsonRecursive(lines, 0, 0);
  return JSON.stringify(result.obj, null, 2);
}

function yamlToJsonRecursive(
  lines: string[],
  startIndex: number,
  baseIndent: number
): { obj: Record<string, unknown>; endIndex: number } {
  const obj: Record<string, unknown> = {};
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const indent = line.search(/\S/);
    if (indent < baseIndent) break;

    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(":");

    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim();

    if (value === "") {
      // 嵌套对象
      const nested = yamlToJsonRecursive(lines, i + 1, indent + 2);
      obj[key] = nested.obj;
      i = nested.endIndex;
    } else if (value === "|" || value === ">") {
      // 多行字符串
      let strValue = "";
      i++;
      while (i < lines.length && lines[i].search(/\S/) > indent) {
        strValue += (strValue ? "\n" : "") + lines[i].trim();
        i++;
      }
      obj[key] = strValue;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // 内联数组
      obj[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    } else if (value.startsWith("- ")) {
      // 数组项
      const arr: unknown[] = [];
      arr.push(value.slice(2).trim().replace(/^['"]|['"]$/g, ""));
      i++;
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        arr.push(lines[i].trim().slice(2).trim().replace(/^['"]|['"]$/g, ""));
        i++;
      }
      obj[key] = arr;
      continue;
    } else {
      // 简单值
      obj[key] = parseYamlValue(value);
    }
    i++;
  }

  return { obj, endIndex: i };
}

function parseYamlValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value.replace(/^['"]|['"]$/g, "");
}