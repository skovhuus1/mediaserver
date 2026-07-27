export type BillingProvider = {
  providerId: string;
  isEnabled: boolean;
};

export interface BillingWebhookEvent {
  eventId: string;
  provider: string;
  eventType: string;
  payload: unknown;
}

export interface BillingProviderPort {
  readonly id: string;
  isEnabled(config: Record<string, string>): boolean;
  handleWebhook(event: BillingWebhookEvent): Promise<void>;
}

export type BillingProviderConfig = Record<string, string>;
