import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getPublicLocation,
  listLocations,
  getQr,
  create,
  update,
  updateStatus,
} from "../controllers/locationController";

const router = Router();

// Público: usado por el frontend de reseñas para identificar el local del QR
router.get("/public/:slug", getPublicLocation);

// Admin
router.get("/", requireAuth, listLocations);
router.post("/", requireAuth, create);
router.put("/:id", requireAuth, update);
router.patch("/:id/status", requireAuth, updateStatus);
router.get("/:id/qr", requireAuth, getQr);

export default router;
