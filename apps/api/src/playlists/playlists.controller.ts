import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PlaylistDTO, PlaylistDetailDTO, PlaylistStatus, SyncMode, TrackStatus, TrackDTO } from '@spotiseek/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SpotifyService } from '../spotify/spotify.service';
import { JobsService } from '../jobs/jobs.service';

@UseGuards(JwtGuard)
@Controller('playlists')
export class PlaylistsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spotify: SpotifyService,
    private readonly jobs: JobsService,
  ) {}

  @Get()
  async list(): Promise<PlaylistDTO[]> {
    const rows = await this.prisma.playlist.findMany({
      include: { _count: { select: { tracks: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const out: PlaylistDTO[] = [];
    for (const p of rows) {
      const total = p._count.tracks;
      const done = await this.prisma.playlistTrack.count({
        where: { playlistId: p.id, track: { status: TrackStatus.IMPORTED } },
      });
      out.push(this.toDto(p, total, done));
    }
    return out;
  }

  @Post('import')
  async import(@Body('url') url: string, @Req() req: any) {
    const spotifyId = SpotifyService.parsePlaylistId(url);
    const meta = await this.spotify.getPlaylistMeta(spotifyId, req.user.sub);
    const pl = await this.prisma.playlist.upsert({
      where: { spotifyId },
      create: { spotifyId, name: meta.name, isPublic: meta.isPublic, coverUrl: meta.coverUrl, syncMode: SyncMode.MANUAL },
      update: { name: meta.name, coverUrl: meta.coverUrl },
    });
    const job = await this.jobs.enqueuePlaylistSync(pl.id, req.user.sub);
    return { playlistId: pl.id, jobId: job.id };
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<PlaylistDetailDTO> {
    const p = await this.prisma.playlist.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { tracks: true } } },
    });
    const links = await this.prisma.playlistTrack.findMany({
      where: { playlistId: id },
      include: { track: { include: { artist: true, album: true, candidates: { where: { chosen: true }, take: 1 } } } },
      orderBy: { position: 'asc' },
    });
    const done = links.filter((l) => l.track.status === TrackStatus.IMPORTED).length;
    const tracks: TrackDTO[] = links.map((l) => ({
      id: l.track.id,
      title: l.track.title,
      artist: l.track.artist.name,
      album: l.track.album?.title,
      durationSec: l.track.durationMs ? Math.round(l.track.durationMs / 1000) : undefined,
      coverUrl: l.track.coverUrl ?? l.track.album?.coverUrl ?? undefined,
      coverSeed: `${l.track.artist.name} ${l.track.title}`,
      status: l.track.status as TrackStatus,
      quality: (l.track.candidates[0] as any)?.format ? undefined : undefined,
      score: l.track.candidates[0]?.score,
    }));
    return { ...this.toDto(p, p._count.tracks, done), tracks };
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string, @Req() req: any) {
    const job = await this.jobs.enqueuePlaylistSync(id, req.user.sub);
    return { jobId: job.id };
  }

  /** Baixa todas as faixas da playlist ainda não importadas (sob demanda em lote). */
  @Post(':id/download-all')
  async downloadAll(@Param('id') id: string) {
    const links = await this.prisma.playlistTrack.findMany({
      where: {
        playlistId: id,
        track: { status: { in: [TrackStatus.WANTED, TrackStatus.FAILED, TrackStatus.IGNORED] } },
      },
      select: { trackId: true },
    });
    for (const l of links) {
      await this.prisma.track.update({ where: { id: l.trackId }, data: { status: TrackStatus.WANTED } });
      await this.jobs.enqueueTrackSearch(l.trackId);
    }
    return { queued: links.length };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { syncMode?: SyncMode; name?: string }) {
    return this.prisma.playlist.update({ where: { id }, data: { syncMode: body.syncMode, name: body.name } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.playlist.delete({ where: { id } });
    return { ok: true };
  }

  private toDto(p: any, total: number, done: number): PlaylistDTO {
    return {
      id: p.id,
      name: p.name,
      coverUrl: p.coverUrl ?? undefined,
      coverSeed: p.name,
      trackCount: total,
      lastSyncedAt: p.lastSyncedAt?.toISOString(),
      status: p.status as PlaylistStatus,
      syncMode: p.syncMode as SyncMode,
      doneRatio: total ? done / total : 0,
    };
  }
}
