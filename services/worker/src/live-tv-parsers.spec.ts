import { describe, expect, it } from 'vitest';
import { parseM3u, parseXmlTv } from './live-tv-parsers.js';

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
});
