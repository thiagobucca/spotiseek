import { TrackMetadata, SearchResult, DownloadHandle, TransferStatus } from '@spotiseek/shared';

export interface MusicProvider {
  readonly key: string;
  readonly name: string;
  readonly priority: number;
  search(track: TrackMetadata): Promise<SearchResult[]>;
  download(result: SearchResult): Promise<DownloadHandle>;
  getTransfer(handle: DownloadHandle): Promise<TransferStatus>;
  cancel(handle: DownloadHandle): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export const PROVIDERS = Symbol('PROVIDERS');
