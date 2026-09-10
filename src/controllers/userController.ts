import { Request, Response, NextFunction } from "express";
import { createUserSchema, updateUserSchema } from "../utils/schemas";
import { listUsers, createUser, updateUser, deleteUser } from "../services/userService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listUsers();
    res.json({ items: users });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await createUser(data);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await updateUser(req.params.id, data, req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteUser(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
