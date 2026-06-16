import { Controller, Get } from '@nestjs/common';
import { HealthDTO } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/provider.registry';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly registry: ProviderRegistry) {}

  /** GET /api/health — público (usado pelo healthcheck do Docker). */
  @Get()
  async check(): Promise<HealthDTO> {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {}
    const slskd = await this.registry.get('soulseek')?.healthCheck().catch(() => false) ?? false;
    return { db, slskd, spotify: !!process.env.SPOTIFY_CLIENT_ID };
  }
}
