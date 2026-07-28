import { IsString, Length, Matches } from 'class-validator';

export class SetUpdateBranchDto {
  @IsString()
  @Length(1, 200)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  branch!: string;
}
