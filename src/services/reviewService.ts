import { Prisma, ReviewStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { ApiError } from "../middlewares/errorHandler";
import { reviewLogger } from "../utils/logger";
import { checkAndSendAlerts } from "./notificationService";

interface CreateReviewInput {
  locationSlug: string;
  rating: number;
  comment: string;
  customerName?: string;
  whatsapp?: string;
  email?: string;
  contactConsent?: boolean;
  ipAddress?: string;
}

export async function createReview(input: CreateReviewInput) {
  const location = await prisma.location.findUnique({ where: { slug: input.locationSlug } });
  if (!location || !location.active) {
    throw new ApiError(404, "Local no encontrado o inactivo");
  }

  const review = await prisma.review.create({
    data: {
      locationId: location.id,
      rating: input.rating,
      comment: input.comment,
      customerName: input.customerName,
      whatsapp: input.whatsapp,
      email: input.email,
      contactConsent: input.contactConsent ?? false,
      ipAddress: input.ipAddress,
      status: ReviewStatus.pending,
    },
  });

  reviewLogger.info("Reseña creada", { reviewId: review.id, locationId: location.id, rating: review.rating });

  // La alerta se evalúa de forma asíncrona; si falla, no debe afectar
  // la respuesta al cliente ni perder la reseña (requisito punto 26).
  checkAndSendAlerts(location.id).catch((err) => {
    reviewLogger.error("Error evaluando alertas tras nueva reseña", { error: err instanceof Error ? err.message : err });
  });

  return review;
}

export interface ReviewFilters {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  rating?: number;
  status?: ReviewStatus;
  hasWhatsapp?: boolean;
  hasEmail?: boolean;
  search?: string;
  sort?: "recent" | "oldest" | "rating_desc" | "rating_asc";
  page?: number;
  pageSize?: number;
}

export async function listReviews(filters: ReviewFilters) {
  const where: Prisma.ReviewWhereInput = {};

  if (filters.locationId) where.locationId = filters.locationId;
  if (filters.rating) where.rating = filters.rating;
  if (filters.status) where.status = filters.status;
  if (filters.hasWhatsapp) where.whatsapp = { not: null };
  if (filters.hasEmail) where.email = { not: null };

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { comment: { contains: filters.search, mode: "insensitive" } },
      { whatsapp: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.ReviewOrderByWithRelationInput =
    filters.sort === "oldest"
      ? { createdAt: "asc" }
      : filters.sort === "rating_desc"
      ? { rating: "desc" }
      : filters.sort === "rating_asc"
      ? { rating: "asc" }
      : { createdAt: "desc" };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { location: { select: { name: true, slug: true } } },
    }),
    prisma.review.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function respondToReview(id: string, response: string) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new ApiError(404, "Reseña no encontrada");

  return prisma.review.update({
    where: { id },
    data: {
      adminResponse: response,
      respondedAt: new Date(),
      status: ReviewStatus.responded,
    },
  });
}

export async function updateReviewStatus(id: string, status: ReviewStatus) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new ApiError(404, "Reseña no encontrada");
  return prisma.review.update({ where: { id }, data: { status } });
}
