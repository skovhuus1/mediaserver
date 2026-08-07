import type { AuthenticatedUser } from '@boltbytes/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('searches, filters and groups account-scoped catalog entries', async () => {
    const account = await prisma.account.create({ data: { name: `catalog-test-${Date.now()}` } });
    accountId = account.id;
    const user = await prisma.user.create({
      data: {
        accountId,
        email: `catalog-${Date.now()}@example.test`,
        displayName: 'Catalog',
        passwordHash: 'unused',
      },
    });
    const root = await prisma.storageRoot.create({
      data: { accountId, label: 'catalog-test', mountPath: '/media' },
    });
    const library = await prisma.library.create({
      data: { accountId, storageRootId: root.id, name: 'Catalog', type: 'mixed' },
    });
    await prisma.mediaItem.createMany({
      data: [
        { accountId, libraryId: library.id, title: 'Arrival', type: 'movie', category: 'Drama', releaseYear: 2016 },
        { accountId, libraryId: library.id, title: 'Pilot', type: 'episode', category: 'Drama', seriesTitle: 'Foundation', seasonNumber: 1, episodeNumber: 1 },
        { accountId, libraryId: library.id, title: 'The Mathematician', type: 'episode', category: 'Drama', seriesTitle: 'Foundation', seasonNumber: 1, episodeNumber: 2 },
      ],
    });
    const actor: AuthenticatedUser = {
      sub: user.id,
      accountId,
      profileId: null,
      deviceId: null,
      roles: ['admin'],
    };

    const movies = await catalog.listCatalog(actor, { q: 'arrival', type: 'movie', page: 1, pageSize: 10, sort: 'title' });
    expect(movies.total).toBe(1);
    expect(movies.items[0]).toMatchObject({ title: 'Arrival', category: 'Drama', releaseYear: 2016 });
    const series = await catalog.listCatalog(actor, { type: 'series', page: 1, pageSize: 10, sort: 'title' });
    expect(series.total).toBe(1);
    expect(series.items[0]).toMatchObject({ title: 'Foundation', type: 'series', episodeCount: 2 });
    const detail = await catalog.getMedia(actor, movies.items[0]!.id);
    expect(detail).toMatchObject({ title: 'Arrival', library: { id: library.id, name: 'Catalog' } });
  });

  it('queues exactly one account metadata job for simultaneous requests', async () => {
    const account = await prisma.account.create({ data: { name: `metadata-test-${Date.now()}` } });
    accountId = account.id;
    const user = await prisma.user.create({
      data: {
        accountId,
        email: `metadata-${Date.now()}@example.test`,
        displayName: 'Metadata',
        passwordHash: 'unused',
      },
    });
    const actor: AuthenticatedUser = {
      sub: user.id,
      accountId,
      profileId: null,
      deviceId: null,
      roles: ['admin'],
    };
    const previousToken = process.env.TMDB_API_TOKEN;
    process.env.TMDB_API_TOKEN = 'integration-test-token';
    try {
      const outcomes = await Promise.allSettled([catalog.queueMetadata(actor), catalog.queueMetadata(actor)]);
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      expect(await prisma.systemJob.count({ where: { accountId, type: 'media.metadata' } })).toBe(1);
    } finally {
      if (previousToken === undefined) delete process.env.TMDB_API_TOKEN;
      else process.env.TMDB_API_TOKEN = previousToken;
    }
  });

  it('queues an item metadata refresh and preserves an audited metadata lock', async () => {
    const account = await prisma.account.create({ data: { name: `metadata-item-test-${Date.now()}` } });
    accountId = account.id;
    const user = await prisma.user.create({
      data: {
        accountId,
        email: `metadata-item-${Date.now()}@example.test`,
        displayName: 'Metadata item',
        passwordHash: 'unused',
      },
    });
    const root = await prisma.storageRoot.create({ data: { accountId, label: 'metadata-item', mountPath: '/media' } });
    const library = await prisma.library.create({ data: { accountId, storageRootId: root.id, name: 'Metadata item', type: 'movie' } });
    const media = await prisma.mediaItem.create({ data: { accountId, libraryId: library.id, title: 'Arrival', type: 'movie' } });
    const actor: AuthenticatedUser = { sub: user.id, accountId, profileId: null, deviceId: null, roles: ['admin'] };
    const previousToken = process.env.TMDB_API_TOKEN;
    process.env.TMDB_API_TOKEN = 'integration-test-token';
    try {
      await expect(catalog.setMetadataLock(actor, media.id, true)).resolves.toMatchObject({ id: media.id, metadataLocked: true });
      const job = await catalog.queueMediaMetadata(actor, media.id);
      expect(job.payload).toMatchObject({ mediaId: media.id, force: true, onlyMissing: false });
      expect(await prisma.auditLog.count({ where: { accountId, action: { in: ['media.metadata.lock', 'media.metadata.refresh'] } } })).toBe(2);
      expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({ metadataLocked: true });
    } finally {
      if (previousToken === undefined) delete process.env.TMDB_API_TOKEN;
      else process.env.TMDB_API_TOKEN = previousToken;
    }
  });

  it('persists one validated TVDB binding and applies its lock to the complete local series', async () => {
    const account = await prisma.account.create({ data: { name: `manual-match-${Date.now()}` } });
    accountId = account.id;
    const user = await prisma.user.create({
      data: {
        accountId,
        email: `manual-match-${Date.now()}@example.test`,
        displayName: 'Manual matcher',
        passwordHash: 'unused',
      },
    });
    const root = await prisma.storageRoot.create({ data: { accountId, label: 'manual-match', mountPath: '/media' } });
    const library = await prisma.library.create({ data: { accountId, storageRootId: root.id, name: 'Series', type: 'series' } });
    const episodes = await Promise.all([1, 2].map((episodeNumber) => prisma.mediaItem.create({
      data: {
        accountId,
        libraryId: library.id,
        title: `Episode ${episodeNumber}`,
        type: 'episode',
        seriesTitle: 'Local Wrong Name',
        seasonNumber: 1,
        episodeNumber,
      },
    })));
    const actor: AuthenticatedUser = { sub: user.id, accountId, profileId: null, deviceId: null, roles: ['admin'] };
    const previousKey = process.env.TVDB_API_KEY;
    process.env.TVDB_API_KEY = 'integration-tvdb-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v4/login')) {
        return new Response(JSON.stringify({ data: { token: 'tvdb-test-token' } }), { status: 200 });
      }
      if (url.includes('/series/371028/extended')) {
        return new Response(JSON.stringify({ data: { id: 371028, name: 'Correct Series', year: 2020, overview: 'Provider overview' } }), { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    try {
      const result = await catalog.applyMetadataMatch(actor, episodes[0]!.id, {
        provider: 'tvdb',
        providerId: '371028',
        locked: true,
      });
      expect(result.affectedItems).toBe(2);
      expect(result.job.payload).toMatchObject({
        libraryId: library.id,
        seriesTitle: 'Local Wrong Name',
        onlyMissing: false,
        force: true,
      });
      expect(await prisma.metadataBinding.findFirst({ where: { accountId } })).toMatchObject({
        libraryId: library.id,
        mediaType: 'series',
        localKey: 'local wrong name',
        provider: 'tvdb',
        providerId: '371028',
        providerTitle: 'Correct Series',
        locked: true,
      });
      expect(await prisma.mediaItem.count({ where: { libraryId: library.id, metadataLocked: true } })).toBe(2);
      await expect(catalog.setMetadataLock(actor, episodes[0]!.id, false)).resolves.toMatchObject({ affectedItems: 2 });
      expect(await prisma.metadataBinding.findFirst({ where: { accountId } })).toMatchObject({ locked: false });
    } finally {
      fetchMock.mockRestore();
      if (previousKey === undefined) delete process.env.TVDB_API_KEY;
      else process.env.TVDB_API_KEY = previousKey;
    }
  });
});
