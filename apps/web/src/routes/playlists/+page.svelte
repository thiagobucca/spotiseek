<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { PlaylistStatus, type PlaylistDTO } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import { relLabel } from '$lib/api/mock';
  import Topbar from '$lib/components/Topbar.svelte';
  import Cover from '$lib/components/Cover.svelte';

  // Mock playlists carry a display-only `syncLabel`; tolerate its absence.
  type PL = PlaylistDTO & { syncLabel?: string };

  let playlists = $state<PL[]>([]);
  let url = $state('');
  let importing = $state(false);

  function syncText(p: PL): string {
    if (p.status === PlaylistStatus.SYNCING) return 'sincronizando';
    return p.syncLabel ?? (p.lastSyncedAt ? relLabel(p.lastSyncedAt) : '—');
  }

  async function doImport() {
    if (!url.trim()) return;
    importing = true;
    try {
      const created = await api.importPlaylist(url.trim());
      playlists = [created, ...playlists];
      url = '';
    } finally {
      importing = false;
    }
  }

  onMount(() => {
    api.playlists().then((p) => (playlists = p as PL[]));
  });
</script>

<Topbar title="Playlists" subtitle="sincronizadas do Spotify" />

<section class="screen">
  <div class="import reveal">
    <div class="ic">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div class="txt">
      <div class="h">Importar playlist</div>
      <div class="d">
        Cole uma URL pública do Spotify ou sincronize suas playlists privadas pela conta vinculada.
      </div>
    </div>
    <input
      class="input"
      style="width:300px"
      placeholder="https://open.spotify.com/playlist/…"
      bind:value={url}
      onkeydown={(e) => e.key === 'Enter' && doImport()}
    />
    <button class="btn btn-blue" onclick={doImport} disabled={importing}>
      {importing ? 'Importando…' : 'Importar'}
    </button>
  </div>

  <div class="sect-h">
    <h2>Suas playlists</h2>
    <span class="meta">{playlists.length} sincronizadas</span>
  </div>

  <div class="grid">
    {#each playlists as p, i (p.id)}
      <div
        class="tile reveal"
        style="animation-delay:{i * 45}ms"
        role="button"
        tabindex="0"
        onclick={() => goto(`/playlists/${p.id}`)}
        onkeydown={(e) => e.key === 'Enter' && goto(`/playlists/${p.id}`)}
      >
        <div style="position:relative">
          <Cover coverSeed={p.coverSeed} coverUrl={p.coverUrl} fontSize={30} style="width:100%;aspect-ratio:1;border-radius:14px" />
          <span class="pill">
            {#if p.status === PlaylistStatus.SYNCING}<span class="dot warn"></span>sync
            {:else}<span class="dot ok"></span>ok{/if}
          </span>
        </div>
        <div class="nm">{p.name}</div>
        <div class="info">
          <span class="num">{p.trackCount} faixas</span>
          <span class="sync">{syncText(p)}</span>
        </div>
        <div class="minibar"><i style="width:{p.doneRatio * 100}%"></i></div>
      </div>
    {/each}
  </div>
</section>
