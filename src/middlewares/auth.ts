import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Protege rutas administrativas. Lee el JWT desde una cookie httpOnly
 * (preferido, mitiga XSS) o desde el header Authorization como fallback
 * para clientes no-browser (ej. Postman, scripts).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const tokenFromCookie = req.cookies?.[env.cookieName];
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = tokenFromCookie ?? tokenFromHeader;

  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
