import { IsString, Length, Matches } from 'class-validator';

export class SaveMetadataSettingsDto {
  @IsString()
  @Length(20, 4096)
  token!: string;

  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language!: string;
}
