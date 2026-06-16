/** Player store: a faixa atualmente em reprodução (null = player escondido). */
import { writable } from 'svelte/store';
import type { TrackDTO } from '@spotiseek/shared';

export const currentTrack = writable<TrackDTO | null>(null);

export function playTrack(track: TrackDTO): void {
  currentTrack.set(track);
}
