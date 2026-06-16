/**
 * @spotiseek/shared — contrato compartilhado entre backend (NestJS) e frontend (SvelteKit).
 * Mantém DTOs da API, enums de domínio e os contratos de provider em um único lugar.
 */

// ───────────────────────── Enums de domínio ─────────────────────────
export const TrackStatus = {
  WANTED: 'WANTED',
  SEARCHING: 'SEARCHING',
  MATCHED: 'MATCHED',
  DOWNLOADING: 'DOWNLOADING',
  DOWNLOADED: 'DOWNLOADED',
  IMPORTED: 'IMPORTED',
  FAILED: 'FAILED',
  IGNORED: 'IGNORED',
} as const;
export type TrackStatus = (typeof TrackStatus)[keyof typeof TrackStatus];

export const TrackSource = {
  SPOTIFY_PLAYLIST: 'SPOTIFY_PLAYLIST',
  WISHLIST_TRACK: 'WISHLIST_TRACK',
  WISHLIST_ALBUM: 'WISHLIST_ALBUM',
  WISHLIST_ARTIST: 'WISHLIST_ARTIST',
  MANUAL: 'MANUAL',
} as const;
export type TrackSource = (typeof TrackSource)[keyof typeof TrackSource];

export const SyncMode = { MANUAL: 'MANUAL', SCHEDULED: 'SCHEDULED', AUTO: 'AUTO' } as const;
export type SyncMode = (typeof SyncMode)[keyof typeof SyncMode];

export const PlaylistStatus = { IDLE: 'IDLE', SYNCING: 'SYNCING', ERROR: 'ERROR' } as const;
export type PlaylistStatus = (typeof PlaylistStatus)[keyof typeof PlaylistStatus];

export const WishlistType = {
  TRACK: 'TRACK',
  ALBUM: 'ALBUM',
  ARTIST: 'ARTIST',
  PLAYLIST: 'PLAYLIST',
} as const;
export type WishlistType = (typeof WishlistType)[keyof typeof WishlistType];

export const DownloadState = {
  QUEUED: 'QUEUED',
  REQUESTED: 'REQUESTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  IMPORTED: 'IMPORTED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type DownloadState = (typeof DownloadState)[keyof typeof DownloadState];

/** Tiers de qualidade, em ordem canônica de preferência. */
export const QualityTier = {
  FLAC: 'FLAC',
  MP3_320: 'MP3_320',
  V0: 'V0',
  MP3_256: 'MP3_256',
  MP3_192: 'MP3_192',
} as const;
export type QualityTier = (typeof QualityTier)[keyof typeof QualityTier];

export const DEFAULT_QUALITY_PRIORITY: QualityTier[] = [
  QualityTier.FLAC,
  QualityTier.MP3_320,
  QualityTier.V0,
  QualityTier.MP3_256,
  QualityTier.MP3_192,
];

export const QUALITY_LABELS: Record<QualityTier, string> = {
  FLAC: 'FLAC',
  MP3_320: 'MP3 320',
  V0: 'MP3 V0',
  MP3_256: 'MP3 256',
  MP3_192: 'MP3 192',
};

// ───────────────────────── Contratos de Provider ─────────────────────────
export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  isrc?: string;
}

export interface SearchResult {
  providerKey: string;
  username: string;
  filename: string;
  folder?: string;
  sizeBytes: number;
  format?: string;
  bitrate?: number;
  durationSec?: number;
  freeUploadSlots?: boolean;
  uploadSpeed?: number;
  raw?: unknown;
}

export interface DownloadHandle {
  externalId: string;
  ref: unknown;
}

export interface TransferStatus {
  state: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0..1
  speedBps?: number;
  bytesDone: number;
  bytesTotal?: number;
  localPath?: string;
}

// ───────────────────────── DTOs da API ─────────────────────────
export interface DashboardStats {
  playlists: number;
  monitoredArtists: number;
  activeDownloads: number;
  libraryTracks: number;
  diskUsedGb: number;
  losslessPercent: number;
  storage: { flacGb: number; mp3Gb: number; otherGb: number; freeGb: number };
  activity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  at: string; // ISO
}

export interface PlaylistDTO {
  id: string;
  name: string;
  coverSeed?: string; // termo p/ buscar capa (artista+álbum) ou url direta em coverUrl
  coverUrl?: string;
  trackCount: number;
  lastSyncedAt?: string;
  status: PlaylistStatus;
  syncMode: SyncMode;
  doneRatio: number; // 0..1 importadas/total
}

export interface PlaylistDetailDTO extends PlaylistDTO {
  tracks: TrackDTO[];
}

export interface TrackDTO {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  coverSeed?: string;
  coverUrl?: string;
  status: TrackStatus;
  quality?: QualityTier;
  score?: number; // score do match escolhido (auditoria)
}

export interface DownloadDTO {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  coverSeed?: string;
  coverUrl?: string;
  providerKey: string;
  peer?: string;
  quality?: QualityTier;
  state: DownloadState;
  progress: number;
  speedBps?: number;
  bytesDone: number;
  bytesTotal?: number;
  error?: string;
}

export interface MatchCandidateDTO {
  id: string;
  filename: string;
  username: string;
  format?: string;
  bitrate?: number;
  sizeBytes: number;
  score: number;
  scoreBreakdown: Record<string, number | boolean>;
  chosen: boolean;
}

export interface LibraryArtistDTO {
  id: string;
  name: string;
  coverSeed?: string;
  coverUrl?: string;
  albumCount: number;
}

export interface LibraryAlbumDTO {
  id: string;
  title: string;
  artist: string;
  year?: number;
  coverSeed?: string;
  coverUrl?: string;
  trackCount: number;
}

export interface WishlistItemDTO {
  id: string;
  type: WishlistType;
  query: string;
  coverSeed?: string;
  coverUrl?: string;
  status: string;
}

export interface ProviderDTO {
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  healthy: boolean;
  lastCheck?: string;
}

export interface SettingsDTO {
  qualityPriority: QualityTier[];
  qualityMinimum: QualityTier;
  autoAcceptScore: number;
  libraryPath: string;
  maxConcurrentDownloads: number;
  organizeAutomatically: boolean;
  deduplicate: boolean;
  shareLibrary: boolean; // default false (uso pessoal)
  autoDownload: boolean; // default false: importar só cataloga; download é sob demanda
  autoSync: boolean;
  syncIntervalMinutes: number;
  ecoMode: boolean;
}

export const DEFAULT_SETTINGS: SettingsDTO = {
  qualityPriority: DEFAULT_QUALITY_PRIORITY,
  qualityMinimum: QualityTier.MP3_192, // piso realista p/ Soulseek (320 rejeita demais)
  autoAcceptScore: 0.85,
  libraryPath: '/music',
  maxConcurrentDownloads: 2,
  organizeAutomatically: true,
  deduplicate: true,
  shareLibrary: false,
  autoDownload: false,
  autoSync: true,
  syncIntervalMinutes: 60,
  ecoMode: false,
};

// ───────────────────────── Auth & misc ─────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface HealthDTO {
  db: boolean;
  slskd: boolean;
  spotify: boolean;
}

export interface SpotifyStatusDTO {
  connected: boolean;
  account?: string;
  expiresAt?: string;
}

// ───────────────────────── SSE events ─────────────────────────
export type SseEvent =
  | { type: 'download.progress'; data: DownloadDTO }
  | { type: 'download.done'; data: DownloadDTO }
  | { type: 'sync.progress'; data: { playlistId: string; status: PlaylistStatus; added: number } }
  | { type: 'log'; data: ActivityItem }
  | { type: 'health'; data: HealthDTO };

// ───────────────────────── Job queue ─────────────────────────
export const JobQueueName = {
  IMPORT: 'import',
  SEARCH: 'search',
  MATCH: 'match',
  DOWNLOAD: 'download',
  ORGANIZE: 'organize',
  LIBRARY: 'library',
} as const;
export type JobQueueName = (typeof JobQueueName)[keyof typeof JobQueueName];

export const JobState = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DELAYED: 'DELAYED',
} as const;
export type JobState = (typeof JobState)[keyof typeof JobState];
