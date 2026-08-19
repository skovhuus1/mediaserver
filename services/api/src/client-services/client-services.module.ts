import { Module } from '@nestjs/common';
import { ClientServicesController } from './client-services.controller';
import { ClientServicesService } from './client-services.service';

@Module({
  controllers: [ClientServicesController],
  providers: [ClientServicesService],
})
export class ClientServicesModule {}
