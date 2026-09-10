import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../middlewares/errorHandler";
import { authLogger } from "../utils/logger";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    authLogger.warn("Intento de login con email inexistente", { email });
    throw new ApiError(401, "Credenciales inválidas");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    authLogger.warn("Intento de login con password incorrecta", { email });
    throw new ApiError(401, "Credenciales inválidas");
  }

  const signOptions: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, env.jwtSecret, signOptions);

  authLogger.info("Login exitoso", { userId: user.id, email: user.email });

  return { token, user: { id: user.id, email: user.email, role: user.role } };
}
