import { IsIn } from 'class-validator';

export class RecommendationFeedbackDto {
  @IsIn(['like', 'dislike', 'hidden'])
  type!: 'like' | 'dislike' | 'hidden';
}
