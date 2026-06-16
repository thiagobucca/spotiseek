import { Injectable } from '@nestjs/common';
import { TrackSource, TrackStatus } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { norm } from '../common/normalize';
import { SpotifyTrack } from '../spotify/spotify.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertArtist(name: string, opts: { spotifyId?: string; monitored?: boolean; imageUrl?: string } = {}) {
    const nameNorm = norm(name);
    const existing = await this.prisma.artist.findFirst({ where: { nameNorm } });
    if (existing) {
      if (opts.monitored && !existing.monitored) {
        return this.prisma.artist.update({ where: { id: existing.id }, data: { monitored: true } });
      }
      return existing;
    }
    return this.prisma.artist.create({
      data: { name, nameNorm, spotifyId: opts.spotifyId, monitored: opts.monitored ?? false, imageUrl: opts.imageUrl },
    });
  }

  async upsertAlbum(title: string, artistId: string, opts: { year?: number; coverUrl?: string } = {}) {
    const titleNorm = norm(title);
    const existing = await this.prisma.album.findFirst({ where: { titleNorm, artistId } });
    if (existing) return existing;
    return this.prisma.album.create({
      data: { title, titleNorm, artistId, year: opts.year, coverUrl: opts.coverUrl },
    });
  }

  /** Upsert de uma faixa do Spotify; retorna a Track e se é nova (p/ enfileirar busca). */
  async upsertSpotifyTrack(t: SpotifyTrack, source: TrackSource): Promise<{ id: string; isNew: boolean }> {
    const artist = await this.upsertArtist(t.artist);
    const album = t.album ? await this.upsertAlbum(t.album, artist.id, { year: t.year, coverUrl: t.coverUrl }) : null;
    const titleNorm = norm(t.title);

    // dedupe: por ISRC, ou por (artista, título, álbum)
    let track = t.isrc ? await this.prisma.track.findFirst({ where: { isrc: t.isrc } }) : null;
    if (!track) {
      track = await this.prisma.track.findFirst({
        where: { artistId: artist.id, titleNorm, albumId: album?.id ?? null },
      });
    }
    if (track) return { id: track.id, isNew: false };

    const created = await this.prisma.track.create({
      data: {
        title: t.title,
        titleNorm,
        artistId: artist.id,
        albumId: album?.id,
        spotifyId: t.spotifyId,
        isrc: t.isrc,
        durationMs: t.durationMs,
        trackNumber: t.trackNumber,
        popularity: t.popularity,
        coverUrl: t.coverUrl,
        status: TrackStatus.WANTED,
        source,
      },
    });
    return { id: created.id, isNew: true };
  }

  async linkPlaylistTrack(playlistId: string, trackId: string, position?: number) {
    await this.prisma.playlistTrack.upsert({
      where: { playlistId_trackId: { playlistId, trackId } },
      create: { playlistId, trackId, position },
      update: { position },
    });
  }
}
