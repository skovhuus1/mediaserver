import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AdministrationModule } from './administration/administration.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard, RoleGuard } from './common/auth';
import { CorrelationInterceptor } from './common/http';
import { readEnvironment } from './config/environment';
import { CatalogModule } from './catalog/catalog.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { InfraModule } from './infra/infra.module';
import { PlaybackModule } from './playback/playback.module';
import { PreferencesModule } from './preferences/preferences.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { PrismaModule } from './prisma/prisma.module';
import { SetupModule } from './setup/setup.module';
import { SystemModule } from './system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: () => {
        const environment = readEnvironment();
        return {
          secret: environment.jwtSecret,
          signOptions: { expiresIn: environment.jwtAccessTtlSeconds },
        };
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    InfraModule,
    SetupModule,
    AuthModule,
    AdministrationModule,
    CatalogModule,
    EntitlementsModule,
    PlaybackModule,
    PreferencesModule,
    RecommendationsModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor },
  ],
})
export class AppModule {}
