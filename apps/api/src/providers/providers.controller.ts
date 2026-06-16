import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProviderDTO } from '@spotiseek/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { ProviderRegistry } from './provider.registry';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly registry: ProviderRegistry, private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<ProviderDTO[]> {
    const rows = await this.prisma.provider.findMany({ orderBy: { priority: 'asc' } });
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      enabled: r.enabled,
      priority: r.priority,
      healthy: r.healthy,
      lastCheck: r.lastCheck?.toISOString(),
    }));
  }

  @Patch(':key')
  async update(@Param('key') key: string, @Body() body: Partial<ProviderDTO>) {
    return this.prisma.provider.update({
      where: { key },
      data: { enabled: body.enabled, priority: body.priority },
    });
  }

  @Post(':key/health')
  async health(@Param('key') key: string) {
    const provider = this.registry.get(key);
    const healthy = provider ? await provider.healthCheck() : false;
    await this.prisma.provider.update({ where: { key }, data: { healthy, lastCheck: new Date() } });
    return { healthy };
  }
}
