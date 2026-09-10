import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { ApiError } from "../middlewares/errorHandler";
import { authLogger } from "../utils/logger";

const SAFE_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
};

export async function listUsers() {
  return prisma.user.findMany({
    select: SAFE_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export async function createUser(data: { email: string; password: string; role: string }) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ApiError(409, "Ya existe un usuario con ese email");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, role: data.role },
    select: SAFE_SELECT,
  });

  authLogger.info("Usuario creado", { userId: user.id, email: user.email, role: user.role });
  return user;
}

export async function updateUser(
  id: string,
  data: { email?: string; password?: string; role?: string },
  actingUserId: string
) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new ApiError(404, "Usuario no encontrado");
  }

  if (data.email && data.email !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ApiError(409, "Ya existe un usuario con ese email");
    }
  }

  // Evita que un admin se saque el rol de admin a sí mismo y se quede afuera
  if (data.role && data.role !== "admin" && target.id === actingUserId) {
    throw new ApiError(400, "No podés quitarte el rol de admin a vos mismo");
  }

  const updateData: { email?: string; passwordHash?: string; role?: string } = {};
  if (data.email) updateData.email = data.email;
  if (data.role) updateData.role = data.role;
  if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: SAFE_SELECT,
  });

  authLogger.info("Usuario actualizado", { userId: user.id });
  return user;
}

export async function deleteUser(id: string, actingUserId: string) {
  if (id === actingUserId) {
    throw new ApiError(400, "No podés eliminar tu propio usuario");
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new ApiError(404, "Usuario no encontrado");
  }

  // Evita quedarse sin ningún admin en el sistema
  if (target.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      throw new ApiError(400, "No se puede eliminar al único usuario admin");
    }
  }

  await prisma.user.delete({ where: { id } });
  authLogger.info("Usuario eliminado", { userId: id });
}
