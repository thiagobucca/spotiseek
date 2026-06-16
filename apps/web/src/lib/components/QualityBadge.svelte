<script lang="ts">
  import { QUALITY_LABELS, type QualityTier } from '@spotiseek/shared';

  interface Props {
    quality?: QualityTier;
  }
  let { quality }: Props = $props();

  const cls = $derived(
    quality === 'FLAC'
      ? 'q-flac'
      : quality === 'MP3_320'
        ? 'q-320'
        : quality === 'V0'
          ? 'q-v0'
          : ''
  );
</script>

{#if quality}
  <span class="qbadge {cls}">{QUALITY_LABELS[quality]}</span>
{:else}
  <span style="color:var(--text-4)">—</span>
{/if}
