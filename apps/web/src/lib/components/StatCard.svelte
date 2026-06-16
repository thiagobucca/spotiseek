<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    icon: string;
    color: string;
    value: string | number;
    unit?: string;
    label: string;
    delay?: number;
  }
  let { icon, color, value, unit, label, delay = 0 }: Props = $props();
</script>

<div class="stat reveal" style="animation-delay:{delay}ms">
  <div class="ic" style="background:{color}">
    <Icon name={icon} stroke="#fff" width={2} />
  </div>
  <div class="val num">
    {value}{#if unit}<span class="u">{unit}</span>{/if}
  </div>
  <div class="lbl">{label}</div>
</div>
