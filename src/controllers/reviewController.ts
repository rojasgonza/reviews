import { Request, Response, NextFunction } from "express";
import { createReviewSchema, respondReviewSchema, updateReviewStatusSchema } from "../utils/schemas";
import { createReview, listReviews, respondToReview, updateReviewStatus } from "../services/reviewService";
import { ReviewStatus } from "@prisma/client";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createReviewSchema.parse(req.body);

    // Honeypot: campo oculto que un humano nunca completa. Si viene con
    // contenido, es casi seguro un bot; respondemos 201 "falso" para no
    // darle feedback al bot, pero no guardamos nada.
    if (data.website) {
      return res.status(201).json({ ok: true });
    }

    const slug = req.params.slug;
    const ipAddress = req.ip;

    const review = await createReview({
      locationSlug: slug,
      rating: data.rating,
      comment: data.comment,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      email: data.email,
      contactConsent: data.contactConsent,
      ipAddress,
    });

    res.status(201).json({
      id: review.id,
      rating: review.rating,
      createdAt: review.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query;
    const result = await listReviews({
      locationId: q.locationId as string | undefined,
      dateFrom: q.dateFrom as string | undefined,
      dateTo: q.dateTo as string | undefined,
      rating: q.rating ? parseInt(q.rating as string, 10) : undefined,
      status: q.status as ReviewStatus | undefined,
      hasWhatsapp: q.hasWhatsapp === "true",
      hasEmail: q.hasEmail === "true",
      search: q.search as string | undefined,
      sort: q.sort as any,
      page: q.page ? parseInt(q.page as string, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function respond(req: Request, res: Response, next: NextFunction) {
  try {
    const data = respondReviewSchema.parse(req.body);
    const review = await respondToReview(req.params.id, data.response);
    res.json(review);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateReviewStatusSchema.parse(req.body);
    const review = await updateReviewStatus(req.params.id, data.status as ReviewStatus);
    res.json(review);
  } catch (err) {
    next(err);
  }
}
