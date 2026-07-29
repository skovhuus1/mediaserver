import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  UpdateDevicePreferencesDto,
  UpdateProfilePreferencesDto,
} from './preferences.dto';
import {
  PreferenceActor,
  PreferencesService,
} from './preferences.service';

interface AuthenticatedRequest {
  user: PreferenceActor;
}

@Controller('profiles/me/preferences')
export class ProfilePreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.preferences.getProfilePreferences(request.user);
  }

  @Patch()
  update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateProfilePreferencesDto,
  ) {
    return this.preferences.updateProfilePreferences(request.user, input);
  }
}

@Controller('devices/me/preferences')
export class DevicePreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.preferences.getDevicePreferences(request.user);
  }

  @Patch()
  update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateDevicePreferencesDto,
  ) {
    return this.preferences.updateDevicePreferences(request.user, input);
  }
}
