<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardStats, DownloadDTO, SseEvent } from '@spotiseek/shared';
  import { DownloadState } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import { connectEvents } from '$lib/api/sse';
  import { activityColor, relLabel } from '$lib/api/mock';
  import Topbar from '$lib/components/Topbar.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import DownloadRow from '$lib/components/DownloadRow.svelte';

  let stats = $state<DashboardStats | null>(null);
  let downloads = $state<DownloadDTO[]>([]);

  const totalGb = $derived(
    stats ? stats.storage.flacGb + stats.storage.mp3Gb + stats.storage.otherGb + stats.storage.freeGb : 466
  );
  const pct = (gb: number) => (totalGb ? (gb / totalGb) * 100 : 0);

  const statCards = $derived(
    stats
      ? [
          { icon: 'list', color: '#0071e3', value: stats.playlists.toLocaleString('pt-BR'), label: 'Playlists' },
          { icon: 'mic', color: '#f08400', value: stats.monitoredArtists, label: 'Artistas monitorados' },
          { icon: 'dl', color: '#30b352', value: stats.activeDownloads, label: 'Downloads ativos' },
          { icon: 'note', color: '#8a5cf6', value: stats.libraryTracks.toLocaleString('pt-BR'), label: 'Faixas na biblioteca' },
          { icon: 'disk', color: '#5b6470', value: stats.diskUsedGb, unit: 'GB', label: 'Espaço utilizado' },
          { icon: 'wave', color: '#e0457b', value: stats.losslessPercent, unit: '%', label: 'Qualidade lossless' }
        ]
      : []
  );

  const active = $derived(downloads.filter((d) => d.state === DownloadState.IN_PROGRESS).slice(0, 3));

  onMount(() => {
    api.dashboard().then((s) => (stats = s));
    api.downloads().then((d) => (downloads = d));

    const conn = connectEvents((ev: SseEvent) => {
      if (ev.type === 'download.progress' || ev.type === 'download.done') {
        downloads = downloads.map((d) => (d.id === ev.data.id ? ev.data : d));
      }
    });
    return () => conn.close();
  });
</script>

<Topbar title="Visão geral" subtitle="o estado da sua operação" />

<section class="screen">
  {#if stats}
    <div class="stat-grid">
      {#each statCards as c, i (c.label)}
        <StatCard icon={c.icon} color={c.color} value={c.value} unit={c.unit} label={c.label} delay={i * 45} />
      {/each}
    </div>

    <div class="two-col">
      <div class="panel reveal" style="animation-delay:.2s">
        <div class="panel-h">
          <h3>Transferências ativas</h3>
          <span class="cnt">{active.length} em andamento</span>
          <a class="link" href="/downloads">Ver todas</a>
        </div>
        <div class="panel-body">
          {#each active as d, i (d.id)}
            <DownloadRow download={d} variant="compact" delay={i * 55} />
          {/each}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel reveal" style="animation-delay:.28s">
          <div class="panel-h">
            <h3>Armazenamento</h3>
            <span class="cnt num">{stats.diskUsedGb} GB de {totalGb} GB</span>
          </div>
          <div class="storage">
            <div class="bar">
              <span style="width:{pct(stats.storage.flacGb)}%;background:#30b352"></span>
              <span style="width:{pct(stats.storage.mp3Gb)}%;background:#0071e3"></span>
              <span style="width:{pct(stats.storage.otherGb)}%;background:#8a5cf6"></span>
            </div>
            <div class="legend">
              <div class="l"><span class="sw" style="background:#30b352"></span>FLAC<b class="num">{stats.storage.flacGb} GB</b></div>
              <div class="l"><span class="sw" style="background:#0071e3"></span>MP3 320<b class="num">{stats.storage.mp3Gb} GB</b></div>
              <div class="l"><span class="sw" style="background:#8a5cf6"></span>Outros<b class="num">{stats.storage.otherGb} GB</b></div>
              <div class="l"><span class="sw" style="background:#e3e3e8"></span>Livre<b class="num">{stats.storage.freeGb} GB</b></div>
            </div>
          </div>
        </div>

        <div class="panel reveal" style="animation-delay:.34s">
          <div class="panel-h"><h3>Atividade recente</h3></div>
          <div class="feed">
            {#each stats.activity as a (a.id)}
              <div class="act">
                <span class="ad" style="background:{activityColor(a.level)}"></span>
                <div>
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  <div class="txt">{@html a.message}</div>
                  <div class="tm">{relLabel(a.at)}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>
