import { Request, Response, NextFunction } from "express";
import { getDashboardData } from "../services/dashboardService";

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const locationParam = req.query.location as string | undefined;
    const locationId = locationParam && locationParam !== "all" ? locationParam : undefined;
    const data = await getDashboardData(locationId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
