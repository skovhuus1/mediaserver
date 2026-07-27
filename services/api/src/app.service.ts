import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getVersion() {
    return { name: 'bb-media-api', version: '0.1.0' };
  }
}
