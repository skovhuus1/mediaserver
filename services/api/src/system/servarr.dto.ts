import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

export class SaveServarrConnectionDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @Length(8, 2048)
  url!: string;

  @IsOptional()
  @IsString()
  @Length(8, 4096)
  apiKey?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  libraryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  rootFolderPath?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  qualityProfileId?: number;
}

export class TestServarrConnectionDto {
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @Length(8, 2048)
  url?: string;

  @IsOptional()
  @IsString()
  @Length(8, 4096)
  apiKey?: string;
}

export class ServarrLookupQueryDto {
  @IsString()
  @Length(2, 160)
  term!: string;
}

export class AddServarrItemDto {
  @IsInt()
  @Min(1)
  providerId!: number;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  rootFolderPath?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  qualityProfileId?: number;

  @IsOptional()
  @IsBoolean()
  monitored?: boolean;

  @IsOptional()
  @IsBoolean()
  searchOnAdd?: boolean;
}
