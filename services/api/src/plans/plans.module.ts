import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlansController, PlanVersionsController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, PlanVersionsController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
