import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as promClient from 'prom-client';
import { AppModule } from './app.module';
import { randomBytes } from 'node:crypto';

async function bootstrap() {
  const jwtSecret = ensureSecret('JWT_SECRET', () => randomBytes(48).toString('hex'), process.env.NODE_ENV === 'production');
  process.env.JWT_SECRET = jwtSecret;

  const encryptionKey = ensureEncryptionKey();
  process.env.ENCRYPTION_KEY = encryptionKey;

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

  await app.listen(Number(process.env.PORT) || 5555);
}

bootstrap();

function ensureSecret(name: string, create: () => string, requirePersistent: boolean): string {
  const existing = process.env[name];
  if (existing && existing.trim().length >= 16) {
    return existing.trim();
  }

  if (requirePersistent) {
    throw new Error(
      `${name} is missing or too weak in production. Set ${name} in .env before start (for example with ` +
        `npm run env:bootstrap or manually add it).`,
    );
  }

  const generated = create();
  console.warn(
    `${name} var ikke sat. Genererer midlertidigt nøglemateriale for denne session. ` +
      `Dette bør erstattes med en persistent værdi i .env før produktion.`,
  );
  return generated;
}

function ensureEncryptionKey(): string {
  const existing = process.env.ENCRYPTION_KEY;
  if (existing) {
    if (existing.startsWith('base64:')) {
      const data = existing.replace('base64:', '');
      const bytes = Buffer.from(data, 'base64');
      if (bytes.length >= 32) {
        return existing.trim();
      }
    } else if (existing.trim().length >= 16) {
      return existing.trim();
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY is missing or invalid in production. Set ENCRYPTION_KEY in .env (for example with `npm run env:bootstrap`).',
    );
  }

  const generated = `base64:${randomBytes(32).toString('base64')}`;
  console.warn(
    'ENCRYPTION_KEY var ikke sat eller ugyldig. Genererer midlertidigt nøglemateriale for denne session. ' +
      'Dette bør erstattes med en persistent værdi i .env før produktion.',
  );
  return generated;
}
