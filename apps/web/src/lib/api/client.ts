/**
 * Typed API client. One method per backend endpoint, returning shared DTOs.
 *
 * Base URL is `/api`. A Bearer token (from the auth store / localStorage) is
 * attached automatically. When mocks are enabled (PUBLIC_USE_MOCKS, default
 * true) or a real fetch fails, the client transparently falls back to the
 * in-memory mock data so the UI works standalone.
 */
import { PUBLIC_USE_MOCKS } from '$env/static/public';
import type {
  AuthTokens,
  DashboardStats,
  DownloadDTO,
  HealthDTO,
  LibraryAlbumDTO,
  LibraryArtistDTO,
  MatchCandidateDTO,
  PlaylistDTO,
  PlaylistDetailDTO,
  ProviderDTO,
  SettingsDTO,
  SpotifyStatusDTO,
  TrackDTO,
  WishlistItemDTO,
  WishlistType
} from '@spotiseek/shared';
import { browser } from '$app/environment';
import { getToken, setToken } from '$lib/stores/auth';
import * as mock from './mock';

const BASE = '/api';

/** Mocks on by default unless explicitly disabled via PUBLIC_USE_MOCKS=false. */
export const USE_MOCKS = PUBLIC_USE_MOCKS !== 'false';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function http<T>(
  path: string,
  init: RequestInit & { fallback?: () => T | Promise<T> } = {}
): Promise<T> {
  const { fallback, ...req } = init;

  // Mock-first when enabled.
  if (USE_MOCKS && fallback) return await fallback();

  try {
    const headers = new Headers(req.headers);
    if (!headers.has('Content-Type') && req.body) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${BASE}${path}`, { ...req, headers });
    // Sessão expirada/ausente: limpa token e manda pro login (fora do modo mock).
    if (res.status === 401 && !USE_MOCKS && browser) {
      setToken(null);
      if (location.pathname !== '/login') location.href = '/login';
    }
    if (!res.ok) throw new ApiError(res.statusText, res.status);
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? await res.json() : (undefined as T)) as T;
  } catch (err) {
    // Network / backend not up yet → graceful mock fallback.
    if (fallback) return await fallback();
    throw err;
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body)
});

export const api = {
  // ── auth ──
  /** Em modo mock retorna um token fake; com backend real, falha de credencial propaga (sem fallback). */
  login: (email: string, password: string): Promise<AuthTokens> =>
    USE_MOCKS
      ? Promise.resolve(mock.mockAuthTokens)
      : http<AuthTokens>('/auth/login', json({ email, password })),
  me: () => http<typeof mock.mockMe>('/auth/me', { fallback: () => mock.mockMe }),
  logout: () => setToken(null),

  // ── spotify ──
  spotifyStatus: () =>
    http<SpotifyStatusDTO>('/spotify/status', { fallback: () => mock.mockSpotifyStatus }),
  /** URL de consent (JSON, autenticada) — o frontend redireciona o browser pra ela. */
  spotifyAuthorizeUrl: () =>
    http<{ url: string }>('/spotify/authorize-url', { fallback: () => ({ url: '#' }) }),
  disconnectSpotify: () =>
    http<void>('/spotify/connection', { method: 'DELETE', fallback: () => undefined }),

  /** URL de streaming de áudio (com token na query, p/ o elemento <audio>). */
  streamUrl: (trackId: string) =>
    `${BASE}/library/tracks/${trackId}/stream?token=${encodeURIComponent(getToken() ?? '')}`,

  // ── dashboard ──
  dashboard: () => http<DashboardStats>('/dashboard', { fallback: () => mock.mockDashboard }),

  // ── playlists ──
  playlists: () => http<PlaylistDTO[]>('/playlists', { fallback: () => mock.mockPlaylists }),
  importPlaylist: (url: string) =>
    http<PlaylistDTO>('/playlists/import', {
      ...json({ url }),
      fallback: () => mock.mockPlaylists[0]
    }),
  playlist: (playlistId: string) =>
    http<PlaylistDetailDTO>(`/playlists/${playlistId}`, {
      fallback: () => mock.mockPlaylistDetail(playlistId)
    }),
  syncPlaylist: (playlistId: string) =>
    http<void>(`/playlists/${playlistId}/sync`, { method: 'POST', fallback: () => undefined }),
  /** Baixa uma faixa sob demanda. */
  downloadTrack: (trackId: string) =>
    http<{ jobId: string }>(`/tracks/${trackId}/download`, { method: 'POST', fallback: () => ({ jobId: 'mock' }) }),
  /** Baixa todas as faixas faltantes de uma playlist. */
  downloadAllPlaylist: (playlistId: string) =>
    http<{ queued: number }>(`/playlists/${playlistId}/download-all`, { method: 'POST', fallback: () => ({ queued: 0 }) }),
  deletePlaylist: (playlistId: string) =>
    http<void>(`/playlists/${playlistId}`, { method: 'DELETE', fallback: () => undefined }),
  updatePlaylist: (playlistId: string, patch: Partial<PlaylistDTO>) =>
    http<PlaylistDTO>(`/playlists/${playlistId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      fallback: () => ({ ...mock.mockPlaylists[0], ...patch })
    }),

  // ── wishlist ──
  wishlist: () => http<WishlistItemDTO[]>('/wishlist', { fallback: () => mock.mockWishlist }),
  addWishlist: (type: WishlistType, query: string) =>
    http<WishlistItemDTO>('/wishlist', {
      ...json({ type, query }),
      fallback: () => ({ ...mock.mockWishlist[0], type, query })
    }),
  removeWishlist: (itemId: string) =>
    http<void>(`/wishlist/${itemId}`, { method: 'DELETE', fallback: () => undefined }),

  // ── downloads ──
  downloads: () => http<DownloadDTO[]>('/downloads', { fallback: () => mock.mockDownloads }),
  retryDownload: (downloadId: string) =>
    http<void>(`/downloads/${downloadId}/retry`, { method: 'POST', fallback: () => undefined }),
  cancelDownload: (downloadId: string) =>
    http<void>(`/downloads/${downloadId}/cancel`, { method: 'POST', fallback: () => undefined }),
  candidates: (downloadId: string) =>
    http<MatchCandidateDTO[]>(`/downloads/${downloadId}/candidates`, {
      fallback: () => mock.mockCandidates
    }),

  // ── library ──
  artists: () => http<LibraryArtistDTO[]>('/library/artists', { fallback: () => mock.mockArtists }),
  albums: () => http<LibraryAlbumDTO[]>('/library/albums', { fallback: () => mock.mockAlbums }),
  tracks: (q = '') =>
    http<TrackDTO[]>(`/library/tracks?q=${encodeURIComponent(q)}`, {
      fallback: () =>
        q
          ? mock.mockTracks.filter((t) =>
              `${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase())
            )
          : mock.mockTracks
    }),

  // ── providers ──
  providers: () => http<ProviderDTO[]>('/providers', { fallback: () => mock.mockProviders }),
  updateProvider: (key: string, patch: Partial<ProviderDTO>) =>
    http<ProviderDTO>(`/providers/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      fallback: () => ({ ...mock.mockProviders[0], key, ...patch })
    }),

  // ── settings ──
  settings: () => http<SettingsDTO>('/settings', { fallback: () => mock.mockSettings }),
  updateSettings: (patch: Partial<SettingsDTO>) =>
    http<SettingsDTO>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
      fallback: () => ({ ...mock.mockSettings, ...patch })
    }),

  // ── misc ──
  health: () => http<HealthDTO>('/health', { fallback: () => mock.mockHealth })
};

export type Api = typeof api;
