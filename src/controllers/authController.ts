import { Request, Response, NextFunction } from "express";
import { loginSchema } from "../utils/schemas";
import { login } from "../services/authService";
import { env } from "../config/env";

const cookieOptions = {
  httpOnly: true,
  secure: true, // obligatorio para SameSite=None; el sitio ya usa HTTPS
  sameSite: "lax" as const, // frontend y backend están en subdominios distintos (cross-site)
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = loginSchema.parse(req.body);
    const { token, user } = await login(data.email, data.password);
    res.cookie(env.cookieName, token, cookieOptions);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req: Request, res: Response) {
  res.clearCookie(env.cookieName, { path: "/", secure: true, sameSite: "lax" });
  res.json({ ok: true });
}

export async function meController(req: Request, res: Response) {
  res.json({ user: req.user });
}
