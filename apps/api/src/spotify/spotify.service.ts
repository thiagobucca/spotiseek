import { Injectable, Logger } from '@nestjs/common';
import { SpotifyStatusDTO } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../common/crypto';

interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  account?: string;
  scopes?: string;
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  durationMs?: number;
  isrc?: string;
  popularity?: number;
  spotifyId?: string;
  trackNumber?: number;
  coverUrl?: string;
}

const SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read';

/**
 * Cliente Spotify. Playlists públicas usam Client Credentials (sem usuário, sem
 * limite de Development Mode). Playlists privadas usam OAuth Authorization Code.
 * Ver docs/09 §2.
 */
@Injectable()
export class SpotifyService {
  private readonly log = new Logger('Spotify');
  private ccToken?: { token: string; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  private get clientId() {
    return process.env.SPOTIFY_CLIENT_ID || '';
  }
  private get clientSecret() {
    return process.env.SPOTIFY_CLIENT_SECRET || '';
  }
  private get redirectUri() {
    return process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8080/api/spotify/callback';
  }

  // ── OAuth ──
  authorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      state,
    });
    return `https://accounts.spotify.com/authorize?${p}`;
  }

  async handleCallback(code: string, userId: string) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
    const tok = await this.tokenRequest(body);
    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then((r) => (r.ok ? r.json() : null));
    const auth: SpotifyAuth = {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
      account: me?.display_name || me?.id,
      scopes: SCOPES,
    };
    await this.prisma.user.update({ where: { id: userId }, data: { spotifyAuth: encrypt(JSON.stringify(auth)) } });
  }

  async status(userId: string): Promise<SpotifyStatusDTO> {
    const auth = await this.getUserAuth(userId);
    if (!auth) return { connected: false };
    return { connected: true, account: auth.account, expiresAt: new Date(auth.expiresAt).toISOString() };
  }

  async disconnect(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { spotifyAuth: null } });
  }

  // ── tokens ──
  private async tokenRequest(body: URLSearchParams) {
    body.set('client_id', this.clientId);
    body.set('client_secret', this.clientSecret);
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Spotify token ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async clientCredentialsToken(): Promise<string> {
    if (this.ccToken && this.ccToken.expiresAt > Date.now() + 30_000) return this.ccToken.token;
    const tok = await this.tokenRequest(new URLSearchParams({ grant_type: 'client_credentials' }));
    this.ccToken = { token: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 };
    return tok.access_token;
  }

  private async getUserAuth(userId: string): Promise<SpotifyAuth | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.spotifyAuth) return null;
    const dec = decrypt(u.spotifyAuth);
    if (!dec) return null;
    let auth = JSON.parse(dec) as SpotifyAuth;
    if (auth.expiresAt < Date.now() + 60_000) {
      const tok = await this.tokenRequest(
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }),
      );
      auth = { ...auth, accessToken: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 };
      if (tok.refresh_token) auth.refreshToken = tok.refresh_token;
      await this.prisma.user.update({ where: { id: userId }, data: { spotifyAuth: encrypt(JSON.stringify(auth)) } });
    }
    return auth;
  }

  /** Token p/ uma playlist: usa OAuth do usuário se houver, senão client-credentials. */
  private async tokenFor(userId?: string): Promise<string> {
    if (userId) {
      const auth = await this.getUserAuth(userId);
      if (auth) return auth.accessToken;
    }
    return this.clientCredentialsToken();
  }

  static parsePlaylistId(input: string): string {
    const m = /playlist[/:]([a-zA-Z0-9]+)/.exec(input);
    return m ? m[1] : input.trim();
  }

  async getPlaylistMeta(playlistId: string, userId?: string) {
    const token = await this.tokenFor(userId);
    const r = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,public,snapshot_id,images`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error(`Spotify playlist ${r.status}`);
    const j = await r.json();
    return { name: j.name as string, isPublic: !!j.public, snapshotId: j.snapshot_id as string, coverUrl: j.images?.[0]?.url as string | undefined };
  }

  async *getPlaylistTracks(playlistId: string, userId?: string): AsyncGenerator<SpotifyTrack> {
    const token = await this.tokenFor(userId);
    let url: string | null =
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,duration_ms,popularity,id,track_number,external_ids(isrc),artists(name),album(name,release_date,images)))`;
    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Spotify tracks ${r.status}`);
      const j = await r.json();
      for (const it of j.items ?? []) {
        const t = it.track;
        if (!t) continue;
        yield {
          title: t.name,
          artist: (t.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown',
          album: t.album?.name,
          year: t.album?.release_date ? Number(String(t.album.release_date).slice(0, 4)) : undefined,
          durationMs: t.duration_ms,
          isrc: t.external_ids?.isrc,
          popularity: t.popularity,
          spotifyId: t.id,
          trackNumber: t.track_number,
          coverUrl: t.album?.images?.[0]?.url,
        };
      }
      url = j.next;
    }
  }

  // ───────────────────────── Wishlist: busca/resolução ─────────────────────────
  private mapFullTrack(t: any): SpotifyTrack {
    return {
      title: t.name,
      artist: (t.artists ?? []).map((a: any) => a.name).join(', ') || 'Unknown',
      album: t.album?.name,
      year: t.album?.release_date ? Number(String(t.album.release_date).slice(0, 4)) : undefined,
      durationMs: t.duration_ms,
      isrc: t.external_ids?.isrc,
      popularity: t.popularity,
      spotifyId: t.id,
      trackNumber: t.track_number,
      coverUrl: t.album?.images?.[0]?.url,
    };
  }

  private async get(path: string): Promise<any> {
    const token = await this.tokenFor();
    const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Spotify ${r.status} em ${path}: ${await r.text().catch(() => '')}`);
    return r.json();
  }

  /** Acha a melhor faixa para uma query (ex.: "Metallica One"). */
  async searchTrack(query: string): Promise<SpotifyTrack | null> {
    const j = await this.get(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
    const t = j.tracks?.items?.[0];
    return t ? this.mapFullTrack(t) : null;
  }

  /** Acha um álbum e retorna suas faixas. */
  async resolveAlbum(query: string): Promise<{ name: string; tracks: SpotifyTrack[] } | null> {
    const j = await this.get(`/search?type=album&limit=1&q=${encodeURIComponent(query)}`);
    const album = j.albums?.items?.[0];
    if (!album) return null;
    return this.getAlbumTracks(album.id);
  }

  async getAlbumTracks(albumId: string): Promise<{ name: string; tracks: SpotifyTrack[] }> {
    const a = await this.get(`/albums/${albumId}`);
    const cover = a.images?.[0]?.url;
    const year = a.release_date ? Number(String(a.release_date).slice(0, 4)) : undefined;
    const albumArtist = (a.artists ?? []).map((x: any) => x.name).join(', ');
    const tracks: SpotifyTrack[] = (a.tracks?.items ?? []).map((t: any) => ({
      title: t.name,
      artist: (t.artists ?? []).map((x: any) => x.name).join(', ') || albumArtist || 'Unknown',
      album: a.name,
      year,
      durationMs: t.duration_ms,
      spotifyId: t.id,
      trackNumber: t.track_number,
      coverUrl: cover,
    }));
    return { name: `${albumArtist} — ${a.name}`, tracks };
  }

  /** Acha um artista e retorna os ids dos álbuns de estúdio (deduplicados, limitados). */
  async resolveArtist(query: string): Promise<{ id: string; name: string; albumIds: string[] } | null> {
    const j = await this.get(`/search?type=artist&limit=1&q=${encodeURIComponent(query)}`);
    const artist = j.artists?.items?.[0];
    if (!artist) return null;
    const albumsJson = await this.get(`/artists/${artist.id}/albums?include_groups=album&limit=50&market=US`);
    const seen = new Set<string>();
    const albumIds: string[] = [];
    for (const al of albumsJson.items ?? []) {
      const key = (al.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      albumIds.push(al.id);
      if (albumIds.length >= 25) break; // limita p/ não explodir a discografia
    }
    return { id: artist.id, name: artist.name, albumIds };
  }
}
