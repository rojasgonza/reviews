import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { reviewCreationLimiter } from "../middlewares/rateLimit";
import { create, list, respond, updateStatus } from "../controllers/reviewController";

const router = Router();

// Público: crear reseña para un local (identificado por slug, ej. desde el QR)
router.post("/public/:slug", reviewCreationLimiter, create);

// Admin
router.get("/", requireAuth, list);
router.post("/:id/response", requireAuth, respond);
router.patch("/:id/status", requireAuth, updateStatus);

export default router;
