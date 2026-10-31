import type { Request, Response } from 'express';
import { clientReportQuerySchema, orderReportQuerySchema, productReportQuerySchema, revenueReportQuerySchema } from '../schemas/report.schema.js';
import type { ReportService } from '../services/report.service.js';

export class ReportController {
  constructor(private readonly service: ReportService) {}
  clients = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.clients(clientReportQuerySchema.parse(request.query))); };
  products = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.products(productReportQuerySchema.parse(request.query))); };
  exportProducts = async (request: Request, response: Response): Promise<void> => {
    const format = request.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const query = productReportQuerySchema.parse({ ...request.query, page: 1, pageSize: 100 });
    const file = await this.service.exportProducts(query, format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.status(200).send(file.content);
  };
  orders = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.orders(orderReportQuerySchema.parse(request.query))); };
  revenue = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.revenue(revenueReportQuerySchema.parse(request.query))); };
}
