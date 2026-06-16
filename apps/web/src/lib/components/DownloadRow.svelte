<script lang="ts">
  import { DownloadState, type DownloadDTO } from '@spotiseek/shared';
  import Cover from './Cover.svelte';
  import QualityBadge from './QualityBadge.svelte';

  interface Props {
    download: DownloadDTO;
    /** "compact" = dashboard panel row; "full" = downloads table row. */
    variant?: 'compact' | 'full';
    delay?: number;
  }
  let { download: d, variant = 'compact', delay = 0 }: Props = $props();

  const speedLabel = $derived(
    d.state === DownloadState.IN_PROGRESS && d.speedBps
      ? `${(d.speedBps / 1_000_000).toFixed(2)} MB/s`
      : '—'
  );
  const sizeLabel = $derived(
    d.state === DownloadState.COMPLETED
      ? `${((d.bytesTotal ?? 0) / 1_000_000).toFixed(1)} MB`
      : d.state === DownloadState.FAILED
        ? 'retry'
        : `${Math.round((d.bytesDone || (d.bytesTotal ?? 0) * d.progress) / 1_000_000)} MB`
  );
  const done = $derived(
    d.state === DownloadState.COMPLETED || d.state === DownloadState.IMPORTED
  );
  const failed = $derived(d.state === DownloadState.FAILED);
</script>

{#if variant === 'compact'}
  <div class="dl reveal" style="animation-delay:{delay}ms">
    <Cover coverSeed={d.coverSeed} coverUrl={d.coverUrl} fontSize={16} style="width:46px;height:46px;border-radius:9px" />
    <div class="meta">
      <div class="t">{d.title}</div>
      <div class="a">{d.artist}</div>
      <div class="prog-wrap">
        <div class="prog {done ? 'green' : ''}"><i style="width:{d.progress * 100}%"></i></div>
        <span class="spd num">{speedLabel}</span>
      </div>
    </div>
    <div class="right">
      <QualityBadge quality={d.quality} />
      <span class="prov">soulseek · {d.peer ?? '—'}</span>
    </div>
  </div>
{:else}
  <div
    class="trow reveal"
    style="grid-template-columns:40px 1fr 150px 100px 92px;animation-delay:{delay}ms"
  >
    <Cover coverSeed={d.coverSeed} coverUrl={d.coverUrl} fontSize={14} style="width:40px;height:40px;border-radius:8px" />
    <div style="min-width:0">
      <div class="nm">{d.title}</div>
      <div class="ar">{d.artist} · <span style="color:var(--text-3)">soulseek/{d.peer ?? '—'}</span></div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
        <div class="prog {done ? 'green' : ''}"><i style="width:{failed ? 0 : d.progress * 100}%"></i></div>
        <span class="spd num">{speedLabel}</span>
      </div>
    </div>
    <div>
      {#if done}
        <span class="st st-done"><span class="d"></span>Concluído</span>
      {:else if failed}
        <span class="st st-fail"><span class="d"></span>Sem fonte</span>
      {:else}
        <span class="st st-dl"><span class="d"></span>Baixando</span>
      {/if}
    </div>
    <div><QualityBadge quality={d.quality} /></div>
    <div class="num" style="text-align:right;font-size:12px;color:var(--text-2)">{sizeLabel}</div>
  </div>
{/if}
