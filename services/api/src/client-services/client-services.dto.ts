import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterPushDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios', 'macos', 'windows', 'linux', 'web'])
  platform!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;
}

export class ReportClientCrashDto {
  @IsString()
  @MaxLength(80)
  kind!: string;

  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  stack?: string;

  @IsIn(['android', 'ios', 'macos', 'windows', 'linux', 'web'])
  platform!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  context?: Record<string, unknown>;
}

export class TestNotificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;
}
