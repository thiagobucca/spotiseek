/**
 * Auth token store. Persisted to localStorage so the Bearer token survives
 * reloads. The API client reads `getToken()` synchronously on each request.
 */
import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const KEY = 'spotiseek.token';

const initial = browser ? (localStorage.getItem(KEY) ?? null) : null;

export const token = writable<string | null>(initial);

if (browser) {
  token.subscribe((v) => {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  });
}

let current = initial;
token.subscribe((v) => (current = v));

/** Synchronous accessor used by the API client. */
export function getToken(): string | null {
  return current;
}

export function setToken(value: string | null): void {
  token.set(value);
}
