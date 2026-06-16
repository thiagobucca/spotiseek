<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { TrackStatus, type PlaylistDetailDTO } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import Topbar from '$lib/components/Topbar.svelte';
  import Cover from '$lib/components/Cover.svelte';
  import TrackRow from '$lib/components/TrackRow.svelte';

  import { onDestroy } from 'svelte';

  let detail = $state<PlaylistDetailDTO | null>(null);
  let syncing = $state(false);
  let downloadingAll = $state(false);

  const id = $derived($page.params.id);

  const pending = $derived.by(() => {
    const t = detail?.tracks ?? [];
    return t.filter(
      (x) =>
        x.status === TrackStatus.WANTED ||
        x.status === TrackStatus.FAILED ||
        x.status === TrackStatus.IGNORED
    ).length;
  });

  async function refresh() {
    if (id) detail = await api.playlist(id);
  }

  /** Baixa uma faixa sob demanda (atualização otimista + refresh). */
  async function downloadOne(trackId: string) {
    if (detail) {
      const t = detail.tracks.find((x) => x.id === trackId);
      if (t) t.status = TrackStatus.SEARCHING;
    }
    await api.downloadTrack(trackId);
    setTimeout(refresh, 1500);
  }

  async function downloadAll() {
    if (!detail) return;
    downloadingAll = true;
    try {
      await api.downloadAllPlaylist(detail.id);
      await refresh();
    } finally {
      downloadingAll = false;
    }
  }

  // Refresh leve enquanto houver faixas em progresso (busca/download).
  const poll = setInterval(() => {
    const t = detail?.tracks ?? [];
    const active = t.some(
      (x) =>
        x.status === TrackStatus.SEARCHING ||
        x.status === TrackStatus.MATCHED ||
        x.status === TrackStatus.DOWNLOADING
    );
    if (active) refresh();
  }, 4000);
  onDestroy(() => clearInterval(poll));

  const counts = $derived.by(() => {
    const t = detail?.tracks ?? [];
    const inLib = t.filter((x) => x.status === TrackStatus.IMPORTED || x.status === TrackStatus.DOWNLOADED).length;
    const active = t.filter(
      (x) =>
        x.status === TrackStatus.DOWNLOADING ||
        x.status === TrackStatus.SEARCHING ||
        x.status === TrackStatus.MATCHED
    ).length;
    const notFound = t.filter((x) => x.status === TrackStatus.FAILED).length;
    return { inLib, active, notFound };
  });

  async function sync() {
    if (!detail) return;
    syncing = true;
    try {
      await api.syncPlaylist(detail.id);
    } finally {
      syncing = false;
    }
  }

  onMount(() => {
    if (id) api.playlist(id).then((d) => (detail = d));
  });
</script>

<Topbar title={detail?.name ?? 'Playlist'} subtitle="playlist · {detail?.trackCount ?? 0} faixas" showSync={false} />

<section class="screen">
  {#if detail}
    <div class="dhead reveal">
      <Cover coverSeed={detail.coverSeed} coverUrl={detail.coverUrl} fontSize={42} style="width:150px;height:150px;border-radius:18px" />
      <div>
        <div class="kicker">Playlist · Spotify</div>
        <div class="h">{detail.name}</div>
        <div class="sub num">
          {detail.trackCount} faixas · {counts.inLib} na biblioteca · {counts.active} em andamento · {pending} a baixar{#if counts.notFound > 0} · {counts.notFound} não encontradas{/if}
        </div>
        <div class="actions">
          {#if pending > 0}
            <button class="btn btn-blue" onclick={downloadAll} disabled={downloadingAll}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v11m0 0l-3.5-3.5M12 14l3.5-3.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 20h14" stroke-linecap="round" />
              </svg>
              {downloadingAll ? 'Enfileirando…' : `Baixar todas (${pending})`}
            </button>
          {/if}
          <button class="btn btn-soft" onclick={sync} disabled={syncing}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3.5 12a8.5 8.5 0 0114.5-6M20.5 12a8.5 8.5 0 01-14.5 6M17.5 3v3.2h-3.2M6.5 21v-3.2h3.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {syncing ? 'Atualizando…' : 'Atualizar do Spotify'}
          </button>
          <button class="btn btn-soft" onclick={() => goto('/playlists')}>← Voltar</button>
        </div>
      </div>
    </div>

    <div class="tlist reveal" style="animation-delay:.1s">
      <div class="trow head">
        <span>#</span>
        <span></span>
        <span>Faixa</span>
        <span>Status</span>
        <span>Qualidade</span>
        <span style="text-align:right">Score · Duração</span>
      </div>
      {#each detail.tracks as t, i (t.id)}
        <TrackRow track={t} index={i} ondownload={downloadOne} />
      {/each}
    </div>
  {/if}
</section>
