import { describe, expect, it } from 'vitest';

import { buildCatalogCategoryFacets, canonicalCatalogCategory, catalogCategoryAliases } from './catalog-categories';

describe('catalog categories', () => {
  it('samler provider-synonymer under en overordnet dansk genre', () => {
    expect(buildCatalogCategoryFacets(['Documentary', 'Dokumentar', 'Action adventure', 'Action'])).toEqual([
      'Action',
      'Dokumentar',
    ]);
  });

  it('bevarer ukendte kategorier uden at skjule lokalt indhold', () => {
    expect(canonicalCatalogCategory('Lokalt festivalarkiv')).toBe('Lokalt festivalarkiv');
  });

  it('udvider et overordnet filter til alle kendte databaseværdier', () => {
    expect(catalogCategoryAliases('Dokumentar')).toEqual(expect.arrayContaining(['Dokumentar', 'dokumentar', 'documentary']));
    expect(catalogCategoryAliases('Documentary')).toEqual(expect.arrayContaining(['Dokumentar', 'documentary']));
  });

  it('sorterer facets stabilt efter dansk visningsnavn', () => {
    expect(buildCatalogCategoryFacets(['Thriller', 'Comedy', 'Animation'])).toEqual([
      'Animation',
      'Komedie',
      'Thriller',
    ]);
  });
});
