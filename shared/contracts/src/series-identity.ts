import { sanitizeMediaTitle } from './media-classification.js';

export type SeriesIdentityCandidate = {
  metadataProvider?: string | null;
  seriesMetadataProviderId?: string | null;
  seriesDisplayTitle?: string | null;
  seriesTitle?: string | null;
};

function normalizedTitle(value: string): string {
  return sanitizeMediaTitle(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('da-DK')
    .replace(/[^a-z0-9]+/g, '');
}

export function seriesIdentity(candidate: SeriesIdentityCandidate): string | null {
  const providerId = candidate.seriesMetadataProviderId?.trim();
  if (providerId) {
    return `provider:${candidate.metadataProvider?.toLowerCase() ?? 'unknown'}:${providerId.toLowerCase()}`;
  }
  const displayTitle = candidate.seriesDisplayTitle?.trim();
  if (displayTitle) return `display:${normalizedTitle(displayTitle)}`;
  const scannerTitle = candidate.seriesTitle?.trim();
  if (scannerTitle) return `title:${normalizedTitle(scannerTitle)}`;
  return null;
}

export function groupBySeriesIdentity<T extends SeriesIdentityCandidate>(items: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const identity = seriesIdentity(item);
    if (!identity) continue;
    const group = groups.get(identity);
    if (group) group.push(item);
    else groups.set(identity, [item]);
  }
  return [...groups.values()];
}
