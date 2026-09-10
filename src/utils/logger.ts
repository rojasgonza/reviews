import winston from "winston";
import path from "path";

const logsDir = path.join(__dirname, "..", "..", "logs");

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: path.join(logsDir, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(logsDir, "combined.log") }),
  ],
});

// Loggers con contexto por dominio, todos escriben en los mismos archivos
// pero con una etiqueta para facilitar el diagnóstico (punto 25 del spec).
export const authLogger = logger.child({ context: "auth" });
export const reviewLogger = logger.child({ context: "review" });
export const notificationLogger = logger.child({ context: "notification" });
