import { Module } from '@nestjs/common';
import { ExperienceController } from './experience.controller';
import { ExperienceService } from './experience.service';
import { HomeExperienceService } from './home-experience.service';

@Module({
  controllers: [ExperienceController],
  providers: [ExperienceService, HomeExperienceService],
})
export class ExperienceModule {}
