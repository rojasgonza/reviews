import { prisma } from "../config/db";
import { toSlug } from "../utils/slugify";
import { generateLocationQr, getReviewUrl } from "../utils/qr";
import { ApiError } from "../middlewares/errorHandler";

export async function getPublicLocationBySlug(slug: string) {
  const location = await prisma.location.findUnique({ where: { slug } });
  if (!location || !location.active) {
    throw new ApiError(404, "Local no encontrado o inactivo");
  }
  return {
    slug: location.slug,
    name: location.name,
    address: location.address,
    logoUrl: location.logoUrl,
    googleReviewUrl: location.googleReviewUrl,
    links: location.links ?? [],
  };
}

export async function listLocationsAdmin() {
  const locations = await prisma.location.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { reviews: true } },
    },
  });

  const withStats = await Promise.all(
    locations.map(async (loc) => {
      const agg = await prisma.review.aggregate({
        where: { locationId: loc.id },
        _avg: { rating: true },
      });
      return {
        id: loc.id,
        slug: loc.slug,
        name: loc.name,
        address: loc.address,
        phone: loc.phone,
        logoUrl: loc.logoUrl,
        googleReviewUrl: loc.googleReviewUrl,
        links: loc.links ?? [],
        active: loc.active,
        reviewCount: loc._count.reviews,
        averageRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
        reviewUrl: getReviewUrl(loc.slug),
      };
    })
  );

  return withStats;
}

export async function getLocationQr(id: string) {
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) throw new ApiError(404, "Local no encontrado");
  const dataUrl = await generateLocationQr(location.slug);
  return { dataUrl, url: getReviewUrl(location.slug) };
}

export async function createLocation(input: {
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  googleReviewUrl?: string;
  links?: Array<{ title: string; url: string; icon?: string }>;
}) {
  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  const existing = await prisma.location.findUnique({ where: { slug } });
  if (existing) {
    throw new ApiError(409, `Ya existe un local con el slug "${slug}"`);
  }

  const location = await prisma.location.create({
    data: {
      name: input.name,
      slug,
      address: input.address,
      phone: input.phone,
      logoUrl: input.logoUrl,
      googleReviewUrl: input.googleReviewUrl,
      links: input.links ?? [],
    },
  });

  // Cada local nuevo recibe su config de notificaciones propia, deshabilitada por defecto.
  await prisma.notificationSettings.create({
    data: { locationId: location.id, enabled: false, threshold: 10 },
  });

  return location;
}

export async function updateLocation(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    address: string;
    phone: string;
    logoUrl: string;
    googleReviewUrl: string;
    links: Array<{ title: string; url: string; icon?: string }>;
  }>
) {
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) throw new ApiError(404, "Local no encontrado");

  let newSlug = location.slug;
  if (input.slug) {
    newSlug = toSlug(input.slug);
    const clash = await prisma.location.findFirst({
      where: { slug: newSlug, NOT: { id } },
    });
    if (clash) throw new ApiError(409, `Ya existe un local con el slug "${newSlug}"`);
  }

  return prisma.location.update({
    where: { id },
    data: {
      name: input.name ?? location.name,
      slug: newSlug,
      address: input.address ?? location.address,
      phone: input.phone ?? location.phone,
      logoUrl: input.logoUrl ?? location.logoUrl,
      googleReviewUrl: input.googleReviewUrl ?? location.googleReviewUrl,
      links: input.links ?? (location.links as any) ?? [],
    },
  });
}

export async function setLocationStatus(id: string, active: boolean) {
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) throw new ApiError(404, "Local no encontrado");
  return prisma.location.update({ where: { id }, data: { active } });
}