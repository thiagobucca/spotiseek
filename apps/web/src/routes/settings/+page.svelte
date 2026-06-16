<script lang="ts">
  import { onMount } from 'svelte';
  import {
    QUALITY_LABELS,
    QualityTier,
    type ProviderDTO,
    type SettingsDTO,
    type SpotifyStatusDTO
  } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import Topbar from '$lib/components/Topbar.svelte';
  import Toggle from '$lib/components/Toggle.svelte';

  let settings = $state<SettingsDTO | null>(null);
  let providers = $state<ProviderDTO[]>([]);
  let spotify = $state<SpotifyStatusDTO | null>(null);

  const MIN_OPTIONS: QualityTier[] = [
    QualityTier.MP3_192,
    QualityTier.MP3_256,
    QualityTier.MP3_320,
    QualityTier.FLAC
  ];
  const INTERVALS = [
    { min: 30, label: '30 min' },
    { min: 60, label: '1 hora' },
    { min: 360, label: '6 horas' },
    { min: 1440, label: 'diário' }
  ];

  // Persist a single field patch (mock-safe).
  async function patch(p: Partial<SettingsDTO>) {
    if (!settings) return;
    settings = { ...settings, ...p };
    settings = await api.updateSettings(p);
  }

  async function disconnectSpotify() {
    await api.disconnectSpotify();
    spotify = { connected: false };
  }

  async function connectSpotify() {
    const { url } = await api.spotifyAuthorizeUrl();
    if (url && url !== '#') window.location.href = url;
  }

  onMount(() => {
    api.settings().then((s) => (settings = s));
    api.providers().then((p) => (providers = p.sort((a, b) => a.priority - b.priority)));
    api.spotifyStatus().then((s) => (spotify = s));
  });
</script>

<Topbar title="Configurações" subtitle="providers, qualidade e agenda" showSync={false} />

<section class="screen">
  <!-- Spotify card -->
  <div class="spotify-card reveal">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 14.4a.6.6 0 01-.86.2c-2.35-1.43-5.3-1.76-8.79-.96a.62.62 0 11-.28-1.2c3.82-.88 7.1-.5 9.73 1.1.3.18.4.57.2.86zm1.2-2.7a.78.78 0 01-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 11-.45-1.49c3.63-1.1 8.15-.56 11.23 1.33.37.22.49.7.26 1.07zm.1-2.8C14.5 8.95 9.4 8.76 6.5 9.64a.93.93 0 11-.54-1.78c3.33-1.01 8.96-.81 12.49 1.28a.93.93 0 11-.95 1.6z" />
      </svg>
    </div>
    <div class="info">
      {#if spotify?.connected}
        <div class="h">Spotify vinculado</div>
        <div class="d">Conta <span class="u">{spotify.account ?? '—'}</span> · uso pessoal · leitura de playlists</div>
      {:else}
        <div class="h">Spotify desconectado</div>
        <div class="d">Vincule sua conta para sincronizar playlists.</div>
      {/if}
    </div>
    {#if spotify?.connected}
      <button class="btn btn-soft" onclick={disconnectSpotify}>Desvincular</button>
    {:else}
      <button class="btn btn-blue" onclick={connectSpotify}>Vincular</button>
    {/if}
  </div>

  {#if settings}
    <div class="set-grid">
      <!-- Qualidade -->
      <div class="panel reveal">
        <div class="panel-h"><h3>Qualidade</h3></div>
        <div style="padding:4px 18px 16px">
          <div class="set-row">
            <div class="k">Ordem de preferência<small>melhor formato disponível primeiro</small></div>
          </div>
          <div class="qchain">
            {#each settings.qualityPriority as q, i (q)}
              <span class="qc"><span class="n num">{i + 1}</span>{QUALITY_LABELS[q]}</span>
            {/each}
          </div>
          <div class="set-row">
            <div class="k">Qualidade mínima<small>abaixo disso, não baixa</small></div>
            <select
              class="select"
              value={settings.qualityMinimum}
              onchange={(e) => patch({ qualityMinimum: e.currentTarget.value as QualityTier })}
            >
              {#each MIN_OPTIONS as q (q)}
                <option value={q}>{QUALITY_LABELS[q]}</option>
              {/each}
            </select>
          </div>
          <div class="set-row">
            <div class="k">Auto-aceitar match<small>score mínimo para baixar sem revisão</small></div>
            <span class="num" style="color:var(--blue);font-weight:600">{settings.autoAcceptScore.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <!-- Providers -->
      <div class="panel reveal" style="animation-delay:.08s">
        <div class="panel-h"><h3>Providers</h3></div>
        <div style="padding:14px 18px 16px">
          <div class="prio">
            {#each providers as p (p.key)}
              <div class="p" style={p.enabled ? '' : 'opacity:.5'}>
                <span class="num">{p.priority}</span>
                <span class="dot {p.healthy ? 'ok' : 'off'}"></span>
                {p.name}
                <span style="color:var(--text-3);font-size:11px;margin-left:5px">
                  {p.key === 'slskd' ? 'slskd' : p.enabled ? '' : 'em breve'}
                </span>
                <span class="gr">⋮⋮</span>
              </div>
            {/each}
          </div>
          <div class="set-row" style="margin-top:8px">
            <div class="k">Downloads simultâneos<small>otimizado para Raspberry Pi</small></div>
            <select
              class="select"
              value={settings.maxConcurrentDownloads}
              onchange={(e) => patch({ maxConcurrentDownloads: Number(e.currentTarget.value) })}
            >
              {#each [1, 2, 3, 4] as n (n)}
                <option value={n}>{n}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <!-- Biblioteca -->
      <div class="panel reveal" style="animation-delay:.12s">
        <div class="panel-h"><h3>Biblioteca</h3></div>
        <div style="padding:4px 18px 16px">
          <div class="set-row">
            <div class="k">Pasta da biblioteca</div>
            <span class="num" style="font-size:12.5px;color:var(--text-2)">{settings.libraryPath}</span>
          </div>
          <div class="set-row">
            <div class="k">Baixar automaticamente ao importar<small>desligado: a playlist só é catalogada e você baixa sob demanda</small></div>
            <Toggle checked={settings.autoDownload} onchange={(v) => patch({ autoDownload: v })} />
          </div>
          <div class="set-row">
            <div class="k">Organizar automaticamente<small>renomear + tags + capa</small></div>
            <Toggle checked={settings.organizeAutomatically} onchange={(v) => patch({ organizeAutomatically: v })} />
          </div>
          <div class="set-row">
            <div class="k">Deduplicar arquivos</div>
            <Toggle checked={settings.deduplicate} onchange={(v) => patch({ deduplicate: v })} />
          </div>
          <div class="set-row">
            <div class="k">Compartilhar /music no Soulseek<small>desligado por padrão (uso pessoal)</small></div>
            <Toggle checked={settings.shareLibrary} onchange={(v) => patch({ shareLibrary: v })} />
          </div>
        </div>
      </div>

      <!-- Agendamento -->
      <div class="panel reveal" style="animation-delay:.16s">
        <div class="panel-h"><h3>Agendamento</h3></div>
        <div style="padding:4px 18px 16px">
          <div class="set-row">
            <div class="k">Sincronização automática<small>verificar playlists periodicamente</small></div>
            <Toggle checked={settings.autoSync} onchange={(v) => patch({ autoSync: v })} />
          </div>
          <div class="set-row">
            <div class="k">Intervalo</div>
            <select
              class="select"
              value={settings.syncIntervalMinutes}
              onchange={(e) => patch({ syncIntervalMinutes: Number(e.currentTarget.value) })}
            >
              {#each INTERVALS as it (it.min)}
                <option value={it.min}>{it.label}</option>
              {/each}
            </select>
          </div>
          <div class="set-row">
            <div class="k">Modo econômico (RPi)<small>limita CPU/IO em horários definidos</small></div>
            <Toggle checked={settings.ecoMode} onchange={(v) => patch({ ecoMode: v })} />
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>
