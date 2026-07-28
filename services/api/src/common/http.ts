import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { correlationId, requestContext } from './request-context';

type StructuredException = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const id = String(request.headers['x-correlation-id'] ?? randomUUID());
    response.setHeader('x-correlation-id', id);
    const startedAt = performance.now();

    return requestContext.run({ correlationId: id }, () =>
      next.handle().pipe(
        tap({
          next: () => {
            console.info(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              component: 'http',
              correlationId: id,
              method: request.method,
              path: request.path,
              statusCode: response.statusCode,
              durationMs: Math.round(performance.now() - startedAt),
            }));
          },
          error: () => {
            console.warn(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'warn',
              component: 'http',
              correlationId: id,
              method: request.method,
              path: request.path,
              statusCode: response.statusCode,
              durationMs: Math.round(performance.now() - startedAt),
            }));
          },
        }),
      ),
    );
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const details = typeof raw === 'object' && raw !== null ? raw as StructuredException : {};
    const message = Array.isArray(details.message)
      ? details.message.join(', ')
      : details.message ?? (status === 500 ? 'Internal server error' : String(raw ?? 'Request failed'));

    if (!(exception instanceof HttpException)) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        component: 'api',
        correlationId: correlationId(),
        error: exception instanceof Error ? exception.message : 'Unknown error',
      }));
    }

    response.status(status).json({
      statusCode: status,
      code: details.code ?? (status === 500 ? 'internal_error' : 'request_failed'),
      message,
      correlationId: correlationId(),
      ...(details.details === undefined ? {} : { details: details.details }),
    });
  }
}

export function validationException(messages: string[]): BadRequestException {
  return new BadRequestException({
    code: 'validation_failed',
    message: 'Request validation failed',
    details: messages,
  });
}
