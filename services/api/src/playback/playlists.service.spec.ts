import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlaylistsService } from './playlists.service';

const actor = { accountId: 'account-a', sub: 'user-a', profileId: 'profile-a' };
const profile = { id: 'profile-a' };

describe('profile playlists', () => {
  it('requires an active profile owned by the authenticated account and user', async () => {
    const prisma = { profile: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new PlaylistsService(prisma as never, { delete: vi.fn() } as never);
    await expect(service.list({ ...actor, profileId: undefined } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(actor as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.profile.findFirst).toHaveBeenCalledWith({ where: { id: 'profile-a', accountId: 'account-a', userId: 'user-a', archivedAt: null }, select: { id: true } });
  });

  it('enforces the 50 playlist profile limit before opening a transaction', async () => {
    const transaction = vi.fn();
    const prisma = { profile: { findFirst: vi.fn().mockResolvedValue(profile) }, playlist: { count: vi.fn().mockResolvedValue(50) }, $transaction: transaction };
    const service = new PlaylistsService(prisma as never, { delete: vi.fn() } as never);
    await expect(service.create(actor as never, { name: 'For mange' })).rejects.toMatchObject({ response: { code: 'playlist_limit' } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects stale reorder writes before changing any item position', async () => {
    const tx = {
      playlist: { findFirst: vi.fn().mockResolvedValue({ id: 'list', updatedAt: new Date('2026-08-24T12:00:00.000Z') }) },
      playlistItem: { findMany: vi.fn(), update: vi.fn() },
    };
    const prisma = { profile: { findFirst: vi.fn().mockResolvedValue(profile) }, $transaction: vi.fn((work) => work(tx)) };
    const service = new PlaylistsService(prisma as never, { delete: vi.fn() } as never);
    await expect(service.reorder(actor as never, 'list', { itemIds: ['123e4567-e89b-42d3-a456-426614174000'], expectedUpdatedAt: '2026-08-24T11:00:00.000Z' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.playlistItem.findMany).not.toHaveBeenCalled();
    expect(tx.playlistItem.update).not.toHaveBeenCalled();
  });
});
