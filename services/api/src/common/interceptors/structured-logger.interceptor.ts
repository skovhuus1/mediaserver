import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-correlation-id'] ?? randomUUID();
    request.headers['x-correlation-id'] = requestId;
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          this.logger.log(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              correlationId: requestId,
              method: request.method,
              url: request.url,
              statusCode: response?.statusCode,
              durationMs: Date.now() - started,
              userId: request.user?.sub ?? null,
              accountId: request.user?.accountId ?? null,
            }),
          );
        },
        error: (error) => {
          const response = context.switchToHttp().getResponse();
          this.logger.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              correlationId: requestId,
              method: request.method,
              url: request.url,
              statusCode: response?.statusCode,
              durationMs: Date.now() - started,
              userId: request.user?.sub ?? null,
              accountId: request.user?.accountId ?? null,
              errorCode: error?.code ?? 'error',
              message: error?.message ?? 'request_failed',
            }),
          );
        },
      }),
    );
  }
}
