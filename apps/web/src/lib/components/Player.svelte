<script lang="ts">
  import { currentTrack } from '$lib/stores/player';
  import { api } from '$lib/api/client';
  import Cover from './Cover.svelte';

  let paused = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);

  const track = $derived($currentTrack);
  const src = $derived(track ? api.streamUrl(track.id) : '');
  const progress = $derived(duration ? (currentTime / duration) * 100 : 0);

  // Autoplay ao trocar de faixa.
  let lastId = '';
  $effect(() => {
    if (track && track.id !== lastId) {
      lastId = track.id;
      paused = false;
    }
  });

  function seek(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    if (duration) currentTime = (v / 100) * duration;
  }
  function fmt(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }
  function close() {
    paused = true;
    currentTrack.set(null);
  }
</script>

{#if track}
  <div class="player">
    <!-- svelte-ignore a11y_media_has_caption -->
    <audio {src} bind:paused bind:currentTime bind:duration bind:volume autoplay></audio>

    <div class="pl-track">
      <Cover coverSeed={track.coverSeed} coverUrl={track.coverUrl} fontSize={12} style="width:46px;height:46px;border-radius:8px" />
      <div class="pl-meta">
        <div class="pl-t">{track.title}</div>
        <div class="pl-a">{track.artist}</div>
      </div>
    </div>

    <div class="pl-center">
      <button class="pl-play" onclick={() => (paused = !paused)} aria-label={paused ? 'Tocar' : 'Pausar'}>
        {#if paused}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 008 5.5z" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.3" /><rect x="13.5" y="5" width="4" height="14" rx="1.3" /></svg>
        {/if}
      </button>
      <div class="pl-seek">
        <span class="pl-time num">{fmt(currentTime)}</span>
        <input class="range" type="range" min="0" max="100" value={progress} oninput={seek} aria-label="Posição" />
        <span class="pl-time num">{fmt(duration)}</span>
      </div>
    </div>

    <div class="pl-right">
      <svg class="pl-vol-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M4 9v6h4l5 4V5L8 9H4z" stroke-linejoin="round" />
        <path d="M16 8.5a4 4 0 010 7" stroke-linecap="round" />
      </svg>
      <input class="range vol" type="range" min="0" max="1" step="0.01" bind:value={volume} aria-label="Volume" />
      <button class="pl-close" onclick={close} aria-label="Fechar player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .player {
    position: fixed;
    left: 240px;
    right: 0;
    bottom: 0;
    z-index: 50;
    height: 76px;
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(320px, 2fr) minmax(140px, 1fr);
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    background: rgba(250, 250, 252, 0.82);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 1px solid var(--hair);
    animation: slideup 0.3s cubic-bezier(0.22, 0.7, 0.25, 1);
  }
  @keyframes slideup {
    from {
      transform: translateY(100%);
    }
  }

  .pl-track {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .pl-meta {
    min-width: 0;
  }
  .pl-t {
    font-weight: 600;
    font-size: 13.5px;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pl-a {
    color: var(--text-2);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pl-center {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .pl-play {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 50%;
    border: none;
    background: var(--text);
    color: var(--surface);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 0.1s ease;
  }
  .pl-play:hover {
    transform: scale(1.06);
  }
  .pl-play:active {
    transform: scale(0.94);
  }
  .pl-play svg {
    width: 18px;
    height: 18px;
  }
  .pl-seek {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }
  .pl-time {
    font-size: 11px;
    color: var(--text-3);
    width: 34px;
    flex: none;
  }
  .pl-time:last-child {
    text-align: right;
  }

  .pl-right {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }
  .pl-vol-ic {
    width: 18px;
    height: 18px;
    color: var(--text-2);
    flex: none;
  }
  .vol {
    width: 80px;
  }
  .pl-close {
    width: 30px;
    height: 30px;
    border: none;
    background: none;
    color: var(--text-3);
    border-radius: 50%;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .pl-close:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text);
  }
  .pl-close svg {
    width: 16px;
    height: 16px;
  }

  /* slider estilo Apple */
  .range {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.12);
    cursor: pointer;
    outline: none;
  }
  .range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.3),
      0 0 0 0.5px rgba(0, 0, 0, 0.1);
    cursor: pointer;
  }
  .range::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border: none;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 720px) {
    .player {
      left: 0;
      grid-template-columns: 1fr auto;
    }
    .pl-right {
      display: none;
    }
  }
</style>
