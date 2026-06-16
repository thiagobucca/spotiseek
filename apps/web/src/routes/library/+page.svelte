<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type { LibraryAlbumDTO, LibraryArtistDTO } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import { mockDashboard } from '$lib/api/mock';
  import Topbar from '$lib/components/Topbar.svelte';
  import Cover from '$lib/components/Cover.svelte';

  let albums = $state<LibraryAlbumDTO[]>([]);
  let artists = $state<LibraryArtistDTO[]>([]);

  const q = $derived($page.url.searchParams.get('q') ?? '');
  const stats = mockDashboard;

  const filteredAlbums = $derived(
    q
      ? albums.filter((a) => `${a.title} ${a.artist}`.toLowerCase().includes(q.toLowerCase()))
      : albums
  );
  const filteredArtists = $derived(
    q ? artists.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())) : artists
  );

  onMount(() => {
    api.albums().then((a) => (albums = a));
    api.artists().then((a) => (artists = a));
  });
</script>

<Topbar title="Biblioteca" subtitle="sua coleção local" showSync={false} />

<section class="screen">
  <div class="sect-h">
    <h2>Álbuns</h2>
    <span class="meta num">
      {stats.libraryTracks.toLocaleString('pt-BR')} faixas · {stats.diskUsedGb} GB · {stats.losslessPercent}% lossless
    </span>
  </div>

  <div class="grid">
    {#each filteredAlbums as a, i (a.id)}
      <div class="tile reveal" style="animation-delay:{i * 30}ms">
        <Cover coverSeed={a.coverSeed} coverUrl={a.coverUrl} fontSize={28} style="width:100%;aspect-ratio:1;border-radius:14px" />
        <div class="nm">{a.title}</div>
        <div class="info"><span>{a.artist}</span></div>
      </div>
    {/each}
  </div>

  <div class="sect-h"><h2>Artistas</h2></div>
  <div class="lib-grid">
    {#each filteredArtists as a, i (a.id)}
      <div class="artist reveal" style="animation-delay:{i * 28}ms">
        <Cover coverSeed={a.coverSeed} coverUrl={a.coverUrl} fontSize={26} style="width:100%;aspect-ratio:1;border-radius:50%" />
        <div class="nm">{a.name}</div>
        <div class="ct num">{a.albumCount} álbuns</div>
      </div>
    {/each}
  </div>
</section>
