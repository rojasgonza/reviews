import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/**
 * Limita cuántas reseñas puede enviar una misma IP en una ventana de tiempo.
 * Es una primera barrera contra spam, simple y sin dependencias externas
 * (ver análisis en Fase 1: se evita CAPTCHA para no afectar la UX mobile).
 */
export const reviewCreationLimiter = rateLimit({
  windowMs: env.reviewRateLimit.windowHours * 60 * 60 * 1000,
  max: env.reviewRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Ya enviaste una reseña recientemente. Intentá nuevamente más tarde.",
  },
});

/** Rate limit más laxo para el login, para evitar fuerza bruta. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de login. Probá de nuevo en unos minutos." },
});
