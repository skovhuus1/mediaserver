import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemController } from './system.controller';
import { BillingModule } from '../billing/billing.module';
import { SystemUpdateService } from './system-update.service';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [SystemController],
  providers: [SystemUpdateService],
})
export class SystemModule {}
