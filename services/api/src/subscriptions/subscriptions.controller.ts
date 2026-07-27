import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

class CreateSubscriptionDto {
  accountId!: string;
  userId?: string;
  planVersionId!: string;
  status?: 'active' | 'trialing' | 'pending';
}

@Controller('subscriptions')
@ApiTags('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async list(@CurrentUser() user: any) {
    return this.subscriptionsService.list(user?.accountId);
  }

  @Post()
  @Roles(AppRole.ADMIN)
  async create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(dto);
  }

  @Patch(':id/cancel')
  @Roles(AppRole.ADMIN)
  async cancel(@Param('id') id: string) {
    return this.subscriptionsService.cancel(id);
  }
}
