<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WishlistType, type WishlistItemDTO } from '@spotiseek/shared';
  import { api } from '$lib/api/client';
  import Topbar from '$lib/components/Topbar.svelte';
  import Cover from '$lib/components/Cover.svelte';

  // Segmented selector — pt-BR labels mapped to the shared enum.
  const TYPES: { value: WishlistType; label: string; placeholder: string }[] = [
    { value: WishlistType.TRACK, label: 'Faixa', placeholder: 'Metallica — One' },
    { value: WishlistType.ALBUM, label: 'Álbum', placeholder: 'Dream Theater — Images and Words' },
    { value: WishlistType.ARTIST, label: 'Artista', placeholder: 'Pink Floyd' },
    { value: WishlistType.PLAYLIST, label: 'Playlist', placeholder: 'Minha coleção de rock progressivo' }
  ];
  const TYPE_LABEL: Record<WishlistType, string> = {
    TRACK: 'faixa',
    ALBUM: 'álbum',
    ARTIST: 'artista',
    PLAYLIST: 'playlist'
  };

  let items = $state<WishlistItemDTO[]>([]);
  let selected = $state<WishlistType>(WishlistType.TRACK);
  let query = $state('');

  const placeholder = $derived(TYPES.find((t) => t.value === selected)?.placeholder ?? '');

  let adding = $state(false);

  async function add() {
    if (!query.trim() || adding) return;
    adding = true;
    try {
      const created = await api.addWishlist(selected, query.trim());
      items = [created, ...items];
      query = '';
    } finally {
      adding = false;
    }
  }

  async function remove(id: string) {
    await api.removeWishlist(id);
    items = items.filter((w) => w.id !== id);
  }

  async function refresh() {
    items = await api.wishlist();
  }

  // Enquanto algum item está resolvendo, atualiza o status periodicamente.
  const poll = setInterval(() => {
    if (items.some((w) => /fila|resolvendo|baixando/i.test(w.status))) refresh();
  }, 3000);
  onDestroy(() => clearInterval(poll));

  onMount(refresh);
</script>

<Topbar title="Wishlist" subtitle="o que você quer encontrar" showSync={false} />

<section class="screen">
  <div class="wish-form reveal">
    <div class="seg">
      {#each TYPES as t (t.value)}
        <button class={t.value === selected ? 'on' : ''} onclick={() => (selected = t.value)}>
          {t.label}
        </button>
      {/each}
    </div>
    <input
      class="input"
      style="flex:1;min-width:240px"
      {placeholder}
      bind:value={query}
      onkeydown={(e) => e.key === 'Enter' && add()}
    />
    <button class="btn btn-blue" onclick={add}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <path d="M12 5v14M5 12h14" stroke-linecap="round" />
      </svg>
      Adicionar
    </button>
  </div>

  <div class="sect-h">
    <h2>Procurando</h2>
    <span class="meta">{items.length} itens</span>
  </div>

  <div class="wish-list">
    {#each items as w (w.id)}
      <div class="witem reveal">
        <Cover coverSeed={w.coverSeed} coverUrl={w.coverUrl} fontSize={16} style="width:40px;height:40px;border-radius:9px" />
        <span class="wtype">{TYPE_LABEL[w.type]}</span>
        <span class="q">{w.query}</span>
        <span class="stt">{w.status}</span>
        <button class="wdel" onclick={() => remove(w.id)} aria-label="Remover" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
        </button>
      </div>
    {:else}
      <div class="wempty">Sua wishlist está vazia. Adicione uma faixa, álbum ou artista acima — o Spotiseek acha no Spotify e baixa via Soulseek.</div>
    {/each}
  </div>
</section>

<style>
  .wdel {
    width: 30px;
    height: 30px;
    flex: none;
    border: none;
    background: none;
    color: var(--text-3);
    border-radius: 50%;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: 0.15s;
  }
  .wdel svg {
    width: 15px;
    height: 15px;
  }
  .wdel:hover {
    background: rgba(255, 59, 48, 0.08);
    color: var(--red);
  }
  .wempty {
    background: var(--surface);
    border-radius: var(--r);
    box-shadow: var(--sh-1);
    padding: 28px;
    text-align: center;
    color: var(--text-2);
    font-size: 13.5px;
  }
</style>
