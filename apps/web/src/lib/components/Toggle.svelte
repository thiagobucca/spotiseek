<script lang="ts">
  /** iOS-style toggle. Bind with `bind:checked`. */
  interface Props {
    checked?: boolean;
    onchange?: (value: boolean) => void;
  }
  let { checked = $bindable(false), onchange }: Props = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  class="toggle {checked ? 'on' : ''}"
  role="switch"
  aria-checked={checked}
  onclick={toggle}
>
  <i></i>
</button>
