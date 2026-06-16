import { Injectable } from '@nestjs/common';
import { MusicProvider } from './provider.interface';

@Injectable()
export class ProviderRegistry {
  private providers = new Map<string, MusicProvider>();

  register(provider: MusicProvider) {
    this.providers.set(provider.key, provider);
  }

  get(key: string): MusicProvider | undefined {
    return this.providers.get(key);
  }

  /** Providers ativos ordenados por prioridade (menor = primeiro). */
  ordered(): MusicProvider[] {
    return [...this.providers.values()].sort((a, b) => a.priority - b.priority);
  }

  all(): MusicProvider[] {
    return [...this.providers.values()];
  }
}
