import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db";
import { notificationSettingsSchema } from "../utils/schemas";
import { ApiError } from "../middlewares/errorHandler";

export async function listSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.notificationSettings.findMany({
      include: { location: { select: { id: true, name: true, slug: true } } },
    });

    const withCounters = await Promise.all(
      settings.map(async (s) => {
        const total = s.locationId
          ? await prisma.review.count({ where: { locationId: s.locationId } })
          : await prisma.review.count();
        const since = total - s.lastAlertReviewCount;
        const remaining = Math.max(s.threshold - since, 0);
        return {
          id: s.id,
          locationId: s.locationId,
          locationName: s.location?.name ?? "Global (todos los locales)",
          enabled: s.enabled,
          threshold: s.threshold,
          recipientPhone: s.recipientPhone,
          lastAlertAt: s.lastAlertAt,
          reviewsSinceLastAlert: since,
          nextAlertInReviews: remaining,
        };
      })
    );

    res.json({ items: withCounters });
  } catch (err) {
    next(err);
  }
}

export async function upsertSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = notificationSettingsSchema.parse(req.body);
    const locationId = data.locationId ?? null;

    const existing = await prisma.notificationSettings.findFirst({ where: { locationId } });

    let settings;
    if (existing) {
      settings = await prisma.notificationSettings.update({
        where: { id: existing.id },
        data: {
          enabled: data.enabled,
          threshold: data.threshold,
          recipientPhone: data.recipientPhone,
        },
      });
    } else {
      if (locationId) {
        const loc = await prisma.location.findUnique({ where: { id: locationId } });
        if (!loc) throw new ApiError(404, "Local no encontrado");
      }
      settings = await prisma.notificationSettings.create({
        data: {
          locationId,
          enabled: data.enabled,
          threshold: data.threshold,
          recipientPhone: data.recipientPhone,
        },
      });
    }

    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function listLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { location: { select: { name: true, slug: true } } },
    });
    res.json({ items: logs });
  } catch (err) {
    next(err);
  }
}
