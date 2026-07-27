import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import {
  CreatePlanDto,
  CreatePlanVersionDto,
  PlansService,
} from './plans.service';

@Controller('plans')
@ApiTags('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async list() {
    return this.plansService.listPlans();
  }

  @Roles(AppRole.ADMIN)
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(dto);
  }
}

@Controller('plan-versions')
@ApiTags('plan-versions')
export class PlanVersionsController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async list() {
    return this.plansService.listVersions();
  }

  @Roles(AppRole.ADMIN)
  @Post()
  async create(@Body() dto: CreatePlanVersionDto) {
    return this.plansService.createVersion(dto);
  }
}
