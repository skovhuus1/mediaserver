import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemController } from './system.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [SystemController],
  providers: [],
})
export class SystemModule {}
