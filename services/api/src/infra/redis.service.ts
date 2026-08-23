import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.ensureConnected();
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(key);
  }

  async flush(): Promise<void> {
    await this.ensureConnected();
    await this.client.flushdb();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'ready') return;
    if (!this.connectPromise) {
      this.connectPromise = (this.client.status === 'wait' || this.client.status === 'end'
        ? this.client.connect().then(() => undefined)
        : this.waitUntilReady())
        .finally(() => {
          this.connectPromise = null;
        });
    }
    await this.connectPromise;
  }

  private waitUntilReady(): Promise<void> {
    if (this.client.status === 'ready') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onReady = () => finish();
      const onEnd = () => finish(new Error('Redis connection ended before becoming ready'));
      const timeout = setTimeout(
        () => finish(new Error('Redis did not become ready within 5 seconds')),
        5_000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        this.client.off('ready', onReady);
        this.client.off('end', onEnd);
        if (error) reject(error);
        else resolve();
      };
      this.client.once('ready', onReady);
      this.client.once('end', onEnd);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') this.client.disconnect();
  }
}
