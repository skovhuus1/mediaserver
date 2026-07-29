import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.get(key);
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') this.client.disconnect();
  }
}
