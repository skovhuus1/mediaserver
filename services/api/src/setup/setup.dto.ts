import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Length, Matches, MinLength } from 'class-validator';

export class SetupRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  accountName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  serverName!: string;

  @IsEmail()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  adminEmail!: string;

  @IsString()
  @MinLength(12)
  adminPassword!: string;

  @IsString()
  @Length(2, 100)
  adminDisplayName!: string;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  externalUrl?: string;

  @IsOptional()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\/(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\u0000\r\n]).*$/)
  mountPath?: string;
}
