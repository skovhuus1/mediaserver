export function homeExperienceCacheKey(accountId: string, profileId: string): string {
  return `experience:home:${accountId}:${profileId}`;
}
