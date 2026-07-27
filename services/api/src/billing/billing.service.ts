import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingProviderPort, BillingWebhookEvent } from './billing.provider';

export type BillingWebhookPayload = BillingWebhookEvent & {
  provider?: string;
  eventId?: string;
  eventType?: string;
};

export type BillingWebhookResult = {
  accepted: boolean;
  deduplicated: boolean;
  processed: boolean;
  reason?: string;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async ingestWebhook(payload: BillingWebhookPayload): Promise<BillingWebhookResult> {
    const provider = payload.provider?.trim();
    const eventId = payload.eventId?.trim();
    const eventType = payload.eventType?.trim() ?? 'unknown';

    if (!provider || !eventId) {
      throw new BadRequestException({
        code: 'webhook_validation_failed',
        message: 'provider and eventId are required',
      });
    }

    const existing = await this.prisma.billing_webhook_events.findFirst({
      where: {
        provider,
        event_id: eventId,
      },
    });

    if (existing) {
      return {
        accepted: true,
        deduplicated: true,
        processed: existing.processed,
      };
    }

    let eventIdRow;
    try {
      eventIdRow = await this.prisma.billing_webhook_events.create({
        data: {
          provider,
          event_id: eventId,
          event_type: eventType,
          payload: payload as unknown as Record<string, unknown>,
          processed: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return {
          accepted: true,
          deduplicated: true,
          processed: false,
        };
      }

      throw error;
    }

    const billingEnabled = this.isBillingEnabled();
    if (!billingEnabled) {
      return {
        accepted: true,
        deduplicated: false,
        processed: false,
        reason: 'billing_disabled',
      };
    }

    const providerInstance = this.getProvider(provider);
    if (!providerInstance?.isEnabled(this.resolveProviderConfig())) {
      await this.prisma.billing_webhook_events.update({
        where: { id: eventIdRow.id },
        data: {
          processed: false,
          last_error: `${provider} provider ikke aktiveret`,
          processed_at: null,
        },
      });

      return {
        accepted: true,
        deduplicated: false,
        processed: false,
        reason: 'provider_disabled',
      };
    }

    const hook: BillingWebhookEvent = {
      eventId,
      provider,
      eventType,
      payload: payload as unknown,
    };

    try {
      await providerInstance.handleWebhook(hook);
      await this.prisma.billing_webhook_events.update({
        where: { id: eventIdRow.id },
        data: {
          processed: true,
          processed_at: new Date(),
          last_error: null,
          retry_count: 0,
        },
      });
      return {
        accepted: true,
        deduplicated: false,
        processed: true,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'provider_error';
      this.logger.error(`Billing webhook failed [${provider}/${eventId}]: ${reason}`, error instanceof Error ? error.stack : undefined);
      await this.prisma.billing_webhook_events.update({
        where: { id: eventIdRow.id },
        data: {
          processed: false,
          processed_at: null,
          retry_count: { increment: 1 },
          last_error: reason,
        },
      });

      return {
        accepted: true,
        deduplicated: false,
        processed: false,
        reason: 'provider_processing_failed',
      };
    }
  }

  private getProvider(provider: string): BillingProviderPort | null {
    const normalized = provider.toLowerCase();
    if (normalized === 'noop' || normalized === 'manual') {
      return {
        id: normalized,
        isEnabled: () => this.isBillingEnabled(),
        handleWebhook: async () => {
          return Promise.resolve();
        },
      };
    }

    return {
      id: normalized,
      isEnabled: () => false,
      handleWebhook: async () => {
        throw new Error(`Ingen aktiv provider konfiguration for ${provider}`);
      },
    };
  }

  private isBillingEnabled() {
    return this.configService.get<string>('BILLING_ENABLED', 'false').toLowerCase() === 'true';
  }

  private resolveProviderConfig() {
    return Object.entries(process.env)
      .filter(([key]) => key.startsWith('BILLING_'))
      .reduce((acc, [key, value]) => {
        acc[key] = value ?? '';
        return acc;
      }, {} as Record<string, string>);
  }
}

