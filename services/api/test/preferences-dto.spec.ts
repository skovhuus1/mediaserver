import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateProfilePreferencesDto } from '../src/preferences/preferences.dto';

describe('subtitle preference validation', () => {
  it('accepts the broadcast defaults and a timing correction', async () => {
    const input = plainToInstance(UpdateProfilePreferencesDto, {
      subtitleStyle: 'broadcast',
      subtitleTextColor: '#FFFFFF',
      subtitleSizePercent: 100,
      subtitleBottomOffsetPercent: 6,
      subtitleTimingOffsetMs: -250,
    });

    expect(await validate(input)).toHaveLength(0);
  });

  it('rejects unsafe colors, positions and timing values', async () => {
    const input = plainToInstance(UpdateProfilePreferencesDto, {
      subtitleTextColor: 'white',
      subtitleBottomOffsetPercent: 40,
      subtitleTimingOffsetMs: 20_000,
    });

    expect((await validate(input)).length).toBeGreaterThanOrEqual(3);
  });
});
