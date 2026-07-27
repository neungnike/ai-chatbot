import "dotenv/config";

export interface AppConfig {
  port: number;
  databaseUrl: string;
  qwenApiKey: string;
  qwenBaseUrl: string;
  allowedOrigins: string[];
  lineChannelAccessToken: string;
  lineChannelSecret: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? "3000"),
    databaseUrl: requireEnv("DATABASE_URL"),
    qwenApiKey: requireEnv("QWEN_API_KEY"),
    qwenBaseUrl: requireEnv("QWEN_BASE_URL"),
    allowedOrigins: requireEnv("ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    lineChannelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    lineChannelSecret: requireEnv("LINE_CHANNEL_SECRET"),
  };
}
