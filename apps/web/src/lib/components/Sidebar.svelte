<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { health } from '$lib/stores/health';
  import { api, USE_MOCKS } from '$lib/api/client';

  function logout() {
    api.logout();
    goto('/login');
  }

  interface NavItem {
    href: string;
    label: string;
    icon: string;
    badge?: string | number;
  }

  interface Props {
    playlistCount?: number;
    downloadCount?: number;
    reviewCount?: number;
  }
  let { playlistCount = 0, downloadCount = 0, reviewCount = 0 }: Props = $props();

  const panel = $derived<NavItem[]>([
    { href: '/', label: 'Visão geral', icon: 'dashboard' },
    { href: '/playlists', label: 'Playlists', icon: 'playlists', badge: playlistCount },
    { href: '/downloads', label: 'Downloads', icon: 'downloads', badge: downloadCount },
    { href: '/library', label: 'Biblioteca', icon: 'library' },
    { href: '/wishlist', label: 'Wishlist', icon: 'wishlist' }
  ]);

  const path = $derived($page.url.pathname);
  function isActive(href: string): boolean {
    return href === '/' ? path === '/' : path.startsWith(href);
  }
</script>

<aside class="rail">
  <a href="/" class="brand">
    <div class="mark">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3v13.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="8" cy="17" r="3.4" fill="#fff" />
        <path d="M12 5.5c4 0 6 1.4 7 2.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </div>
    <h1>Spotiseek</h1>
  </a>

  <div class="sect">Painel</div>
  {#each panel as item (item.href)}
    <a href={item.href} class="nav {isActive(item.href) ? 'active' : ''}">
      <Icon name={item.icon} />
      {item.label}
      {#if item.badge}<span class="badge">{item.badge}</span>{/if}
    </a>
  {/each}

  <div class="sect">Sistema</div>
  <a href="/settings" class="nav {isActive('/settings') ? 'active' : ''}">
    <Icon name="settings" />
    Configurações
  </a>

  <div class="rail-foot">
    <div class="st">
      <span class="dot {$health.slskd ? 'ok' : 'off'}"></span>Soulseek
      <span class="v">{$health.slskd ? 'conectado' : 'offline'}</span>
    </div>
    <div class="st">
      <span class="dot {$health.spotify ? 'ok' : 'off'}"></span>Spotify
      <span class="v">{$health.spotify ? 'vinculado' : 'desconectado'}</span>
    </div>
    {#if reviewCount > 0}
      <a class="st st-link" href="/downloads"><span class="dot warn"></span>Revisão<span class="v">{reviewCount} {reviewCount === 1 ? 'falha' : 'falhas'}</span></a>
    {/if}
    {#if !USE_MOCKS}
      <button class="logout" onclick={logout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M15 4H6a2 2 0 00-2 2v12a2 2 0 002 2h9" stroke-linecap="round" />
          <path d="M19 12H9m10 0l-3-3m3 3l-3 3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Sair
      </button>
    {/if}
  </div>
</aside>

<style>
  .rail {
    background: rgba(250, 250, 252, 0.7);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-right: 1px solid var(--hair);
    display: flex;
    flex-direction: column;
    padding: 18px 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 10px 18px;
    text-decoration: none;
    color: inherit;
  }
  .brand .mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    flex: none;
    background: linear-gradient(135deg, #0a84ff, #0058c9);
    display: grid;
    place-items: center;
    box-shadow: 0 4px 10px -2px rgba(10, 132, 255, 0.5);
  }
  .brand .mark svg {
    width: 17px;
    height: 17px;
    color: #fff;
  }
  .brand h1 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .sect {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
    letter-spacing: 0.02em;
    padding: 16px 12px 6px;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    color: var(--text-2);
    cursor: pointer;
    font-weight: 500;
    font-size: 13.5px;
    transition: 0.15s;
    margin: 1px 0;
    text-decoration: none;
  }
  .nav :global(svg) {
    width: 18px;
    height: 18px;
    flex: none;
  }
  .nav:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--text);
  }
  .nav.active {
    background: var(--blue-tint);
    color: var(--blue);
  }
  .nav .badge {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
  }
  .nav.active .badge {
    color: var(--blue);
  }
  .rail-foot {
    margin-top: auto;
    padding: 10px;
  }
  .rail-foot .st {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
    padding: 5px 4px;
  }
  .rail-foot .st .v {
    margin-left: auto;
    color: var(--text-3);
    font-size: 11.5px;
  }
  .rail-foot .st-link {
    text-decoration: none;
    border-radius: 6px;
    transition: background 0.15s ease;
  }
  .rail-foot .st-link:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  .logout {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    margin-top: 8px;
    padding: 8px 12px;
    border: none;
    background: none;
    border-radius: var(--r-sm);
    color: var(--text-2);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: 0.15s;
  }
  .logout svg {
    width: 17px;
    height: 17px;
  }
  .logout:hover {
    background: rgba(255, 59, 48, 0.08);
    color: var(--red);
  }
</style>
