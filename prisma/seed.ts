import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LOCATIONS = [
  { slug: "local-1", name: "Local 1", address: "Dirección de ejemplo 1", phone: "+54 9 11 0000-0001" },
  { slug: "local-2", name: "Local 2", address: "Dirección de ejemplo 2", phone: "+54 9 11 0000-0002" },
  { slug: "local-3", name: "Local 3", address: "Dirección de ejemplo 3", phone: "+54 9 11 0000-0003" },
  { slug: "local-4", name: "Local 4", address: "Dirección de ejemplo 4", phone: "+54 9 11 0000-0004" },
  { slug: "local-5", name: "Local 5", address: "Dirección de ejemplo 5", phone: "+54 9 11 0000-0005" },
];

async function main() {
  console.log("Sembrando locales...");
  for (const loc of LOCATIONS) {
    const location = await prisma.location.upsert({
      where: { slug: loc.slug },
      update: {},
      create: loc,
    });

    // Config de notificaciones por local, deshabilitada por defecto
    await prisma.notificationSettings.upsert({
      where: { locationId: location.id },
      update: {},
      create: {
        locationId: location.id,
        enabled: false,
        threshold: 10,
        recipientPhone: null,
      },
    });
  }

  // Config global de notificaciones (locationId null)
  const globalSettings = await prisma.notificationSettings.findFirst({
    where: { locationId: null },
  });
  if (!globalSettings) {
    await prisma.notificationSettings.create({
      data: {
        locationId: null,
        enabled: false,
        threshold: 10,
        recipientPhone: null,
      },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos en .env. Se omite creación de usuario admin."
    );
  } else {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await prisma.user.create({
        data: { email: adminEmail, passwordHash, role: "admin" },
      });
      console.log(`Usuario admin creado: ${adminEmail}`);
    } else {
      console.log("Usuario admin ya existe, se omite.");
    }
  }

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
