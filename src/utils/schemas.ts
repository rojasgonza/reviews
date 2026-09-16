import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "El comentario es obligatorio").max(2000),
  customerName: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")).transform((v) => v || undefined),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).transform((v) => v || undefined),
  contactConsent: z.boolean().optional().default(false),
  // honeypot anti-bot: si viene completo, se descarta silenciosamente en el controller
  website: z.string().optional(),
});

export const respondReviewSchema = z.object({
  response: z.string().trim().min(1, "La respuesta no puede estar vacía").max(2000),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(["pending", "responded", "archived"]),
});

export const locationLinkSchema = z.object({
  title: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(1000),
  icon: z.enum(["menu", "instagram", "whatsapp", "web", "other"]).optional(),
});

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "Slug inválido").optional(),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  logoUrl: z.string().trim().url().max(500).optional(),
  googleReviewUrl: z.string().trim().url().max(500).optional(),
  links: z.array(locationLinkSchema).max(20).optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

export const updateLocationStatusSchema = z.object({
  active: z.boolean(),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["admin", "editor"]).default("admin"),
});

export const updateUserSchema = z.object({
  email: z.string().trim().email().optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
  role: z.enum(["admin", "editor"]).optional(),
});

export const notificationSettingsSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  enabled: z.boolean(),
  threshold: z.number().int().min(1).max(1000),
  recipientPhone: z.string().trim().max(30).nullable().optional(),
});