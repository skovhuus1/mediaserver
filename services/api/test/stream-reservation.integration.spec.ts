import { PrismaService } from '../src/prisma/prisma.service';
import { StreamReservationService } from '../src/playback/stream-reservation.service';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('stream reservation concurrency', () => {
  const prisma = new PrismaService();
  const reservations = new StreamReservationService(prisma);
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

  it('accepts exactly one of two simultaneous requests when the limit is one', async () => {
    const fixture = await createFixture(prisma);
    accountId = fixture.accountId;
    const request = {
      actor: {
        sub: fixture.userId,
        accountId: fixture.accountId,
        profileId: fixture.profileId,
        deviceId: fixture.deviceId,
        roles: ['user'],
      },
      profileId: fixture.profileId,
      mediaId: fixture.mediaId,
      deviceId: fixture.deviceId,
      method: 'direct_play' as const,
      isCastSession: false,
      maxConcurrentStreams: 1,
    };
    const outcomes = await Promise.allSettled([reservations.reserve(request), reservations.reserve(request)]);
    const failureDetails = outcomes
      .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
      .map(({ reason }) => reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
      `Reservation outcomes: ${failureDetails.join(' | ')}`,
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });
});

async function createFixture(prisma: PrismaService) {
  const account = await prisma.account.create({ data: { name: `test-${Date.now()}` } });
  const user = await prisma.user.create({
    data: { accountId: account.id, email: `test-${Date.now()}@example.test`, displayName: 'Test', passwordHash: 'unused' },
  });
  const profile = await prisma.profile.create({ data: { accountId: account.id, userId: user.id, name: 'Test' } });
  const device = await prisma.device.create({
    data: {
      accountId: account.id,
      userId: user.id,
      fingerprint: `fp-${Date.now()}`,
      name: 'Test',
      type: 'test',
      capabilities: {},
    },
  });
  const root = await prisma.storageRoot.create({ data: { accountId: account.id, label: 'test', mountPath: '/media' } });
  const library = await prisma.library.create({
    data: { accountId: account.id, storageRootId: root.id, name: 'Test', type: 'movie' },
  });
  const media = await prisma.mediaItem.create({
    data: {
      accountId: account.id,
      libraryId: library.id,
      title: 'Test',
      type: 'movie',
      codec: 'h264',
      container: 'mp4',
      releaseDate: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
  return { accountId: account.id, userId: user.id, profileId: profile.id, deviceId: device.id, mediaId: media.id };
}
