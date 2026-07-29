import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class SaveMetadataSettingsDto {
  @IsOptional()
  @IsString()
  @Length(20, 4096)
  token?: string;

  @IsOptional()
  @IsString()
  @Length(20, 4096)
  tmdbToken?: string;

  @IsOptional()
  @IsString()
  @Length(10, 4096)
  tvdbApiKey?: string;

  @IsOptional()
  @IsString()
  @Length(1, 4096)
  tvdbPin?: string;

  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language!: string;
}
