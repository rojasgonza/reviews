import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),
  appUrl: process.env.APP_URL ?? "http://localhost:4000",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  cookieName: process.env.COOKIE_NAME ?? "reviews_admin_token",

  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v20.0",
  },

  reviewRateLimit: {
    windowHours: parseInt(process.env.REVIEW_RATE_LIMIT_WINDOW_HOURS ?? "6", 10),
    max: parseInt(process.env.REVIEW_RATE_LIMIT_MAX ?? "1", 10),
  },

  alertCronIntervalMinutes: parseInt(process.env.ALERT_CRON_INTERVAL_MINUTES ?? "5", 10),
};
