<script lang="ts">
  import { TrackStatus, type TrackDTO } from '@spotiseek/shared';
  import { playTrack } from '$lib/stores/player';
  import Cover from './Cover.svelte';
  import QualityBadge from './QualityBadge.svelte';

  interface Props {
    track: TrackDTO & { durLabel?: string; progress?: number };
    index: number;
    /** Se fornecido, faixas sem download mostram o botão de ação (modo sob demanda). */
    ondownload?: (id: string) => void;
  }
  let { track: t, index, ondownload }: Props = $props();

  let requesting = $state(false);

  // Estados em que o usuário pode acionar (baixar / tentar de novo).
  const idle = $derived(
    t.status === TrackStatus.WANTED || t.status === TrackStatus.IGNORED
  );
  const notFound = $derived(t.status === TrackStatus.FAILED);
  const inLib = $derived(t.status === TrackStatus.IMPORTED);
  const canAct = $derived(!!ondownload && (idle || notFound));

  const durLabel = $derived(t.durLabel ?? formatDur(t.durationSec));

  function formatDur(sec?: number): string {
    if (sec == null) return '';
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function request() {
    requesting = true;
    ondownload?.(t.id);
  }

  // Para faixas em andamento, o rótulo do "pill" de status.
  const inProgress: Record<string, { cls: string; label: string }> = {
    [TrackStatus.SEARCHING]: { cls: 'searching', label: 'Buscando…' },
    [TrackStatus.MATCHED]: { cls: 'active', label: 'Na fila' },
    [TrackStatus.DOWNLOADING]: { cls: 'active', label: 'Baixando' },
    [TrackStatus.DOWNLOADED]: { cls: 'active', label: 'Processando…' },
    [TrackStatus.IMPORTED]: { cls: 'done', label: 'Na biblioteca' }
  };
  const pill = $derived(inProgress[t.status]);
</script>

<div class="trow">
  <span class="idx num">{index + 1}</span>
  <Cover coverSeed={t.coverSeed} coverUrl={t.coverUrl} fontSize={14} style="width:40px;height:40px;border-radius:8px" />
  <div class="info">
    <div class="nm">{t.title}</div>
    <div class="ar">{t.artist}</div>
  </div>

  <div class="status-cell">
    {#if requesting && idle}
      <span class="pill searching"><span class="spin"></span>Enfileirando…</span>
    {:else if canAct && idle}
      <button class="act act--primary" onclick={request}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 19h14" stroke-linecap="round" />
        </svg>
        Baixar
      </button>
    {:else if canAct && notFound}
      <span class="pill failed" title="Nenhuma fonte encontrada no Soulseek">Não encontrada</span>
      <button class="act act--retry" onclick={request} disabled={requesting} title="Tentar de novo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3.5 12a8.5 8.5 0 0114.5-6M20.5 12a8.5 8.5 0 01-14.5 6M17.5 3v3.2h-3.2M6.5 21v-3.2h3.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {:else if inLib}
      <button class="act act--play" onclick={() => playTrack(t)}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 008 5.5z" /></svg>
        Tocar
      </button>
    {:else if pill}
      <span class="pill {pill.cls}">
        {#if pill.cls === 'searching'}<span class="spin"></span>{:else if pill.cls === 'done'}<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>{:else}<span class="dot"></span>{/if}
        {pill.label}{#if t.status === TrackStatus.DOWNLOADING && t.progress != null} · {Math.round(t.progress * 100)}%{/if}
      </span>
    {/if}
  </div>

  <QualityBadge quality={t.quality} />
  <span class="dur num">
    {#if t.score != null}<span class="score">score <b>{t.score.toFixed(2)}</b></span>{/if}
    &nbsp;{durLabel}
  </span>
</div>

<style>
  .info {
    min-width: 0;
  }

  /* célula de status: alinha tudo verticalmente ao centro */
  .status-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* ---- botão de ação (estilo Apple: pill, altura fixa, conteúdo centrado) ---- */
  .act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 30px;
    padding: 0 14px;
    border-radius: 8px;
    border: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 590;
    line-height: 1;
    letter-spacing: -0.01em;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      transform 0.08s ease,
      box-shadow 0.15s ease;
  }
  .act svg {
    width: 15px;
    height: 15px;
    flex: none;
    display: block;
  }
  .act:active {
    transform: scale(0.96);
  }
  .act:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .act--primary {
    background: var(--blue);
    color: #fff;
    box-shadow: 0 1px 2px rgba(0, 113, 227, 0.25);
  }
  .act--primary:hover {
    background: #0077ed;
    box-shadow: 0 2px 8px rgba(0, 113, 227, 0.3);
  }

  /* tocar: faixa já na biblioteca */
  .act--play {
    background: rgba(48, 179, 82, 0.12);
    color: #1d8a3c;
  }
  .act--play svg {
    width: 13px;
    height: 13px;
  }
  .act--play:hover {
    background: var(--green);
    color: #fff;
  }

  /* botão de retry: ícone-only, redondo, discreto */
  .act--retry {
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-3);
    flex: none;
  }
  .act--retry:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text);
  }

  /* ---- pills de status ---- */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }
  .pill .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: currentColor;
  }
  .pill .chk {
    width: 15px;
    height: 15px;
    flex: none;
  }
  .pill.active {
    color: var(--blue);
  }
  .pill.searching {
    color: var(--text-2);
  }
  .pill.done {
    color: var(--green);
  }
  .pill.failed {
    color: var(--text-3);
  }

  /* spinner */
  .spin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    opacity: 0.7;
    flex: none;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
