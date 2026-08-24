import { describe, expect, it } from 'vitest';
import { describeLiveTvChannel } from '@boltbytes/contracts';
import { parseM3u, parseM3uDocument, parseXmlTv } from './live-tv-parsers.js';

describe('Live TV parsers', () => {
  it('parses a large M3U without requiring a split line array', () => {
    const channels = Array.from({ length: 10_000 }, (_, index) =>
      `#EXTINF:-1 tvg-id="channel-${index}",Channel ${index}\nhttps://example.test/${index}.m3u8`,
    );
    const result = parseM3u(`\uFEFF#EXTM3U\r\n${channels.join('\r\n')}\r\n`);

    expect(result).toHaveLength(10_000);
    expect(result[0]).toMatchObject({ name: 'Channel 0', tvgId: 'channel-0' });
    expect(result.at(-1)?.url).toBe('https://example.test/9999.m3u8');
  });

  it('extracts XMLTV icon attributes from normal and self-closing tags', () => {
    const result = parseXmlTv(`
      <tv>
        <channel id="dr1"><display-name>DR1</display-name><icon src="https://img.test/dr1.png" /></channel>
        <programme channel="dr1" start="20260823120000 +0000" stop="20260823130000 +0000">
          <title>Nyheder</title><icon src="https://img.test/news.png"/>
        </programme>
      </tv>
    `);

    expect(result.channels.get('dr1')?.logoUrl).toBe('https://img.test/dr1.png');
    expect(result.programs[0]?.iconUrl).toBe('https://img.test/news.png');
  });

  it('extracts XMLTV URLs advertised by the M3U header', () => {
    const result = parseM3uDocument(`#EXTM3U url-tvg="https://epg.example.test/guide.xml, guide-2.xml" x-tvg-url='https://backup.example.test/xmltv.gz'
#EXTINF:-1 tvg-id="dr1" tvg-country="DK" group-title="Dansk",DR 1 HD DK
https://stream.example.test/dr1.m3u8`);

    expect(result.epgUrls).toEqual([
      'https://epg.example.test/guide.xml',
      'guide-2.xml',
      'https://backup.example.test/xmltv.gz',
    ]);
    expect(result.entries[0]).toMatchObject({ name: 'DR 1 HD DK', groupName: 'Dansk', countryCode: 'DK', tvgId: 'dr1' });
  });

  it('merges quality and locale suffixes without merging distinct channel names', () => {
    const variants = ['DR 1 FHD DK', 'DR 1 FH DK', 'DR 1 HD DK', 'DR 1 DK'].map((name) => describeLiveTvChannel({ name }));
    expect(new Set(variants.map((item) => item.canonicalKey))).toHaveLength(1);
    expect(variants.map((item) => item.displayName)).toEqual(['DR 1', 'DR 1', 'DR 1', 'DR 1']);
    expect(variants.map((item) => item.qualityLabel)).toEqual(['fhd', 'fhd', 'hd', 'standard']);
    expect(describeLiveTvChannel({ name: 'DR 2 HD DK' }).canonicalKey).not.toBe(variants[0]?.canonicalKey);
  });

  it('merges name-like quality tvg ids but keeps unrelated external ids distinct', () => {
    const fhd = describeLiveTvChannel({ name: 'DR 1 FHD DK', tvgId: 'DR1-FHD-DK' });
    const hd = describeLiveTvChannel({ name: 'DR 1 HD DK', tvgId: 'DR1-HD-DK' });
    expect(fhd.canonicalKey).toBe(hd.canonicalKey);
    expect(describeLiveTvChannel({ name: 'Regional TV', tvgId: 'region-east-001' }).canonicalKey)
      .not.toBe(describeLiveTvChannel({ name: 'Regional TV', tvgId: 'region-west-002' }).canonicalKey);
  });

  it('keeps meaningful plus signs distinct in canonical identities', () => {
    expect(describeLiveTvChannel({ name: 'Disney+' }).canonicalKey).not.toBe(describeLiveTvChannel({ name: 'Disney' }).canonicalKey);
  });
});
