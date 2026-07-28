import type { EffectiveEntitlements, EntitlementAction, EntitlementDecision } from '@boltbytes/contracts';

export const DENIED_ENTITLEMENTS: EffectiveEntitlements = {
  maxConcurrentStreams: 0,
  maxRegisteredDevices: 0,
  maxVideoResolution: 0,
  maxVideoBitrate: 0,
  allowDirectPlay: false,
  allowDirectStream: false,
  allowVideoTranscode: false,
  allowAudioTranscode: false,
  allowSubtitleBurnIn: false,
  allowChromecast: false,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
};

const BOOLEAN_KEYS = [
  'allowDirectPlay',
  'allowDirectStream',
  'allowVideoTranscode',
  'allowAudioTranscode',
  'allowSubtitleBurnIn',
  'allowChromecast',
  'allowOfflineDownload',
] as const;

const NUMBER_KEYS = [
  'maxConcurrentStreams',
  'maxRegisteredDevices',
  'maxVideoResolution',
  'maxVideoBitrate',
  'releaseDelayMonths',
  'releaseDelayDays',
] as const;

export function applyEntitlementOverrides(
  base: EffectiveEntitlements,
  overrides: readonly unknown[],
): EffectiveEntitlements {
  const result = { ...base };
  for (const override of overrides) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) continue;
    const values = override as Record<string, unknown>;
    for (const key of BOOLEAN_KEYS) {
      if (typeof values[key] === 'boolean') result[key] = values[key];
    }
    for (const key of NUMBER_KEYS) {
      const value = values[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) result[key] = value;
    }
  }
  return result;
}

export function addCalendarDelay(date: Date, months: number, days: number): Date {
  const safeMonths = Math.max(0, Math.trunc(months));
  const safeDays = Math.max(0, Math.trunc(days));
  const targetMonthIndex = date.getUTCMonth() + safeMonths;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
  result.setUTCDate(result.getUTCDate() + safeDays);
  return result;
}

export function decideEntitlement(input: {
  action: EntitlementAction;
  entitlements: EffectiveEntitlements;
  releaseDate: Date | null;
  availabilityOverride: Date | null;
  now: Date;
}): EntitlementDecision {
  const { action, entitlements, releaseDate, availabilityOverride, now } = input;
  const availableAt = availabilityOverride ?? (
    releaseDate
      ? addCalendarDelay(releaseDate, entitlements.releaseDelayMonths, entitlements.releaseDelayDays)
      : null
  );

  if (!availableAt) {
    return denied('release_date_missing', 'Release date is missing; an administrator must review the media item', entitlements);
  }
  if (availableAt.getTime() > now.getTime()) {
    return {
      ...denied('release_window_active', 'This title is not available on the current plan yet', entitlements),
      availableAt: availableAt.toISOString(),
    };
  }
  if (action === 'cast' && !entitlements.allowChromecast) {
    return denied('cast_not_allowed', 'Chromecast is not allowed by the current plan', entitlements);
  }
  if (action === 'offline_download' && !entitlements.allowOfflineDownload) {
    return denied('offline_not_allowed', 'Offline download is not allowed by the current plan', entitlements);
  }
  return {
    allowed: true,
    code: 'allowed',
    reasons: ['Entitlement evaluation passed'],
    availableAt: availableAt.toISOString(),
    effective: entitlements,
  };
}

function denied(code: string, reason: string, entitlements: EffectiveEntitlements): EntitlementDecision {
  return { allowed: false, code, reasons: [reason], availableAt: null, effective: entitlements };
}
