<script lang="ts" module>
  /** Inline SVG path sets, ported verbatim from the prototype. */
  export const ICONS: Record<string, string> = {
    dashboard:
      '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    playlists:
      '<path d="M4 7h16M4 12h11M4 17h7" stroke-linecap="round"/><circle cx="18" cy="16" r="2.6"/><path d="M20.6 16V9.5l-2.6.8" stroke-linecap="round" stroke-linejoin="round"/>',
    downloads:
      '<path d="M12 3.5v11m0 0l-3.5-3.5M12 14.5l3.5-3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 20h15" stroke-linecap="round"/>',
    library:
      '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    wishlist:
      '<path d="M12 20.5s-6.5-4-9-8.2C1.4 9.2 2.8 5.5 6.2 5.5c2 0 3.2 1.3 3.8 2.3.6-1 1.8-2.3 3.8-2.3 3.4 0 4.8 3.7 3.2 6.8-2.5 4.2-9 8.2-9 8.2z" stroke-linejoin="round"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.8M12 18.4v2.8M21.2 12h-2.8M5.6 12H2.8M18.5 5.5l-2 2M7.5 16.5l-2 2M18.5 18.5l-2-2M7.5 7.5l-2-2" stroke-linecap="round"/>',
    search:
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/>',
    sync:
      '<path d="M3.5 12a8.5 8.5 0 0114.5-6M20.5 12a8.5 8.5 0 01-14.5 6" stroke-linecap="round"/><path d="M17.5 3v3.2h-3.2M6.5 21v-3.2h3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    // dashboard stat icons
    list: '<path d="M4 6h16M4 12h16M4 18h10" stroke-linecap="round"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke-linecap="round"/>',
    dl: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke-linecap="round" stroke-linejoin="round"/>',
    note: '<circle cx="7" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M10 18V5l11-2v13" stroke-linecap="round" stroke-linejoin="round"/>',
    disk: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M16 4v4H8V4" stroke-linecap="round"/>',
    wave: '<path d="M2 12h2l2-6 3 14 3-18 3 14 2-4h5" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>'
  };
</script>

<script lang="ts">
  interface Props {
    name: keyof typeof ICONS | string;
    stroke?: string;
    width?: number;
  }
  let { name, stroke = 'currentColor', width = 1.8 }: Props = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" stroke={stroke} stroke-width={width}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html ICONS[name] ?? ''}
</svg>
