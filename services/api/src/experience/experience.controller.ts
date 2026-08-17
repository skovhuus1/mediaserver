import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { ExperienceService } from './experience.service';

@ApiTags('experience')
@Controller('experience')
export class ExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  @Get('titles/:id')
  title(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.experience.title(actor, id);
  }

  @Get('people/:key')
  person(@CurrentUser() actor: AuthenticatedUser, @Param('key') key: string) {
    return this.experience.person(actor, key);
  }

  @Get('collections/:key')
  collection(@CurrentUser() actor: AuthenticatedUser, @Param('key') key: string) {
    return this.experience.collection(actor, key);
  }
}
