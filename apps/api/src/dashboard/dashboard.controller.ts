import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardStats, DownloadState, TrackStatus } from '@spotiseek/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LibraryService } from '../library/library.service';

@UseGuards(JwtGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService, private readonly library: LibraryService) {}

  @Get()
  async stats(): Promise<DashboardStats> {
    const [playlists, monitoredArtists, activeDownloads, libraryTracks, recent] = await Promise.all([
      this.prisma.playlist.count(),
      this.prisma.artist.count({ where: { monitored: true } }),
      this.prisma.downloadJob.count({ where: { state: { in: [DownloadState.IN_PROGRESS, DownloadState.QUEUED, DownloadState.REQUESTED] } } }),
      this.prisma.track.count({ where: { status: TrackStatus.IMPORTED } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
    const usage = await this.library.diskUsage();
    // espaço livre estimado: assume volume; sem stat de FS aqui, reportamos só o usado
    const freeGb = 0;
    return {
      playlists,
      monitoredArtists,
      activeDownloads,
      libraryTracks,
      diskUsedGb: usage.totalGb,
      losslessPercent: Math.round(usage.losslessRatio * 100),
      storage: { flacGb: usage.flacGb, mp3Gb: usage.mp3Gb, otherGb: usage.otherGb, freeGb },
      activity: recent.map((r) => ({ id: r.id, level: r.level as any, message: r.message, at: r.createdAt.toISOString() })),
    };
  }
}
