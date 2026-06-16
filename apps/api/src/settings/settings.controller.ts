import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SettingsDTO } from '@spotiseek/shared';
import { SettingsService } from './settings.service';
import { JwtGuard } from '../auth/jwt.guard';

@UseGuards(JwtGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() patch: Partial<SettingsDTO>) {
    return this.settings.update(patch);
  }
}
