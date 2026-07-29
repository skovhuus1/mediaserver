import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { PreferenceActor } from '../preferences/preferences.service';
import { RecommendationFeedbackDto } from './recommendations.dto';
import { RecommendationsService } from './recommendations.service';

interface AuthenticatedRequest {
  user: PreferenceActor;
}

@Controller('media')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('recommendations')
  get(@Req() request: AuthenticatedRequest) {
    return this.recommendations.get(request.user);
  }

  @Post('recommendations/reset')
  reset(@Req() request: AuthenticatedRequest) {
    return this.recommendations.reset(request.user);
  }

  @Put(':id/recommendation-feedback')
  setFeedback(
    @Req() request: AuthenticatedRequest,
    @Param('id') mediaId: string,
    @Body() input: RecommendationFeedbackDto,
  ) {
    return this.recommendations.setFeedback(request.user, mediaId, input);
  }

  @Delete(':id/recommendation-feedback')
  removeFeedback(
    @Req() request: AuthenticatedRequest,
    @Param('id') mediaId: string,
  ) {
    return this.recommendations.removeFeedback(request.user, mediaId);
  }
}
