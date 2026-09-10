import { prisma } from "../config/db";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export async function getDashboardData(locationId?: string) {
  const where = locationId ? { locationId } : {};

  const [total, today, last7, last30, avgAgg] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.count({ where: { ...where, createdAt: { gte: startOfDay(new Date()) } } }),
    prisma.review.count({ where: { ...where, createdAt: { gte: daysAgo(7) } } }),
    prisma.review.count({ where: { ...where, createdAt: { gte: daysAgo(30) } } }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
  ]);

  const ratingBuckets = await Promise.all(
    [1, 2, 3, 4, 5].map(async (r) => ({
      rating: r,
      count: await prisma.review.count({ where: { ...where, rating: r } }),
    }))
  );

  const pendingResponse = await prisma.review.count({ where: { ...where, status: "pending" } });
  const lowRating = await prisma.review.count({ where: { ...where, rating: { lte: 2 } } });
  const withWhatsapp = await prisma.review.count({ where: { ...where, whatsapp: { not: null } } });
  const withEmail = await prisma.review.count({ where: { ...where, email: { not: null } } });

  // Promedio y cantidad por local (para comparación entre locales)
  const locations = await prisma.location.findMany({ where: { active: true } });
  const perLocation = await Promise.all(
    locations.map(async (loc) => {
      const [count, agg] = await Promise.all([
        prisma.review.count({ where: { locationId: loc.id } }),
        prisma.review.aggregate({ where: { locationId: loc.id }, _avg: { rating: true } }),
      ]);
      return {
        locationId: loc.id,
        name: loc.name,
        slug: loc.slug,
        reviewCount: count,
        averageRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
      };
    })
  );

  // Reseñas por día (últimos 30 días) para el gráfico de evolución
  const recentReviews = await prisma.review.findMany({
    where: { ...where, createdAt: { gte: daysAgo(30) } },
    select: { createdAt: true, rating: true },
  });
  const byDayMap = new Map<string, { count: number; sum: number }>();
  for (const r of recentReviews) {
    const key = r.createdAt.toISOString().slice(0, 10);
    const entry = byDayMap.get(key) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += r.rating;
    byDayMap.set(key, entry);
  }
  const reviewsByDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, count: v.count, average: Number((v.sum / v.count).toFixed(2)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const last5 = await prisma.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { location: { select: { name: true, slug: true } } },
  });

  return {
    total,
    today,
    last7Days: last7,
    last30Days: last30,
    average: avgAgg._avg.rating ? Number(avgAgg._avg.rating.toFixed(2)) : null,
    ratingBuckets,
    pendingResponse,
    lowRating,
    withWhatsapp,
    withEmail,
    perLocation,
    reviewsByDay,
    latestReviews: last5,
  };
}
