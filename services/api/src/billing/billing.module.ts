import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingService } from './billing.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
