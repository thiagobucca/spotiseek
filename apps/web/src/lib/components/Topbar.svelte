<script lang="ts">
  import Icon from './Icon.svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';

  interface Props {
    title: string;
    subtitle?: string;
    /** Whether to show the "Sincronizar tudo" button (default true). */
    showSync?: boolean;
    /** Handler customizado; se ausente, sincroniza todas as playlists importadas. */
    onsync?: () => void;
  }
  let { title, subtitle = '', showSync = true, onsync }: Props = $props();

  let query = $state('');
  let syncing = $state(false);

  function submitSearch(e: Event) {
    e.preventDefault();
    if (query.trim()) goto(`/library?q=${encodeURIComponent(query.trim())}`);
  }

  /** Sincroniza todas as playlists já importadas. */
  async function syncAll() {
    if (onsync) return onsync();
    syncing = true;
    try {
      const pls = await api.playlists();
      if (!pls.length) {
        alert('Nenhuma playlist importada ainda.\n\nVá em Playlists e cole a URL de uma playlist do Spotify para importar.');
        goto('/playlists');
        return;
      }
      await Promise.all(pls.map((p) => api.syncPlaylist(p.id)));
      alert(`Sincronização disparada para ${pls.length} playlist(s).`);
    } catch (e) {
      alert('Falha ao sincronizar. Verifique se o Spotify está configurado.');
    } finally {
      syncing = false;
    }
  }
</script>

<div class="topbar">
  <div class="title">
    {title}
    {#if subtitle}<small>{subtitle}</small>{/if}
  </div>

  <form class="search" onsubmit={submitSearch}>
    <Icon name="search" width={2} />
    <input placeholder="Buscar" bind:value={query} />
  </form>

  {#if showSync}
    <button class="btn btn-blue" onclick={syncAll} disabled={syncing}>
      <Icon name="sync" width={2} />
      {syncing ? 'Sincronizando…' : 'Sincronizar tudo'}
    </button>
  {/if}
</div>
