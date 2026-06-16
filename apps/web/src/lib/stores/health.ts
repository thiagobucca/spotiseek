/**
 * Shared health/status store, surfaced in the sidebar footer.
 * Refreshed on layout mount; in mock mode it reflects the mock health DTO.
 */
import type { HealthDTO } from '@spotiseek/shared';
import { writable } from 'svelte/store';

export const health = writable<HealthDTO>({ db: true, slskd: true, spotify: true });
