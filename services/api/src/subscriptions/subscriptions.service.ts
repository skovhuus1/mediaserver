import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateSubscriptionInput = {
  accountId: string;
  userId?: string;
  planVersionId: string;
  status?: 'active' | 'pending' | 'trialing';
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId?: string) {
    return this.prisma.subscriptions.findMany({
      where: accountId ? { account_id: accountId } : undefined,
      orderBy: { created_at: 'desc' },
      include: {
        plan_versions: {
          include: {
            plan_entitlements: true,
          },
        },
        users: {
          select: { id: true, email: true, display_name: true },
        },
      },
    });
  }

  async create(dto: CreateSubscriptionInput) {
    const planVersion = await this.prisma.plan_versions.findUnique({ where: { id: dto.planVersionId } });
    if (!planVersion) {
      throw new BadRequestException({ code: 'plan_version_missing', message: 'Plan version findes ikke' });
    }

    const subscription = await this.prisma.subscriptions.create({
      data: {
        account_id: dto.accountId,
        user_id: dto.userId,
        plan_version_id: dto.planVersionId,
        status: dto.status ?? 'active',
        snapshot_at: new Date(),
      },
    });

    await this.prisma.subscription_snapshots.create({
      data: {
        subscription_id: subscription.id,
        snapshot: {
          createdBy: 'manual',
          planVersionId: dto.planVersionId,
        },
      },
    });

    await this.prisma.subscription_events.create({
      data: {
        subscription_id: subscription.id,
        event_type: 'created',
        event_payload: {
          source: 'manual',
          createdBy: 'admin',
        },
      },
    });

    return subscription;
  }

  async cancel(id: string) {
    const updated = await this.prisma.subscriptions.update({
      where: { id },
      data: {
        status: 'canceled',
        ends_at: new Date(),
      },
    });

    await this.prisma.subscription_events.create({
      data: {
        subscription_id: id,
        event_type: 'canceled',
        event_payload: { source: 'manual', at: new Date().toISOString() },
      },
    });

    return updated;
  }
}
