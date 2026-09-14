import type { Config } from "drizzle-kit";

export default {
  schema: "./src/storage/database/shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.COZE_SUPABASE_URL || "",
  },
  verbose: true,
  strict: true,
} satisfies Config;