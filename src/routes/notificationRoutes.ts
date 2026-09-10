import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { listSettings, upsertSettings, listLogs } from "../controllers/notificationController";

const router = Router();

router.get("/", requireAuth, listSettings);
router.put("/", requireAuth, upsertSettings);
router.get("/logs", requireAuth, listLogs);

export default router;
