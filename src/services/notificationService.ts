import { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";
import { sendWhatsappMessage, parseRecipientPhones } from "./whatsappService";

export async function checkAndSendAlerts(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return;

  const settingsToCheck = await prisma.notificationSettings.findMany({
    where: {
      enabled: true,
      OR: [{ locationId }, { locationId: null }],
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
    const settings = await tx.notificationSettings.findUnique({
      where: { id: settingsId },
    });

    const phones = parseRecipientPhones(settings?.recipientPhone);
    if (!settings || !settings.enabled || phones.length === 0) return;

    const totalReviews = await tx.review.count({ where: { locationId } });
    const pending = totalReviews - settings.lastAlertReviewCount;

    if (pending < settings.threshold) return;

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

    const panelUrl = `${env.frontendUrl[1]}/resenas/reviews`;

    await tx.notificationSettings.update({
      where: { id: settingsId },
      data: { lastAlertReviewCount: totalReviews, lastAlertAt: new Date() },
    });

    const params = {
      locationName,
      newReviews: pending,
      average: statsWindow._avg.rating ?? 0,
      lowRatingCount,
      whatsappCount,
      emailCount,
      panelUrl,
    };

    const results: Array<{ phone: string; result: Awaited<ReturnType<typeof sendWhatsappMessage>> }> = [];
    for (const phone of phones) {
      const result = await sendWhatsappMessage(phone, params);
      results.push({ phone, result });
    }

    const failed = results.filter((r) => !r.result.ok);
    // "sent" si al menos uno funcionó, "failed" solo si fallaron TODOS
    // (el enum de Prisma no tiene un estado intermedio; el detalle de qué
    // falló queda igual en errorMessage/apiResponse).
    const status: "sent" | "failed" = failed.length < results.length ? "sent" : "failed";

    await tx.notificationLog.create({
      data: {
        locationId,
        type: "whatsapp_alert",
        reviewCount: pending,
        status,
        errorMessage: failed.length
          ? failed.map((f) => `${f.phone}: ${f.result.error}`).join(" | ")
          : null,
        apiResponse: results as any,
      },
    });

    if (failed.length) {
      notificationLogger.error("Alerta de WhatsApp con fallos parciales o totales", {
        locationId,
        failed: failed.map((f) => f.phone),
        totalEnviados: results.length,
      });
    }
  });
}

/**
 * Reintenta los envíos que fallaron recientemente (status "failed").
 * Nota: como "failed" ahora significa "fallaron TODOS los números", el
 * reintento vuelve a mandar a todos los números configurados actualmente
 * (no solo a los que fallaron en su momento, ya que no se persiste ese detalle
 * por número en una columna separada, solo en errorMessage/apiResponse como texto/JSON).
 */
export async function retryFailedNotifications() {
  const failedLogs = await prisma.notificationLog.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  for (const log of failedLogs) {
    if (!log.locationId) continue;

    const settings = await prisma.notificationSettings.findFirst({
      where: { OR: [{ locationId: log.locationId }, { locationId: null }] },
    });

    const phones = parseRecipientPhones(settings?.recipientPhone);
    if (phones.length === 0 || !settings?.enabled) continue;

    const location = await prisma.location.findUnique({
      where: { id: log.locationId },
    });
    if (!location) continue;

    const params = {
      locationName: location.name,
      newReviews: log.reviewCount,
      average: 0,
      lowRatingCount: 0,
      whatsappCount: 0,
      emailCount: 0,
      panelUrl: `${env.frontendUrl}/admin/reviews`,
    };

    const results: Array<{ phone: string; result: Awaited<ReturnType<typeof sendWhatsappMessage>> }> = [];
    for (const phone of phones) {
      const result = await sendWhatsappMessage(phone, params);
      results.push({ phone, result });
    }

    const failed = results.filter((r) => !r.result.ok);
    const status: "sent" | "failed" = failed.length < results.length ? "sent" : "failed";

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status,
        errorMessage: failed.length
          ? failed.map((f) => `${f.phone}: ${f.result.error}`).join(" | ")
          : null,
        apiResponse: results as any,
      },
    });
  }
}