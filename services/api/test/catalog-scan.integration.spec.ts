import type { AuthenticatedUser } from '@boltbytes/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CatalogService } from '../src/catalog/catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('library scan queue concurrency', () => {
  const prisma = new PrismaService();
  const catalog = new CatalogService(prisma);
  let accountId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('bbmedia_test')) {
      throw new Error('Integration tests refuse to run outside bbmedia_test');
    }
    await prisma.$connect();
  });

  afterEach(async () => {
    if (accountId) await prisma.account.delete({ where: { id: accountId } });
    accountId = '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('queues exactly one durable job for simultaneous requests', async () => {
    const account = await prisma.account.create({ data: { name: `scan-test-${Date.now()}` } });
    accountId = account.id;
    const user = await prisma.user.create({
      data: {
        accountId,
        email: `scan-${Date.now()}@example.test`,
        displayName: 'Scanner',
        passwordHash: 'unused',
      },
    });
    const root = await prisma.storageRoot.create({
      data: { accountId, label: 'scan-test', mountPath: '/media' },
    });
    const library = await prisma.library.create({
      data: {
        accountId,
        storageRootId: root.id,
        name: 'Scan test',
        type: 'movie',
        paths: { create: { path: '/media', recursive: true } },
      },
    });
    const actor: AuthenticatedUser = {
      sub: user.id,
      accountId,
      profileId: null,
      deviceId: null,
      roles: ['admin'],
    };

    const outcomes = await Promise.allSettled([
      catalog.queueScan(actor, library.id),
      catalog.queueScan(actor, library.id),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await prisma.libraryScan.count({ where: { libraryId: library.id } })).toBe(1);
    expect(await prisma.systemJob.count({ where: { accountId, type: 'library.scan' } })).toBe(1);
  });
});
