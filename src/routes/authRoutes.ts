import { Router } from "express";
import { loginController, logoutController, meController } from "../controllers/authController";
import { requireAuth } from "../middlewares/auth";
import { loginLimiter } from "../middlewares/rateLimit";

const router = Router();

router.post("/login", loginLimiter, loginController);
router.post("/logout", logoutController);
router.get("/me", requireAuth, meController);

export default router;
