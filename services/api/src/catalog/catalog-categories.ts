type CatalogCategoryGroup = {
  label: string;
  aliases: readonly string[];
};

const CATEGORY_GROUPS: readonly CatalogCategoryGroup[] = [
  { label: 'Action', aliases: ['action', 'action adventure', 'adventure', 'eventyr'] },
  { label: 'Animation', aliases: ['animation', 'anime'] },
  { label: 'Børn', aliases: ['børn', 'born', 'kids', 'children'] },
  { label: 'Drama', aliases: ['drama'] },
  { label: 'Dokumentar', aliases: ['dokumentar', 'documentary'] },
  { label: 'Familie', aliases: ['familie', 'family'] },
  {
    label: 'Fantasy & sci-fi',
    aliases: ['fantasy', 'fantasy sci-fi', 'fantasy scifi', 'fantasy sci fi', 'sci-fi', 'sci fi', 'science fiction'],
  },
  { label: 'Gyser', aliases: ['gyser', 'horror'] },
  { label: 'Historie', aliases: ['historie', 'history'] },
  { label: 'Jul', aliases: ['jul', 'christmas'] },
  { label: 'Komedie', aliases: ['komedie', 'comedy'] },
  { label: 'Krig', aliases: ['krig', 'war'] },
  { label: 'Krimi', aliases: ['krimi', 'crime', 'mystery', 'mysterie'] },
  { label: 'Musik', aliases: ['musik', 'music', 'koncert', 'concert'] },
  { label: 'Reality', aliases: ['reality'] },
  { label: 'Rejser', aliases: ['rejser', 'travel'] },
  { label: 'Romantik', aliases: ['romantik', 'romance'] },
  { label: 'Sport', aliases: ['sport', 'sports'] },
  { label: 'Thriller', aliases: ['thriller'] },
  { label: 'Western', aliases: ['western'] },
] as const;

function normalizeCategory(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('da-DK')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .replace(/&/g, ' og ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CATEGORY_GROUP_BY_ALIAS = new Map<string, CatalogCategoryGroup>();

for (const group of CATEGORY_GROUPS) {
  for (const value of [group.label, ...group.aliases]) {
    CATEGORY_GROUP_BY_ALIAS.set(normalizeCategory(value), group);
  }
}

export function canonicalCatalogCategory(value: string): string {
  const trimmed = value.trim();
  return CATEGORY_GROUP_BY_ALIAS.get(normalizeCategory(trimmed))?.label ?? trimmed;
}

export function buildCatalogCategoryFacets(values: readonly string[]): string[] {
  return [...new Set(values.map(canonicalCatalogCategory).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'da', { sensitivity: 'base' }),
  );
}

export function catalogCategoryAliases(requestedCategory: string): string[] {
  const trimmed = requestedCategory.trim();
  const group = CATEGORY_GROUP_BY_ALIAS.get(normalizeCategory(trimmed));
  return group ? [...new Set([group.label, ...group.aliases])] : [trimmed];
}
