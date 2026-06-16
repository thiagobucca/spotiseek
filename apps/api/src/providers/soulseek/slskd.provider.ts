import { Injectable, Logger } from '@nestjs/common';
import { TrackMetadata, SearchResult, DownloadHandle, TransferStatus } from '@spotiseek/shared';
import { MusicProvider } from '../provider.interface';

/**
 * SlskdProvider — integra com o slskd (cliente Soulseek headless) via REST API.
 * Toda a complexidade do protocolo P2P fica isolada aqui; o core só conhece
 * a interface MusicProvider. Ver docs/02-soulseek.md.
 */
@Injectable()
export class SlskdProvider implements MusicProvider {
  readonly key = 'soulseek';
  readonly name = 'Soulseek (slskd)';
  readonly priority = 0;
  private readonly log = new Logger('SlskdProvider');

  private get baseUrl() {
    return process.env.SLSKD_URL || 'http://slskd:5030';
  }
  private get apiKey() {
    return process.env.SLSKD_API_KEY || '';
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v0${path}`, {
      ...init,
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`slskd ${res.status} ${path}: ${await res.text().catch(() => '')}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const app = await this.api<any>('/application');
      const state = app?.server?.state ?? app?.serverState ?? '';
      return String(state).toLowerCase().includes('connected');
    } catch {
      return false;
    }
  }

  async search(track: TrackMetadata): Promise<SearchResult[]> {
    const searchText = `${track.artist} ${track.title}`.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const { id } = await this.api<{ id: string }>('/searches', {
      method: 'POST',
      // searchTimeout: pedimos ao slskd p/ encerrar a busca mais rápido (~8s)
      body: JSON.stringify({ searchText, fileLimit: 200, searchTimeout: 8000 }),
    });

    // IMPORTANTE: o slskd só materializa as respostas em GET /responses DEPOIS que a busca
    // chega a "Completed". Ler antes disso retorna []. Então esperamos a conclusão (cap 25s).
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      await sleep(1000);
      const s = await this.api<any>(`/searches/${id}`).catch(() => null);
      if (!s) break;
      if (String(s.state ?? '').toLowerCase().includes('completed')) break;
    }

    const responses = await this.api<any[]>(`/searches/${id}/responses`).catch(() => []);
    // NÃO deletamos a busca (apagar mid-flight causa DbUpdateConcurrencyException no slskd).

    const out: SearchResult[] = [];
    for (const r of responses ?? []) {
      for (const f of r.files ?? []) {
        // pula arquivos bloqueados: exigem que o peer permita download (não baixáveis p/ leecher)
        if (f.isLocked) continue;
        out.push({
          providerKey: this.key,
          username: r.username,
          filename: f.filename,
          folder: dirname(f.filename),
          sizeBytes: f.size ?? 0,
          format: ext(f.filename),
          bitrate: f.bitRate,
          durationSec: f.length,
          freeUploadSlots: r.hasFreeUploadSlot,
          uploadSpeed: r.uploadSpeed,
          raw: { username: r.username, queueLength: r.queueLength, file: f },
        });
      }
    }
    return out;
  }

  async download(result: SearchResult): Promise<DownloadHandle> {
    await this.api(`/transfers/downloads/${encodeURIComponent(result.username)}`, {
      method: 'POST',
      body: JSON.stringify([{ filename: result.filename, size: result.sizeBytes }]),
    });
    return { externalId: result.filename, ref: { username: result.username, filename: result.filename } };
  }

  async getTransfer(handle: DownloadHandle): Promise<TransferStatus> {
    const { username, filename } = handle.ref as any;
    const list = await this.api<any[]>(`/transfers/downloads/${encodeURIComponent(username)}`).catch(() => []);
    const t = flatten(list).find((x) => x.filename === filename);
    if (!t) return { state: 'queued', progress: 0, bytesDone: 0 };
    return {
      state: mapState(t.state),
      progress: t.percentComplete != null ? t.percentComplete / 100 : 0,
      speedBps: t.averageSpeed,
      bytesDone: t.bytesTransferred ?? 0,
      bytesTotal: t.size,
      localPath: mapState(t.state) === 'completed' ? t.filename : undefined,
    };
  }

  async cancel(handle: DownloadHandle): Promise<void> {
    const { username, filename } = handle.ref as any;
    const list = await this.api<any[]>(`/transfers/downloads/${encodeURIComponent(username)}`).catch(() => []);
    const t = flatten(list).find((x) => x.filename === filename);
    if (t?.id) await this.api(`/transfers/downloads/${encodeURIComponent(username)}/${t.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

// ── helpers ──
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function dirname(p: string) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(0, i) : '';
}
function ext(p: string) {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1].toLowerCase() : undefined;
}
/**
 * slskd agrupa transfers por usuário → diretório → files. O endpoint por-usuário
 * retorna UM objeto {username, directories} (não array); o endpoint geral retorna
 * um array de usuários. Normalizamos os dois casos antes de achatar.
 */
function flatten(list: any): any[] {
  const users = Array.isArray(list) ? list : list ? [list] : [];
  const out: any[] = [];
  for (const user of users) {
    for (const dir of user.directories ?? []) {
      for (const file of dir.files ?? []) out.push(file);
    }
    for (const file of user.files ?? []) out.push(file);
  }
  return out;
}
function mapState(s: string): TransferStatus['state'] {
  const v = String(s ?? '').toLowerCase();
  if (v.includes('completed') && v.includes('succeeded')) return 'completed';
  if (v.includes('completed') && (v.includes('cancelled') || v.includes('canceled'))) return 'cancelled';
  if (v.includes('completed')) return 'failed';
  if (v.includes('inprogress') || v.includes('in progress') || v.includes('transferring')) return 'in_progress';
  return 'queued';
}
