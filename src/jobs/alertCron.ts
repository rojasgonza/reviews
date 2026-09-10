import cron from "node-cron";
import { env } from "../config/env";
import { retryFailedNotifications } from "../services/notificationService";
import { notificationLogger } from "../utils/logger";

/**
 * Cron de respaldo: reintenta notificaciones fallidas periódicamente.
 * La evaluación "en caliente" (al crear cada reseña) ya dispara las
 * alertas; este job solo cubre el caso de fallas transitorias de WhatsApp.
 */
export function startAlertCron() {
  const minutes = env.alertCronIntervalMinutes;
  const expression = `*/${minutes} * * * *`;

  cron.schedule(expression, async () => {
    try {
      await retryFailedNotifications();
    } catch (err) {
      notificationLogger.error("Error en el cron de reintentos", {
        error: err instanceof Error ? err.message : err,
      });
    }
  });

  notificationLogger.info(`Cron de reintentos de alertas iniciado (cada ${minutes} min)`);
}
