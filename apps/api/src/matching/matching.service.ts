import { Injectable } from '@nestjs/common';
import { SearchResult, TrackMetadata, QualityTier, SettingsDTO } from '@spotiseek/shared';
import { norm, dice } from '../common/normalize';

export interface ScoredCandidate {
  result: SearchResult;
  score: number;
  breakdown: Record<string, number | boolean>;
}

const W = { title: 0.35, artist: 0.3, album: 0.1, duration: 0.1, quality: 0.15 };

@Injectable()
export class MatchingService {
  /**
   * Bitrate efetivo: usa o reportado pelo peer; se ausente (comum no Soulseek),
   * estima a partir de tamanho/duração — kbps ≈ (bytes*8)/seg/1000.
   */
  effectiveBitrate(c: { bitrate?: number; format?: string; sizeBytes?: number; durationSec?: number }): number | undefined {
    if (c.bitrate && c.bitrate > 0) return c.bitrate;
    const f = (c.format || '').toLowerCase();
    if (f === 'mp3' && c.sizeBytes && c.durationSec && c.durationSec > 0) {
      return Math.round((c.sizeBytes * 8) / c.durationSec / 1000);
    }
    return undefined;
  }

  /** Classifica formato/bitrate em um tier de qualidade. */
  classify(format?: string, bitrate?: number): QualityTier | null {
    const f = (format || '').toLowerCase();
    if (f === 'flac' || f === 'alac' || f === 'wav') return QualityTier.FLAC;
    if (f === 'mp3') {
      if (!bitrate) return QualityTier.MP3_256;
      if (bitrate >= 320) return QualityTier.MP3_320;
      if (bitrate >= 256) return QualityTier.MP3_256;
      if (bitrate >= 192) return QualityTier.MP3_192;
      return null; // abaixo de 192
    }
    if (f === 'm4a' || f === 'aac' || f === 'ogg' || f === 'opus') return QualityTier.MP3_256;
    return null;
  }

  private qualityRank(tier: QualityTier | null, priority: QualityTier[]): number {
    if (!tier) return 0;
    const idx = priority.indexOf(tier);
    if (idx < 0) return 0;
    return 1 - idx / priority.length;
  }

  private meetsMinimum(tier: QualityTier | null, settings: SettingsDTO): boolean {
    if (!tier) return false;
    const order = settings.qualityPriority;
    const minIdx = order.indexOf(settings.qualityMinimum);
    const tierIdx = order.indexOf(tier);
    return tierIdx >= 0 && (minIdx < 0 || tierIdx <= minIdx);
  }

  scoreOne(track: TrackMetadata, c: SearchResult, settings: SettingsDTO): ScoredCandidate {
    const base = c.filename.split(/[\\/]/).pop() || c.filename;
    const name = base.replace(/\.[a-z0-9]+$/i, '');

    const bitrate = this.effectiveBitrate(c);
    const tier = this.classify(c.format, bitrate);

    // "Palheiro": pasta + nome do arquivo normalizados. Nomes do Soulseek costumam ser
    // "Artista - Título" com lixo extra, então containment (substring) é sinal mais forte
    // que similaridade pura de string.
    const hay = norm(`${c.folder ?? ''} ${name}`);
    const nt = norm(track.title);
    // artista primário: primeiro de uma lista "A, B & C feat. D"
    const primary = norm(track.artist.split(/[,&/]|feat\.?|ft\.?|x /i)[0] || track.artist);
    const na = norm(track.artist);

    const title = Math.max(dice(nt, norm(name)), nt.length >= 3 && hay.includes(nt) ? 0.95 : 0);
    const artist = Math.max(
      dice(na, hay),
      dice(primary, hay),
      primary.length >= 3 && hay.includes(primary) ? 0.9 : 0,
    );
    const album = track.album ? dice(norm(track.album), norm(c.folder ?? '')) : 0.5;
    const dur =
      c.durationSec && track.durationSec
        ? Math.max(0, 1 - Math.abs(c.durationSec - track.durationSec) / 30)
        : 0.5;
    const quality = this.qualityRank(tier, settings.qualityPriority);
    const noise =
      /\b(remix|live|karaoke|cover|instrumental|8d|sped up|slowed)\b/i.test(name) &&
      !/\b(remix|live)\b/i.test(track.title)
        ? 0.15
        : 0;

    let score = W.title * title + W.artist * artist + W.album * album + W.duration * dur + W.quality * quality - noise;
    score = Math.max(0, Math.min(1, score));

    return {
      result: c,
      score,
      breakdown: { title, artist, album, duration: dur, quality, noise, meetsMin: this.meetsMinimum(tier, settings), tier: tier as any },
    };
  }

  /** Pontua todos, descarta abaixo do mínimo, ordena. */
  rank(track: TrackMetadata, candidates: SearchResult[], settings: SettingsDTO): ScoredCandidate[] {
    return candidates
      .map((c) => this.scoreOne(track, c, settings))
      .filter((s) => s.breakdown.meetsMin === true)
      .sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
        // desempate: mais slots livres, depois maior velocidade de upload
        const af = a.result.freeUploadSlots ? 1 : 0;
        const bf = b.result.freeUploadSlots ? 1 : 0;
        if (af !== bf) return bf - af;
        return (b.result.uploadSpeed ?? 0) - (a.result.uploadSpeed ?? 0);
      });
  }
}
