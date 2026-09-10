import { Request, Response, NextFunction } from "express";
import {
  getPublicLocationBySlug,
  listLocationsAdmin,
  getLocationQr,
  createLocation,
  updateLocation,
  setLocationStatus,
} from "../services/locationService";
import {
  createLocationSchema,
  updateLocationSchema,
  updateLocationStatusSchema,
} from "../utils/schemas";

export async function getPublicLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const location = await getPublicLocationBySlug(req.params.slug);
    res.json(location);
  } catch (err) {
    next(err);
  }
}

export async function listLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const locations = await listLocationsAdmin();
    res.json({ items: locations });
  } catch (err) {
    next(err);
  }
}

export async function getQr(req: Request, res: Response, next: NextFunction) {
  try {
    const qr = await getLocationQr(req.params.id);
    res.json(qr);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createLocationSchema.parse(req.body);
    const location = await createLocation(data);
    res.status(201).json(location);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateLocationSchema.parse(req.body);
    const location = await updateLocation(req.params.id, data);
    res.json(location);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateLocationStatusSchema.parse(req.body);
    const location = await setLocationStatus(req.params.id, data.active);
    res.json(location);
  } catch (err) {
    next(err);
  }
}
