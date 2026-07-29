import { IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';

export class SetUpdateBranchDto {
  @IsString()
  @Length(1, 200)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  branch!: string;
}

export class UpdateServerSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  serverName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  timezone?: string;
}
