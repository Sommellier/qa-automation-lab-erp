import type { Request, Response } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  summary = async (_request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.getSummary());
  };
}
