import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { HOME_ROW_ID_PATTERN, type HomeRowId } from './home-layout';

const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const PIN_PATTERN = /^\d{4,8}$/;

export class UpdateProfilePreferencesDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  avatarKey?: string;

  @IsOptional()
  @IsString()
  @Matches(LANGUAGE_PATTERN)
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(LANGUAGE_PATTERN, { each: true })
  preferredAudioLanguages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(LANGUAGE_PATTERN, { each: true })
  preferredSubtitleLanguages?: string[];

  @IsOptional()
  @IsIn(['auto', 'always', 'forced', 'off'])
  subtitleMode?: 'auto' | 'always' | 'forced' | 'off';

  @IsOptional()
  @IsBoolean()
  autoplayNext?: boolean;

  @IsOptional()
  @IsBoolean()
  recommendationsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(58)
  @Matches(HOME_ROW_ID_PATTERN, { each: true })
  homeRowOrder?: HomeRowId[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(58)
  @Matches(HOME_ROW_ID_PATTERN, { each: true })
  hiddenHomeRows?: HomeRowId[];

  @IsOptional()
  @IsString()
  @Matches(PIN_PATTERN)
  currentPin?: string;

  @IsOptional()
  @IsString()
  @Matches(PIN_PATTERN)
  newPin?: string;

  @IsOptional()
  @IsBoolean()
  clearPin?: boolean;
}

export class UpdateDevicePreferencesDto {
  @IsOptional()
  @IsIn(['auto', 'fixed', 'original'])
  qualityMode?: 'auto' | 'fixed' | 'original';

  @IsOptional()
  @IsInt()
  @Min(360)
  @Max(2160)
  fixedQualityHeight?: number;

  @IsOptional()
  @IsBoolean()
  allowUpscale?: boolean;

  @IsOptional()
  @IsBoolean()
  dataSaver?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2)
  playbackRate?: number;

  @IsOptional()
  @IsIn(['auto', 'prefer_hdr', 'force_sdr'])
  hdrMode?: 'auto' | 'prefer_hdr' | 'force_sdr';
}
