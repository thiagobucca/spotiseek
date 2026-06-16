<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Player from '$lib/components/Player.svelte';
  import { api, USE_MOCKS } from '$lib/api/client';
  import { health } from '$lib/stores/health';
  import { token } from '$lib/stores/auth';
  import { currentTrack } from '$lib/stores/player';
  import { DownloadState } from '@spotiseek/shared';
  import { onMount } from 'svelte';

  let { children } = $props();

  let playlistCount = $state(0);
  let downloadCount = $state(0);
  let reviewCount = $state(0);

  const isLogin = $derived($page.url.pathname === '/login');
  const authed = $derived(USE_MOCKS || !!$token);

  // Guard: sem sessão (e fora do modo mock) → tela de login.
  $effect(() => {
    if (!authed && !isLogin) goto('/login');
  });

  function loadShellData() {
    api.health().then((h) => health.set(h)).catch(() => {});
    api.playlists().then((p) => (playlistCount = p.length)).catch(() => {});
    api
      .downloads()
      .then((d) => {
        downloadCount = d.filter((x) => x.state === DownloadState.IN_PROGRESS).length;
        reviewCount = d.filter((x) => x.state === DownloadState.FAILED).length;
      })
      .catch(() => {});
  }

  onMount(() => {
    if (authed && !isLogin) loadShellData();
  });
</script>

{#if isLogin}
  {@render children()}
{:else if authed}
  <div class="app">
    <Sidebar {playlistCount} {downloadCount} {reviewCount} />
    <main class="main" style:padding-bottom={$currentTrack ? '92px' : ''}>
      {@render children()}
    </main>
  </div>
  <Player />
{/if}
