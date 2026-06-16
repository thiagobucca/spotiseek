import { Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS, SettingsDTO } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'app.settings';

@Injectable()
export class SettingsService {
  private cache: SettingsDTO | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SettingsDTO> {
    if (this.cache) return this.cache;
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    const stored = PrismaService.parse<Partial<SettingsDTO>>(row?.value, {});
    this.cache = { ...DEFAULT_SETTINGS, ...stored };
    return this.cache;
  }

  async update(patch: Partial<SettingsDTO>): Promise<SettingsDTO> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: PrismaService.json(next) },
      update: { value: PrismaService.json(next) },
    });
    this.cache = next;
    return next;
  }
}
