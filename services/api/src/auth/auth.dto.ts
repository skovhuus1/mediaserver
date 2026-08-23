import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Length(8, 160)
  deviceFingerprint!: string;

  @IsString()
  @Length(1, 100)
  deviceName!: string;

  @IsString()
  @Length(1, 40)
  deviceType!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  platform?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(64)
  refreshToken!: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/)
  profilePin?: string;
}

export class LogoutDto {
  @IsString()
  @MinLength(64)
  refreshToken!: string;
}

export class CompletePasswordChangeDto {
  @IsString()
  @MinLength(80)
  token!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class StartTvLoginDto {
  @IsString()
  @Length(8, 160)
  deviceFingerprint!: string;

  @IsString()
  @Length(1, 100)
  deviceName!: string;

  @IsString()
  @Length(1, 40)
  deviceType!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  platform?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class PollTvLoginDto {
  @IsUUID()
  pairingId!: string;

  @IsString()
  @MinLength(32)
  pollToken!: string;
}

export class ApproveTvLoginDto {
  @IsOptional()
  @IsString()
  @Length(32, 160)
  approveToken?: string;

  @IsOptional()
  @IsString()
  @Length(6, 16)
  @Matches(/^[A-Z0-9-]+$/i)
  userCode?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/)
  profilePin?: string;
}
