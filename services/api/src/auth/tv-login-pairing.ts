export const TV_LOGIN_PAIRING_TTL_MS = 10 * 60 * 1000;
export const TV_LOGIN_POLL_INTERVAL_SECONDS = 2;

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type TvPairingStatus = 'pending' | 'approved' | 'expired' | 'consumed';

export type TvPairingStatusRow = {
  status: string;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
};

export function normalizeTvUserCode(value: string): string {
  return value.replace(/[^a-z0-9]/giu, '').toUpperCase();
}

export function formatTvUserCode(value: string): string {
  const normalized = normalizeTvUserCode(value);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

export function randomTvUserCode(nextIndex: (max: number) => number): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += codeAlphabet[nextIndex(codeAlphabet.length)];
  }
  return formatTvUserCode(code);
}

export function presentTvPairingStatus(row: TvPairingStatusRow, now = new Date()): TvPairingStatus {
  if (row.consumedAt || row.status === 'consumed') return 'consumed';
  if (row.expiresAt <= now || row.status === 'expired') return 'expired';
  if (row.approvedAt || row.status === 'approved') return 'approved';
  return 'pending';
}
