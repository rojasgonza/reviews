import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { list, create, update, remove } from "../controllers/userController";

const router = Router();

// Solo usuarios con rol "admin" pueden gestionar otros usuarios
router.use(requireAuth, requireRole("admin"));

router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
