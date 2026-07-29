import { Module } from '@nestjs/common';
import { InfraModule } from '../infra/infra.module';
import {
  DevicePreferencesController,
  ProfilePreferencesController,
} from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [InfraModule],
  controllers: [ProfilePreferencesController, DevicePreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
