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
  appUrl: process.env.APP_URL,
  frontendUrl: process.env.FRONTEND_URL,

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  cookieName: process.env.COOKIE_NAME ?? "reviews_admin_token",

 // Evolution API (self-hosted, usa WhatsApp Web/Baileys por debajo).
 // baseUrl: URL de tu servidor Evolution, ej: "https://evo.tudominio.com" (sin barra final)
 // apiKey: la global apikey configurada en tu instancia de Evolution (header "apikey")
 // instance: el nombre de la instancia que creaste y ya escaneaste con el QR
 evolutionApi: {
  baseUrl: (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, ""),
  apiKey: process.env.EVOLUTION_API_KEY ?? "",
  instance: process.env.EVOLUTION_INSTANCE ?? "",
  webhookToken: process.env.EVOLUTION_WEBHOOK_TOKEN ?? "",
},

  reviewRateLimit: {
    windowHours: parseInt(process.env.REVIEW_RATE_LIMIT_WINDOW_HOURS ?? "6", 10),
    max: parseInt(process.env.REVIEW_RATE_LIMIT_MAX ?? "1", 10),
  },

  alertCronIntervalMinutes: parseInt(process.env.ALERT_CRON_INTERVAL_MINUTES ?? "5", 10),
};
