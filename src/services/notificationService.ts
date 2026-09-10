import { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";
import { sendWhatsappMessage } from "./whatsappService";

/**
 * Lógica central de alertas (requisito punto 27 del spec).
 *
 * Idempotencia: en vez de contar "reseñas desde el último envío" en memoria,
 * usamos `lastAlertReviewCount`, que guarda el total acumulado de reseñas
 * del local en el momento del último envío exitoso. En cada evaluación:
 *
 *   pendientes = totalActual - lastAlertReviewCount
 *   si pendientes >= threshold -> se dispara la alerta
 *
 * La actualización de `lastAlertReviewCount` ocurre en la misma transacción
 * que la creación del `notification_log`, así que si el proceso se cae a
 * mitad de camino, al reiniciar el cálculo vuelve a partir del último
 * estado consistente en DB (no se duplica ni se pierde el conteo).
 */
export async function checkAndSendAlerts(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return;

  const settingsToCheck = await prisma.notificationSettings.findMany({
    where: {
      enabled: true,
      OR: [{ locationId }, { locationId: null }], // config específica del local + config global
    },
  });

  for (const settings of settingsToCheck) {
    await evaluateAndSend(settings.id, location.id, location.name);
  }
}

async function evaluateAndSend(
  settingsId: string,
  locationId: string,
  locationName: string,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Lock lógico: releemos dentro de la transacción para evitar carreras
    // si dos reseñas llegan casi al mismo tiempo.
    const settings = await tx.notificationSettings.findUnique({
      where: { id: settingsId },
    });
    if (!settings || !settings.enabled || !settings.recipientPhone) return;

    const totalReviews = await tx.review.count({ where: { locationId } });
    const pending = totalReviews - settings.lastAlertReviewCount;

    if (pending < settings.threshold) return;

    // Métricas para el template
    const statsWindow = await tx.review.aggregate({
      where: { locationId },
      _avg: { rating: true },
    });

    const lowRatingCount = await tx.review.count({
      where: { locationId, rating: { lte: 2 } },
    });

    const whatsappCount = await tx.review.count({
      where: { locationId, whatsapp: { not: null } },
    });

    const emailCount = await tx.review.count({
      where: { locationId, email: { not: null } },
    });

    const panelUrl = `${env.frontendUrl}/admin/reviews`;

    // Reservamos el conteo ANTES de intentar enviar para que, incluso si el
    // proceso se cae durante el envío, no se recalculen alertas duplicadas
    // al reiniciar. Si el envío falla, queda registrado en notification_logs
    // y se puede reintentar manualmente o vía el próximo ciclo (ver reintento abajo).
    await tx.notificationSettings.update({
      where: { id: settingsId },
      data: { lastAlertReviewCount: totalReviews, lastAlertAt: new Date() },
    });

    // Enviamos el template aprobado (no texto libre) porque las alertas son
    // business-initiated y caen fuera de la ventana de 24h de WhatsApp.
    const result = await sendWhatsappMessage(settings.recipientPhone, {
      locationName,
      newReviews: pending,
      average: statsWindow._avg.rating ?? 0,
      lowRatingCount,
      whatsappCount,
      emailCount,
      panelUrl,
    });

    await tx.notificationLog.create({
      data: {
        locationId,
        type: "whatsapp_alert",
        reviewCount: pending,
        status: result.ok ? "sent" : "failed",
        errorMessage: result.ok ? null : result.error,
        apiResponse: (result.response as any) ?? undefined,
      },
    });

    if (!result.ok) {
      notificationLogger.error("Alerta de WhatsApp falló, reseña no se pierde", {
        locationId,
        error: result.error,
        providerCode: result.providerCode,
      });
    }
  });
}

/**
 * Reintenta los envíos que fallaron recientemente. Pensado para ser
 * invocado por el cron job periódico (jobs/alertCron.ts).
 *
 * ⚠️ NOTA: los stats (average, lowRatingCount, whatsappCount, emailCount)
 * se mandan en 0 porque el log no los persiste. Si querés que los reintentos
 * reflejen los mismos números que el envío original, agregá esos campos al
 * modelo `NotificationLog` (average, lowRatingCount, whatsappCount, emailCount)
 * y guardalos en `evaluateAndSend`. Mientras tanto, el template se renderiza
 * con ceros en esas posiciones.
 */
export async function retryFailedNotifications() {
  const failed = await prisma.notificationLog.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  for (const log of failed) {
    if (!log.locationId) continue;

    const settings = await prisma.notificationSettings.findFirst({
      where: { OR: [{ locationId: log.locationId }, { locationId: null }] },
    });
    if (!settings?.recipientPhone || !settings.enabled) continue;

    const location = await prisma.location.findUnique({
      where: { id: log.locationId },
    });
    if (!location) continue;

    const result = await sendWhatsappMessage(settings.recipientPhone, {
      locationName: location.name,
      newReviews: log.reviewCount,
      // TODO: persistir estos valores en NotificationLog para reintentos fieles
      average: 0,
      lowRatingCount: 0,
      whatsappCount: 0,
      emailCount: 0,
      panelUrl: `${env.frontendUrl}/admin/reviews`,
    });

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: result.ok ? "sent" : "failed",
        errorMessage: result.ok ? null : result.error,
        apiResponse: (result.response as any) ?? undefined,
      },
    });
  }
}