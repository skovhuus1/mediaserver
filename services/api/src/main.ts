import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter, validationException } from './common/http';
import { createCorsOriginDelegate } from './config/cors-origin';
import { readEnvironment } from './config/environment';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const environment = readEnvironment();
  const prisma = app.get(PrismaService);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: createCorsOriginDelegate(environment.corsOrigins, prisma),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => validationException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    ),
  }));
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApi = new DocumentBuilder()
    .setTitle('BoltBytes Media Server API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi));

  await app.listen(environment.apiPort, '0.0.0.0');
}

void bootstrap();
