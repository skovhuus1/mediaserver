import { AsyncLocalStorage } from 'node:async_hooks';

type RequestStore = {
  correlationId: string;
};

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function correlationId(): string {
  return requestContext.getStore()?.correlationId ?? 'unscoped';
}
