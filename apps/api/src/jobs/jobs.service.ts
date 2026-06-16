import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  JobQueueName,
  TrackStatus,
  DownloadState,
  PlaylistStatus,
  SearchResult,
  TrackMetadata,
  DownloadDTO,
} from '@spotiseek/shared';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpotifyService } from '../spotify/spotify.service';
import { CatalogService } from '../catalog/catalog.service';
import { MatchingService } from '../matching/matching.service';
import { ProviderRegistry } from '../providers/provider.registry';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { LibraryService } from '../library/library.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly log = new Logger('Jobs');

  constructor(
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly spotify: SpotifyService,
    private readonly catalog: CatalogService,
    private readonly matching: MatchingService,
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly library: LibraryService,
  ) {}

  async onModuleInit() {
    const s = await this.settings.get();
    this.queue.register(JobQueueName.IMPORT, (d) => this.handleImport(d), { concurrency: 1, maxAttempts: 3 });
    this.queue.register(JobQueueName.SEARCH, (d) => this.handleSearch(d), { concurrency: 2, maxAttempts: 3, minIntervalMs: 1000 });
    this.queue.register(JobQueueName.DOWNLOAD, (d) => this.handleDownload(d), { concurrency: Math.max(1, s.maxConcurrentDownloads), maxAttempts: 2 });
    this.queue.register(JobQueueName.ORGANIZE, (d) => this.handleOrganize(d), { concurrency: 1, maxAttempts: 3 });
    this.queue.register('wishlist', (d) => this.handleWishlist(d), { concurrency: 1, maxAttempts: 2 });
    this.log.log('Pipeline de jobs registrado');
  }

  // enqueue helpers (chamados pelos controllers)
  enqueuePlaylistSync(playlistId: string, userId?: string) {
    return this.queue.add(JobQueueName.IMPORT, { kind: 'playlist', playlistId, userId });
  }
  enqueueTrackSearch(trackId: string) {
    return this.queue.add(JobQueueName.SEARCH, { trackId });
  }
  enqueueWishlistResolve(wishlistId: string) {
    return this.queue.add('wishlist', { wishlistId });
  }

  // ───────────────── WISHLIST (resolve via Spotify → baixa) ─────────────────
  private async handleWishlist(data: { wishlistId: string }) {
    const w = await this.prisma.wishlist.findUnique({ where: { id: data.wishlistId } });
    if (!w) return;
    await this.prisma.wishlist.update({ where: { id: w.id }, data: { status: 'resolvendo…' } });
    try {
      let label = '';
      const trackIds: string[] = [];

      if (w.type === 'TRACK') {
        const t = await this.spotify.searchTrack(w.query);
        if (!t) return this.failWishlist(w.id, 'não encontrada no Spotify');
        const { id } = await this.catalog.upsertSpotifyTrack(t, 'WISHLIST_TRACK');
        trackIds.push(id);
        await this.enqueueTrackSearch(id);
        label = `${t.artist} — ${t.title}`;
      } else if (w.type === 'ALBUM') {
        const al = await this.spotify.resolveAlbum(w.query);
        if (!al || !al.tracks.length) return this.failWishlist(w.id, 'álbum não encontrado');
        for (const t of al.tracks) {
          const { id } = await this.catalog.upsertSpotifyTrack(t, 'WISHLIST_ALBUM');
          trackIds.push(id);
          await this.enqueueTrackSearch(id);
        }
        label = al.name;
      } else if (w.type === 'ARTIST') {
        const ar = await this.spotify.resolveArtist(w.query);
        if (!ar) return this.failWishlist(w.id, 'artista não encontrado');
        await this.catalog.upsertArtist(ar.name, { spotifyId: ar.id, monitored: true });
        for (const albumId of ar.albumIds) {
          const al = await this.spotify.getAlbumTracks(albumId).catch(() => null);
          if (!al) continue;
          for (const t of al.tracks) {
            const { id, isNew } = await this.catalog.upsertSpotifyTrack(t, 'WISHLIST_ARTIST');
            trackIds.push(id);
            if (isNew) await this.enqueueTrackSearch(id);
          }
        }
        label = `${ar.name} · ${ar.albumIds.length} álbuns`;
      } else {
        // PLAYLIST: por enquanto orientamos o import por URL (busca de playlist é limitada).
        return this.failWishlist(w.id, 'para playlist, use Playlists → Importar URL');
      }

      // Status guarda os trackIds resolvidos; o status mostrado é calculado AO VIVO no
      // GET /wishlist a partir do estado real dessas faixas (não congela em "baixando").
      await this.prisma.wishlist.update({
        where: { id: w.id },
        data: { status: label, resolved: PrismaService.json({ count: trackIds.length, trackIds }) },
      });
      await this.events.log('info', 'wishlist', `Wishlist resolvida: ${label} · ${trackIds.length} faixas`);
    } catch (err) {
      await this.failWishlist(w.id, 'erro ao resolver');
      throw err;
    }
  }

  private async failWishlist(id: string, msg: string) {
    await this.prisma.wishlist.update({ where: { id }, data: { status: msg } });
    await this.events.log('warn', 'wishlist', msg);
  }

  // ───────────────── IMPORT ─────────────────
  private async handleImport(data: { kind: string; playlistId: string; userId?: string }) {
    if (data.kind !== 'playlist') return;
    const pl = await this.prisma.playlist.findUnique({ where: { id: data.playlistId } });
    if (!pl?.spotifyId) return;

    await this.prisma.playlist.update({ where: { id: pl.id }, data: { status: PlaylistStatus.SYNCING } });
    try {
      const meta = await this.spotify.getPlaylistMeta(pl.spotifyId, data.userId);
      if (pl.snapshotId && pl.snapshotId === meta.snapshotId) {
        await this.prisma.playlist.update({ where: { id: pl.id }, data: { status: PlaylistStatus.IDLE, lastSyncedAt: new Date() } });
        await this.events.log('info', 'spotify', `Playlist "${pl.name}" sem mudanças (snapshot)`);
        return;
      }
      const settings = await this.settings.get();
      let added = 0;
      let pos = 0;
      for await (const t of this.spotify.getPlaylistTracks(pl.spotifyId, data.userId)) {
        const { id, isNew } = await this.catalog.upsertSpotifyTrack(t, 'SPOTIFY_PLAYLIST');
        await this.catalog.linkPlaylistTrack(pl.id, id, pos++);
        if (isNew) {
          added++;
          // Só dispara busca/download automaticamente se o usuário optou por isso.
          // Por padrão (autoDownload=false), a import só cataloga; download é sob demanda.
          if (settings.autoDownload) await this.enqueueTrackSearch(id);
        }
      }
      await this.prisma.playlist.update({
        where: { id: pl.id },
        data: { status: PlaylistStatus.IDLE, lastSyncedAt: new Date(), snapshotId: meta.snapshotId, name: meta.name, coverUrl: meta.coverUrl },
      });
      this.events.emit({ type: 'sync.progress', data: { playlistId: pl.id, status: PlaylistStatus.IDLE, added } });
      await this.events.log('info', 'spotify', `Playlist "${pl.name}" sincronizada · +${added} faixas`);
    } catch (err: any) {
      await this.prisma.playlist.update({ where: { id: pl.id }, data: { status: PlaylistStatus.ERROR } });
      throw err;
    }
  }

  // ───────────────── SEARCH + MATCH ─────────────────
  private async handleSearch(data: { trackId: string }) {
    const track = await this.prisma.track.findUnique({ where: { id: data.trackId }, include: { artist: true, album: true } });
    if (!track || track.status === TrackStatus.IMPORTED) return;
    const settings = await this.settings.get();
    await this.prisma.track.update({ where: { id: track.id }, data: { status: TrackStatus.SEARCHING } });

    const meta: TrackMetadata = {
      title: track.title,
      artist: track.artist.name,
      album: track.album?.title,
      durationSec: track.durationMs ? Math.round(track.durationMs / 1000) : undefined,
      isrc: track.isrc ?? undefined,
    };

    // busca nos providers ativos, em ordem de prioridade, até obter resultados
    let results: SearchResult[] = [];
    for (const provider of this.registry.ordered()) {
      const row = await this.prisma.provider.findUnique({ where: { key: provider.key } });
      if (row && !row.enabled) continue;
      try {
        results = await provider.search(meta);
        if (results.length) break;
      } catch (e: any) {
        this.log.warn(`busca falhou em ${provider.key}: ${e.message}`);
      }
    }

    const ranked = this.matching.rank(meta, results, settings);
    // persiste candidatos (auditoria) — top 10
    await this.prisma.matchCandidate.deleteMany({ where: { trackId: track.id } });
    const top = ranked.slice(0, 10);
    const created = await Promise.all(
      top.map((s, i) =>
        this.prisma.matchCandidate.create({
          data: {
            trackId: track.id,
            providerKey: s.result.providerKey,
            raw: PrismaService.json(s.result),
            filename: s.result.filename,
            username: s.result.username,
            format: s.result.format,
            bitrate: this.matching.effectiveBitrate(s.result),
            sizeBytes: s.result.sizeBytes,
            score: s.score,
            scoreBreakdown: PrismaService.json(s.breakdown),
            chosen: i === 0 && s.score >= 0.5,
          },
        }),
      ),
    );

    const best = top[0];
    if (!best || best.score < 0.5) {
      await this.prisma.track.update({ where: { id: track.id }, data: { status: TrackStatus.FAILED } });
      await this.events.log('warn', 'match', `Sem fonte aceitável para "${track.title}" — ${track.artist.name}`);
      return;
    }

    const providerRow = await this.prisma.provider.findUnique({ where: { key: best.result.providerKey } });
    const tier = this.matching.classify(best.result.format, this.matching.effectiveBitrate(best.result));
    const dj = await this.prisma.downloadJob.create({
      data: {
        trackId: track.id,
        providerId: providerRow!.id,
        candidateId: created[0].id,
        peer: best.result.username,
        quality: tier ?? undefined,
        state: DownloadState.QUEUED,
        bytesTotal: best.result.sizeBytes,
      },
    });
    await this.prisma.track.update({ where: { id: track.id }, data: { status: TrackStatus.MATCHED } });
    await this.events.log('info', 'match', `Match para "${track.title}" · score ${best.score.toFixed(2)}`);
    await this.queue.add(JobQueueName.DOWNLOAD, { downloadJobId: dj.id });
  }

  // ───────────────── DOWNLOAD ─────────────────
  private async handleDownload(data: { downloadJobId: string }) {
    const dj = await this.prisma.downloadJob.findUnique({
      where: { id: data.downloadJobId },
      include: { provider: true, track: { include: { artist: true } } },
    });
    if (!dj) return;
    const candidate = dj.candidateId ? await this.prisma.matchCandidate.findUnique({ where: { id: dj.candidateId } }) : null;
    if (!candidate) throw new Error('candidato ausente');
    const provider = this.registry.get(dj.provider.key);
    if (!provider) throw new Error('provider indisponível');

    const result = PrismaService.parse<SearchResult>(candidate.raw, null as any);
    const handle = await provider.download(result);
    await this.prisma.downloadJob.update({
      where: { id: dj.id },
      data: { state: DownloadState.IN_PROGRESS, externalRef: PrismaService.json(handle.ref), startedAt: new Date() },
    });
    await this.prisma.track.update({ where: { id: dj.trackId }, data: { status: TrackStatus.DOWNLOADING } });

    const emit = (state: DownloadState, progress: number, speedBps?: number, bytesDone = 0) => {
      const dto: DownloadDTO = {
        id: dj.id, trackId: dj.trackId, title: dj.track.title, artist: dj.track.artist.name,
        coverSeed: `${dj.track.artist.name} ${dj.track.title}`, providerKey: dj.provider.key, peer: dj.peer ?? undefined,
        quality: (dj.quality as any) ?? undefined, state, progress, speedBps, bytesDone, bytesTotal: dj.bytesTotal ?? undefined,
      };
      this.events.emit({ type: state === DownloadState.COMPLETED ? 'download.done' : 'download.progress', data: dto });
    };

    // Detecção de stall: se o peer não envia bytes por STALL_MS, desiste dele e tenta
    // outra fonte (rotação de candidato) — evita ficar 30min preso num peer morto.
    const STALL_MS = 90_000;
    const deadline = Date.now() + 20 * 60 * 1000;
    let lastBytes = 0;
    let stallSince = Date.now();
    while (Date.now() < deadline) {
      await sleep(1500);
      const st = await provider.getTransfer(handle);
      await this.prisma.downloadJob.update({
        where: { id: dj.id },
        data: { progress: st.progress, speedBps: st.speedBps, bytesDone: st.bytesDone, bytesTotal: st.bytesTotal ?? dj.bytesTotal },
      });
      emit(DownloadState.IN_PROGRESS, st.progress, st.speedBps, st.bytesDone);
      if (st.state === 'completed') {
        await this.prisma.downloadJob.update({ where: { id: dj.id }, data: { state: DownloadState.COMPLETED, progress: 1, filePath: st.localPath } });
        await this.prisma.track.update({ where: { id: dj.trackId }, data: { status: TrackStatus.DOWNLOADED } });
        emit(DownloadState.COMPLETED, 1);
        await this.queue.add(JobQueueName.ORGANIZE, { downloadJobId: dj.id });
        return;
      }
      if (st.state === 'failed' || st.state === 'cancelled') {
        return this.rotateOrFail(dj.id, dj.trackId, provider, handle, `transfer ${st.state}`);
      }
      // stall: bytes não aumentaram dentro da janela
      if (st.bytesDone > lastBytes) {
        lastBytes = st.bytesDone;
        stallSince = Date.now();
      } else if (Date.now() - stallSince > STALL_MS) {
        return this.rotateOrFail(dj.id, dj.trackId, provider, handle, 'peer parado (sem envio)');
      }
    }
    return this.rotateOrFail(dj.id, dj.trackId, provider, handle, 'timeout');
  }

  /**
   * Marca o download atual como falho e tenta a PRÓXIMA melhor fonte (candidato) que
   * ainda não foi tentada para a faixa. Esgotadas as tentativas, marca a faixa FAILED.
   * Não relança erro (evita o retry da fila repetir o mesmo peer morto).
   */
  private async rotateOrFail(
    djId: string,
    trackId: string,
    provider: { cancel: (h: any) => Promise<void> },
    handle: any,
    reason: string,
  ) {
    await provider.cancel(handle).catch(() => {});
    await this.prisma.downloadJob.update({ where: { id: djId }, data: { state: DownloadState.FAILED, error: reason } });

    const tried = await this.prisma.downloadJob.findMany({
      where: { trackId, state: { in: [DownloadState.FAILED, DownloadState.CANCELLED] } },
      select: { candidateId: true },
    });
    const triedIds = new Set(tried.map((t) => t.candidateId).filter(Boolean) as string[]);
    const MAX_ATTEMPTS = 4;

    const candidates = await this.prisma.matchCandidate.findMany({ where: { trackId }, orderBy: { score: 'desc' } });
    const next = triedIds.size >= MAX_ATTEMPTS ? undefined : candidates.find((c) => !triedIds.has(c.id));

    if (!next) {
      await this.prisma.track.update({ where: { id: trackId }, data: { status: TrackStatus.FAILED } });
      await this.events.log('warn', 'download', `Falhou após ${triedIds.size} fonte(s): ${reason}`);
      return;
    }

    const providerRow = await this.prisma.provider.findUnique({ where: { key: next.providerKey } });
    const tier = this.matching.classify(next.format ?? undefined, next.bitrate ?? undefined);
    const newDj = await this.prisma.downloadJob.create({
      data: {
        trackId,
        providerId: providerRow!.id,
        candidateId: next.id,
        peer: next.username,
        quality: tier ?? undefined,
        state: DownloadState.QUEUED,
        bytesTotal: next.sizeBytes,
      },
    });
    await this.events.log('info', 'download', `Tentando outra fonte (${next.username}) — ${reason}`);
    await this.queue.add(JobQueueName.DOWNLOAD, { downloadJobId: newDj.id });
  }

  // ───────────────── ORGANIZE ─────────────────
  private async handleOrganize(data: { downloadJobId: string }) {
    await this.library.organize(data.downloadJobId);
    const dj = await this.prisma.downloadJob.findUnique({ where: { id: data.downloadJobId }, include: { track: { include: { artist: true } } } });
    if (dj) await this.events.log('info', 'library', `Importado: "${dj.track.title}" — ${dj.track.artist.name}`);
  }
}
