import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SyncMode } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { JobsService } from '../jobs/jobs.service';
import { ProviderRegistry } from '../providers/provider.registry';

/**
 * Scheduler leve baseado em setInterval (sem cron externo). Dispara sync das
 * playlists AUTO/SCHEDULED conforme o intervalo configurado e atualiza a saúde
 * dos providers periodicamente.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Scheduler');
  private syncTimer?: NodeJS.Timeout;
  private healthTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly registry: ProviderRegistry,
  ) {}

  onModuleInit() {
    // checa a cada 5 min se há playlists a sincronizar (respeitando o intervalo)
    this.syncTimer = setInterval(() => this.runSync().catch((e) => this.log.error(e)), 5 * 60 * 1000);
    // health-check dos providers a cada 60s
    this.healthTimer = setInterval(() => this.runHealth().catch(() => {}), 60 * 1000);
    setTimeout(() => this.runHealth().catch(() => {}), 5000);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
  }

  private async runSync() {
    const s = await this.settings.get();
    if (!s.autoSync) return;
    const cutoff = new Date(Date.now() - s.syncIntervalMinutes * 60 * 1000);
    const playlists = await this.prisma.playlist.findMany({
      where: {
        syncMode: { in: [SyncMode.AUTO, SyncMode.SCHEDULED] },
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
      },
    });
    for (const p of playlists) {
      await this.jobs.enqueuePlaylistSync(p.id);
      this.log.log(`auto-sync agendado: ${p.name}`);
    }
  }

  private async runHealth() {
    for (const provider of this.registry.all()) {
      const healthy = await provider.healthCheck().catch(() => false);
      await this.prisma.provider.update({ where: { key: provider.key }, data: { healthy, lastCheck: new Date() } }).catch(() => {});
    }
  }
}
