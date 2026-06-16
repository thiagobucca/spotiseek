/**
 * SSE client for live updates (download progress + activity log).
 *
 * Real mode: connects an EventSource to `/api/events` and dispatches typed
 * SseEvents. Mock mode: simulates progress and a rolling log with a timer,
 * exactly like the prototype's live tick.
 */
import type { DownloadDTO, SseEvent } from '@spotiseek/shared';
import { DownloadState } from '@spotiseek/shared';
import { USE_MOCKS } from './client';
import { mockDownloads } from './mock';

export type SseHandler = (ev: SseEvent) => void;

/** Lines cycled through by the mock log (ported from the prototype). */
export const LOG_LINES = [
  '[slskd] busca "metallica master of puppets" → 47 respostas',
  '[match] escolhido audiophile_99/Master of Puppets.flac · score 0.96',
  '[slskd] transfer iniciado · audiophile_99 · 24.1 MB',
  '[dl] Master of Puppets ······ 62% · 1.34 MB/s',
  '[organize] tags FLAC gravadas · capa 1200×1200 embutida',
  '[lib] → /music/Metallica/Master of Puppets/01 Battery.flac',
  '[spotify] snapshot inalterado · Prog Essentials · no-op',
  '[slskd] busca "pink floyd echoes live" → 0 fontes ≥ MP3 320'
];

/** Colorize a log line for display (returns segments to render). */
export function paintLog(line: string): string {
  return line
    .replace(/\[(\w+)\]/, '<span class="lv-blue">[$1]</span>')
    .replace(/(\d+%|\d+\.\d+ MB\/s|score \d\.\d+|\d+ respostas)/g, '<span class="lv-green">$1</span>')
    .replace(/(0 fontes)/, '<span class="lv-red">$1</span>');
}

export interface SseConnection {
  close(): void;
}

/**
 * Subscribe to live events. Returns a connection handle; call `.close()` to
 * stop. In mock mode, drives a local clone of the download list forward.
 */
export function connectEvents(onEvent: SseHandler): SseConnection {
  if (USE_MOCKS) return mockStream(onEvent);

  const es = new EventSource('/api/events');
  const forward = (e: MessageEvent) => {
    try {
      onEvent(JSON.parse(e.data) as SseEvent);
    } catch {
      /* ignore malformed frames */
    }
  };
  // Named events plus the default message channel.
  for (const t of ['download.progress', 'download.done', 'sync.progress', 'log', 'health']) {
    es.addEventListener(t, forward as EventListener);
  }
  es.onmessage = forward;
  return { close: () => es.close() };
}

function mockStream(onEvent: SseHandler): SseConnection {
  // Local mutable clones so we don't disturb the shared mock fixtures.
  const dls: DownloadDTO[] = mockDownloads.map((d) => ({ ...d }));
  let logIdx = 5;

  const progressTimer = setInterval(() => {
    for (const d of dls) {
      if (d.state !== DownloadState.IN_PROGRESS) continue;
      d.progress = Math.min(1, d.progress + Math.random() * 0.02);
      d.speedBps = (0.7 + Math.random() * 1.8) * 1_000_000;
      d.bytesDone = Math.round((d.bytesTotal ?? 24_300_000) * d.progress);
      if (d.progress >= 1) {
        d.state = DownloadState.COMPLETED;
        d.speedBps = 0;
        onEvent({ type: 'download.done', data: { ...d } });
      } else {
        onEvent({ type: 'download.progress', data: { ...d } });
      }
    }
  }, 900);

  const logTimer = setInterval(() => {
    onEvent({
      type: 'log',
      data: {
        id: 'log_' + logIdx,
        level: LOG_LINES[logIdx % LOG_LINES.length].includes('0 fontes') ? 'error' : 'info',
        message: LOG_LINES[logIdx % LOG_LINES.length],
        at: new Date().toISOString()
      }
    });
    logIdx++;
  }, 1900);

  return {
    close() {
      clearInterval(progressTimer);
      clearInterval(logTimer);
    }
  };
}
