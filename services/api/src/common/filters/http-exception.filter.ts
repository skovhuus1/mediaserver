import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpAllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    const body =
      typeof payload === 'string'
        ? { code: 'error', message: payload }
        : { code: 'error', message: 'Internt serverproblem', ...(payload as object) };

    response.status(status).json({
      status,
      correlationId: request.headers['x-correlation-id'],
      error: body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
