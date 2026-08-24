import { describe, expect, it } from 'vitest';
import { parseM3u, parseXmlTv } from '../src/live-tv-parsers.js';

describe('Live TV parsers', () => {
  it('parses extended M3U metadata and ignores invalid entries', () => {
    const entries = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="dr1.dk" tvg-name="DR1" tvg-logo="https://img/dr1.png" group-title="Danske",DR 1 HD\nhttps://tv.test/dr1.m3u8\n#BAD\nfile:///local');
    expect(entries).toEqual([{ name: 'DR 1 HD', url: 'https://tv.test/dr1.m3u8', tvgId: 'dr1.dk', tvgName: 'DR1', logoUrl: 'https://img/dr1.png', groupName: 'Danske', countryCode: null, channelNumber: null }]);
  });

  it('parses XMLTV timezone, metadata and program boundaries', () => {
    const xml = '<tv><channel id="dr1.dk"><display-name>DR1</display-name><icon src="https://img/dr1.png"/></channel><programme start="20260823120000 +0200" stop="20260823130000 +0200" channel="dr1.dk"><title>TV Avisen</title><desc>Dagens nyheder</desc><category>Nyheder</category></programme></tv>';
    const parsed = parseXmlTv(xml);
    expect(parsed.channels.get('dr1.dk')?.name).toBe('DR1');
    expect(parsed.programs[0]).toMatchObject({ channelExternalId: 'dr1.dk', title: 'TV Avisen', category: 'Nyheder' });
    expect(parsed.programs[0]?.startsAt.toISOString()).toBe('2026-08-23T10:00:00.000Z');
  });
});
