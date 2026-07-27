import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as promClient from 'prom-client';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => {
        const first = errors?.[0];
        const message = first?.constraints ? Object.values(first.constraints).join(', ') : 'Valideringsfejl';
        return new BadRequestException({
          code: 'validation_error',
          message,
          details: errors,
        });
      },
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()) : '*';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  promClient.collectDefaultMetrics();

  const config = new DocumentBuilder()
    .setTitle('BoltBytes Media Server API')
    .setDescription('Phase 1 foundation API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(Number(process.env.PORT) || 3001);
}

bootstrap();
