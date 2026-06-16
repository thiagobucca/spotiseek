import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, basename, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { LibraryArtistDTO, LibraryAlbumDTO, TrackDTO, TrackStatus, DownloadState } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const exec = promisify(execFile);

/** Remove caracteres inválidos p/ nomes de arquivo/pasta, preservando legibilidade. */
function sanitize(name: string): string {
  return (name || 'Unknown')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Unknown';
}

@Injectable()
export class LibraryService {
  private readonly log = new Logger('Library');

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private get downloadsPath() {
    return process.env.DOWNLOADS_PATH || '/downloads';
  }

  /** Organiza um download concluído: localiza arquivo, move/renomeia, escreve tags. */
  async organize(downloadJobId: string): Promise<void> {
    const dj = await this.prisma.downloadJob.findUnique({ where: { id: downloadJobId } });
    if (!dj) return;
    const track = await this.prisma.track.findUnique({
      where: { id: dj.trackId },
      include: { artist: true, album: true },
    });
    if (!track) return;
    const settings = await this.settings.get();

    // 1. localiza o arquivo baixado em /downloads. ATENÇÃO: dj.filePath/ref.filename são o
    // caminho REMOTO do peer (estilo Windows, com '\'), não o local. O slskd grava o arquivo
    // em /downloads/<última-pasta-remota>/<arquivo>, então buscamos pelo basename.
    const ref = PrismaService.parse<{ filename?: string }>(dj.externalRef, {});
    const remoteName = (ref.filename || dj.filePath || '').replace(/\\/g, '/');
    const wanted = remoteName ? basename(remoteName) : null;
    const src = wanted ? await this.findFile(this.downloadsPath, wanted) : null;
    if (!src) throw new Error(`arquivo baixado não encontrado em ${this.downloadsPath} (${wanted ?? '?'})`);

    const ext = extname(src) || '.mp3';
    const artistDir = sanitize(track.artist.name);
    const albumDir = sanitize(track.album?.title || 'Singles') + (track.album?.year ? ` (${track.album.year})` : '');
    const nn = track.trackNumber ? String(track.trackNumber).padStart(2, '0') + ' ' : '';
    const fileName = `${nn}${sanitize(track.title)}${ext}`;
    const destDir = join(settings.libraryPath, artistDir, albumDir);
    const dest = join(destDir, fileName);

    // 2. dedupe por hash, se ativado
    const stat = await fs.stat(src);
    let hash: string | undefined;
    if (settings.deduplicate) {
      hash = await this.hashFile(src);
      const dup = await this.prisma.libraryFile.findFirst({ where: { hash } });
      if (dup) {
        this.log.log(`duplicado detectado (${track.title}) — descartando novo arquivo`);
        await fs.rm(src, { force: true }).catch(() => {});
        await this.markImported(dj.id, track.id, dup.path, dup.format, dup.sizeBytes);
        return;
      }
    }

    // 3. move
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(src, dest).catch(async () => {
      await fs.copyFile(src, dest);
      await fs.rm(src, { force: true }).catch(() => {});
    });

    // 4. tags (ffmpeg, in-place via tmp) — best-effort
    if (settings.organizeAutomatically) {
      await this.writeTags(dest, track).catch((e) => this.log.warn(`tags falharam: ${e.message}`));
    }

    const format = ext.replace('.', '').toLowerCase();
    await this.prisma.libraryFile.create({
      data: { trackId: track.id, path: dest, format, sizeBytes: Number(stat.size), hash, tagged: settings.organizeAutomatically },
    });
    await this.markImported(dj.id, track.id, dest, format, Number(stat.size));
    this.log.log(`importado: ${dest}`);
  }

  private async markImported(djId: string, trackId: string, _path: string, _format: string, _size: number) {
    await this.prisma.downloadJob.update({ where: { id: djId }, data: { state: DownloadState.IMPORTED, finishedAt: new Date() } });
    await this.prisma.track.update({ where: { id: trackId }, data: { status: TrackStatus.IMPORTED } });
  }

  private async writeTags(file: string, track: any) {
    const tmp = file + '.tmp' + extname(file);
    const args = ['-y', '-i', file, '-c', 'copy',
      '-metadata', `title=${track.title}`,
      '-metadata', `artist=${track.artist.name}`,
    ];
    if (track.album) args.push('-metadata', `album=${track.album.title}`);
    if (track.album?.year) args.push('-metadata', `date=${track.album.year}`);
    if (track.trackNumber) args.push('-metadata', `track=${track.trackNumber}`);
    args.push(tmp);
    await exec('ffmpeg', args);
    await fs.rename(tmp, file);
  }

  private async hashFile(path: string): Promise<string> {
    const buf = await fs.readFile(path);
    return createHash('sha256').update(buf).digest('hex');
  }

  private async findFile(dir: string, name: string): Promise<string | null> {
    let entries: any[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.incomplete') continue;
        const found = await this.findFile(full, name);
        if (found) return found;
      } else if (e.name === name) {
        return full;
      }
    }
    return null;
  }

  // ── queries p/ UI ──
  async artists(): Promise<LibraryArtistDTO[]> {
    const rows = await this.prisma.artist.findMany({
      where: { tracks: { some: { status: TrackStatus.IMPORTED } } },
      include: { _count: { select: { albums: true } }, albums: { take: 1, where: { coverUrl: { not: null } } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      coverUrl: a.imageUrl || a.albums[0]?.coverUrl || undefined,
      coverSeed: a.name,
      albumCount: a._count.albums,
    }));
  }

  async albums(): Promise<LibraryAlbumDTO[]> {
    const rows = await this.prisma.album.findMany({
      where: { tracks: { some: { status: TrackStatus.IMPORTED } } },
      include: { artist: true, _count: { select: { tracks: true } } },
      orderBy: { title: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist.name,
      year: a.year ?? undefined,
      coverUrl: a.coverUrl ?? undefined,
      coverSeed: `${a.artist.name} ${a.title}`,
      trackCount: a._count.tracks,
    }));
  }

  async searchTracks(q: string): Promise<TrackDTO[]> {
    const rows = await this.prisma.track.findMany({
      where: q ? { titleNorm: { contains: q.toLowerCase() } } : {},
      include: { artist: true, album: true },
      take: 100,
      orderBy: { title: 'asc' },
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist.name,
      album: t.album?.title,
      durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : undefined,
      coverUrl: t.coverUrl ?? t.album?.coverUrl ?? undefined,
      coverSeed: `${t.artist.name} ${t.title}`,
      status: t.status as TrackStatus,
    }));
  }

  /** Espaço usado pela biblioteca + breakdown por formato (p/ dashboard). */
  async diskUsage() {
    const files = await this.prisma.libraryFile.findMany({ select: { sizeBytes: true, format: true } });
    let flac = 0, mp3 = 0, other = 0;
    for (const f of files) {
      if (f.format === 'flac') flac += f.sizeBytes;
      else if (f.format === 'mp3') mp3 += f.sizeBytes;
      else other += f.sizeBytes;
    }
    const gb = (n: number) => Math.round((n / 1e9) * 10) / 10;
    return { flacGb: gb(flac), mp3Gb: gb(mp3), otherGb: gb(other), totalGb: gb(flac + mp3 + other), losslessRatio: files.length ? flac / (flac + mp3 + other || 1) : 0 };
  }
}
