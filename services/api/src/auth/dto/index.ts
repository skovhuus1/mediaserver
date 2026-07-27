import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class RegisterAdminDto {
  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @IsString()
  @IsOptional()
  serverName?: string;

  @IsString()
  @IsOptional()
  externalUrl?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(10)
  adminPassword!: string;

  @IsString()
  @IsNotEmpty()
  adminDisplayName!: string;

  @IsString()
  @IsOptional()
  mountPath?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;

  @IsOptional()
  @IsString()
  profileId?: string;
}

export class LogoutDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
