<script lang="ts">
  /**
   * Album/artist cover. Renders a deterministic gradient + initials instantly,
   * then crossfades in real artwork once it loads. Never shows a broken image.
   *
   * Prefer `coverUrl` (from the backend). Falls back to looking up `coverSeed`
   * via the iTunes Search API. `seed` also drives the gradient + initials.
   */
  import { grad, initials, realCover } from '$lib/api/cover';

  interface Props {
    /** Term used for gradient/initials and the iTunes lookup. */
    coverSeed?: string;
    /** Direct artwork URL from the backend (takes precedence). */
    coverUrl?: string;
    /** Font size of the initials, px. */
    fontSize?: number;
    /** Extra inline style (size / border-radius). */
    style?: string;
    /** Extra classes. */
    class?: string;
  }

  let {
    coverSeed = '',
    coverUrl = undefined,
    fontSize = 20,
    style = '',
    class: klass = ''
  }: Props = $props();

  const seed = $derived(coverSeed || coverUrl || '');
  let resolvedUrl = $state<string | null>(coverUrl ?? null);
  let loaded = $state(false);

  // Re-resolve whenever the source changes.
  $effect(() => {
    loaded = false;
    resolvedUrl = null;

    if (coverUrl) {
      preload(coverUrl);
      return;
    }
    if (!coverSeed) return;

    let cancelled = false;
    realCover(coverSeed).then((u) => {
      if (cancelled || !u) return;
      preload(u);
    });
    return () => {
      cancelled = true;
    };
  });

  function preload(url: string) {
    const img = new Image();
    img.onload = () => {
      resolvedUrl = url;
      loaded = true;
    };
    img.src = url;
  }
</script>

<div
  class="cover {loaded ? 'loaded' : ''} {klass}"
  style="background:{grad(seed)};{style}"
  aria-label={seed}
>
  <span class="ini" style="font-size:{fontSize}px">{initials(seed)}</span>
  {#if resolvedUrl}
    <span class="art" style="background-image:url({resolvedUrl})"></span>
  {/if}
</div>
