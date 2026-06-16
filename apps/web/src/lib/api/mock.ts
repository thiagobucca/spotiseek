/**
 * Mock layer — mirrors the data shown in the approved prototype so the UI
 * runs fully standalone before the backend exists. Cover art still resolves
 * through the real iTunes lookup (see cover.ts), keyed by `coverSeed`.
 */
import {
  DownloadState,
  PlaylistStatus,
  QualityTier,
  SyncMode,
  TrackStatus,
  WishlistType,
  DEFAULT_SETTINGS,
  type ActivityItem,
  type AuthTokens,
  type DashboardStats,
  type DownloadDTO,
  type HealthDTO,
  type LibraryAlbumDTO,
  type LibraryArtistDTO,
  type MatchCandidateDTO,
  type PlaylistDTO,
  type PlaylistDetailDTO,
  type ProviderDTO,
  type SettingsDTO,
  type SpotifyStatusDTO,
  type TrackDTO,
  type WishlistItemDTO
} from '@spotiseek/shared';
import { hash } from './cover';

let _id = 0;
const id = (prefix: string) => `${prefix}_${(++_id).toString(36)}`;

// ───────────────────────── dashboard ─────────────────────────
export const mockDashboard: DashboardStats = {
  playlists: 6,
  monitoredArtists: 14,
  activeDownloads: 3,
  libraryTracks: 1284,
  diskUsedGb: 312,
  losslessPercent: 87,
  storage: { flacGb: 214, mp3Gb: 68, otherGb: 30, freeGb: 154 },
  activity: [
    { id: 'a1', level: 'info', message: '<b>Battery</b> · Metallica importada (FLAC)', at: rel(2) },
    { id: 'a2', level: 'info', message: 'Match selecionado para <b>One</b> · score 0,94', at: rel(4) },
    {
      id: 'a3',
      level: 'info',
      message: 'Playlist <b>Prog Essentials</b> sincronizada · +3 faixas',
      at: rel(18)
    },
    {
      id: 'a4',
      level: 'error',
      message: '<b>Echoes (Live)</b> sem fonte aceitável · na fila',
      at: rel(31)
    },
    { id: 'a5', level: 'info', message: 'Capa baixada · <b>Images and Words</b>', at: rel(44) }
  ]
};

function rel(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/** Map an ISO timestamp back to the prototype's "há X min" phrasing. */
export function relLabel(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dia${h >= 48 ? 's' : ''}`;
}

export function activityColor(level: ActivityItem['level']): string {
  return level === 'error' ? 'var(--red)' : level === 'warn' ? 'var(--orange)' : 'var(--green)';
}

// ───────────────────────── playlists ─────────────────────────
export const mockPlaylists: PlaylistDTO[] = [
  pl('Prog Essentials', 'Dream Theater Images and Words', 142, 'há 18 min', PlaylistStatus.IDLE, 1),
  pl('Metal Classics', 'Metallica Master of Puppets', 89, 'há 2 h', PlaylistStatus.IDLE, 1),
  pl('Sunday Jazz', 'Miles Davis Kind of Blue', 64, 'sincronizando', PlaylistStatus.SYNCING, 0.42),
  pl('Rock Progressivo', 'Rush Moving Pictures', 51, 'há 1 dia', PlaylistStatus.IDLE, 0.93),
  pl('Synthwave Drive', 'The Midnight Endless Summer', 73, 'há 5 h', PlaylistStatus.IDLE, 1),
  pl(
    'Liked Songs',
    'Pink Floyd The Dark Side of the Moon',
    418,
    'há 3 h',
    PlaylistStatus.IDLE,
    0.78
  )
];

function pl(
  name: string,
  coverSeed: string,
  trackCount: number,
  syncLabel: string,
  status: PlaylistStatus,
  doneRatio: number
): PlaylistDTO & { syncLabel: string } {
  return {
    id: id('pl'),
    name,
    coverSeed,
    trackCount,
    lastSyncedAt: rel(18),
    status,
    syncMode: SyncMode.AUTO,
    doneRatio,
    // extra display-only field carried alongside the DTO for fidelity
    syncLabel
  };
}

const detailTracks: TrackDTO[] = [
  trk('Pull Me Under', 'Dream Theater', '8:14', TrackStatus.IMPORTED, QualityTier.FLAC, 0.97),
  trk('Another Day', 'Dream Theater', '4:23', TrackStatus.IMPORTED, QualityTier.FLAC, 0.95),
  trk('Take the Time', 'Dream Theater', '8:21', TrackStatus.DOWNLOADING, QualityTier.FLAC, 0.92, 0.28),
  trk('Surrounded', 'Dream Theater', '5:29', TrackStatus.WANTED, undefined, undefined),
  trk('Metropolis, Pt. 1', 'Dream Theater', '9:32', TrackStatus.IMPORTED, QualityTier.FLAC, 0.99),
  trk('Under a Glass Moon', 'Dream Theater', '7:02', TrackStatus.FAILED, undefined, 0.41),
  trk('Wait for Sleep', 'Dream Theater', '2:31', TrackStatus.IMPORTED, QualityTier.MP3_320, 0.88),
  trk('Learning to Live', 'Dream Theater', '11:30', TrackStatus.WANTED, undefined, undefined)
];

function trk(
  title: string,
  artist: string,
  dur: string,
  status: TrackStatus,
  quality: QualityTier | undefined,
  score: number | undefined,
  progress?: number
): TrackDTO & { durLabel: string; progress?: number } {
  return {
    id: id('trk'),
    title,
    artist,
    album: 'Images and Words',
    durationSec: durToSec(dur),
    coverSeed: `${artist} ${title}`,
    status,
    quality,
    score,
    durLabel: dur,
    progress
  };
}

function durToSec(dur: string): number {
  const [m, s] = dur.split(':').map(Number);
  return m * 60 + s;
}

export function mockPlaylistDetail(playlistId: string): PlaylistDetailDTO {
  const base = mockPlaylists.find((p) => p.id === playlistId) ?? mockPlaylists[0];
  return { ...base, tracks: detailTracks };
}

// ───────────────────────── downloads ─────────────────────────
export const mockDownloads: DownloadDTO[] = [
  dl('Master of Puppets', 'Metallica', QualityTier.FLAC, 'audiophile_99', 0.62, 1.34, DownloadState.IN_PROGRESS),
  dl('Pull Me Under', 'Dream Theater', QualityTier.FLAC, 'progrock_hd', 0.28, 0.91, DownloadState.IN_PROGRESS),
  dl('Comfortably Numb', 'Pink Floyd', QualityTier.MP3_320, 'floyd_vault', 0.84, 2.1, DownloadState.IN_PROGRESS),
  dl('One', 'Metallica', QualityTier.FLAC, 'metal_archive', 1, 0, DownloadState.COMPLETED),
  dl('Battery', 'Metallica', QualityTier.FLAC, 'thrash_hd', 1, 0, DownloadState.COMPLETED),
  dl('Echoes (Live)', 'Pink Floyd', undefined, undefined, 0, 0, DownloadState.FAILED, 'Sem fonte ≥ MP3 320')
];

function dl(
  title: string,
  artist: string,
  quality: QualityTier | undefined,
  peer: string | undefined,
  progress: number,
  speedMb: number,
  state: DownloadState,
  error?: string
): DownloadDTO {
  const bytesTotal = 24_300_000;
  return {
    id: id('dl'),
    trackId: id('trk'),
    title,
    artist,
    coverSeed: `${artist} ${title}`,
    providerKey: 'slskd',
    peer,
    quality,
    state,
    progress,
    speedBps: speedMb * 1_000_000,
    bytesDone: Math.round(bytesTotal * progress),
    bytesTotal,
    error
  };
}

export const mockCandidates: MatchCandidateDTO[] = [
  {
    id: id('cand'),
    filename: 'audiophile_99/Master of Puppets/01 Battery.flac',
    username: 'audiophile_99',
    format: 'FLAC',
    bitrate: 1058,
    sizeBytes: 31_400_000,
    score: 0.96,
    scoreBreakdown: { title: 1, artist: 1, duration: 0.94, format: true, freeSlot: true },
    chosen: true
  },
  {
    id: id('cand'),
    filename: 'thrash_hd/Metallica - MOP/Battery.flac',
    username: 'thrash_hd',
    format: 'FLAC',
    bitrate: 990,
    sizeBytes: 29_900_000,
    score: 0.88,
    scoreBreakdown: { title: 1, artist: 1, duration: 0.81, format: true, freeSlot: false },
    chosen: false
  }
];

// ───────────────────────── library ─────────────────────────
const ALBUM_SEEDS = [
  'Metallica Master of Puppets',
  'Pink Floyd The Dark Side of the Moon',
  'Dream Theater Images and Words',
  'Rush Moving Pictures',
  'Tool Lateralus',
  'Opeth Blackwater Park',
  'King Crimson In the Court of the Crimson King',
  'Porcupine Tree In Absentia',
  'Yes Close to the Edge',
  'Genesis Selling England by the Pound',
  'Steven Wilson Hand. Cannot. Erase.',
  'Gojira Magma'
];

const ARTIST_NAMES = [
  'Metallica',
  'Pink Floyd',
  'Dream Theater',
  'Rush',
  'Tool',
  'Opeth',
  'King Crimson',
  'Porcupine Tree',
  'Yes',
  'Genesis',
  'Steven Wilson',
  'Gojira'
];

export const mockAlbums: LibraryAlbumDTO[] = ALBUM_SEEDS.map((seed) => {
  const artist = seed.split(' ')[0];
  const title = seed.replace(artist + ' ', '');
  return {
    id: id('alb'),
    title,
    artist,
    coverSeed: seed,
    trackCount: 4 + (hash(seed) % 9)
  };
});

export const mockArtists: LibraryArtistDTO[] = ARTIST_NAMES.map((name) => ({
  id: id('art'),
  name,
  coverSeed: name,
  albumCount: 4 + (hash(name) % 9)
}));

export const mockTracks: TrackDTO[] = detailTracks;

// ───────────────────────── wishlist ─────────────────────────
export const mockWishlist: WishlistItemDTO[] = [
  {
    id: id('wish'),
    type: WishlistType.ALBUM,
    query: 'Dream Theater — Images and Words',
    coverSeed: 'Dream Theater Images and Words',
    status: 'resolvido · 8/8 faixas'
  },
  {
    id: id('wish'),
    type: WishlistType.TRACK,
    query: 'Metallica — One',
    coverSeed: 'Metallica And Justice for All',
    status: 'baixada · FLAC'
  },
  {
    id: id('wish'),
    type: WishlistType.ARTIST,
    query: 'Pink Floyd',
    coverSeed: 'Pink Floyd Wish You Were Here',
    status: 'monitorando · 14 álbuns'
  },
  {
    id: id('wish'),
    type: WishlistType.PLAYLIST,
    query: 'Minha coleção de rock progressivo',
    coverSeed: 'Yes Fragile',
    status: '42 faixas na fila'
  }
];

// ───────────────────────── providers ─────────────────────────
export const mockProviders: ProviderDTO[] = [
  { key: 'slskd', name: 'Soulseek', enabled: true, priority: 1, healthy: true, lastCheck: rel(1) },
  { key: 'lidarr', name: 'Lidarr', enabled: false, priority: 2, healthy: false }
];

// ───────────────────────── settings / auth / status ─────────────────────────
export const mockSettings: SettingsDTO = { ...DEFAULT_SETTINGS };

export const mockSpotifyStatus: SpotifyStatusDTO = {
  connected: true,
  account: 'thiagobucca',
  expiresAt: new Date(Date.now() + 3600_000).toISOString()
};

export const mockHealth: HealthDTO = { db: true, slskd: true, spotify: true };

export const mockAuthTokens: AuthTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token'
};

export const mockMe = { id: 'u1', email: 'thiagobucca@gmail.com', name: 'Thiago' };
