<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, USE_MOCKS } from '$lib/api/client';
  import { setToken } from '$lib/stores/auth';

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;
    try {
      const tokens = await api.login(email, password);
      setToken(tokens.accessToken);
      goto('/');
    } catch {
      error = 'Credenciais inválidas. Verifique e-mail e senha.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="wrap">
  <form class="card reveal" onsubmit={submit}>
    <div class="brand">
      <div class="mark">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="8" cy="17" r="3.4" fill="#fff" />
          <path d="M12 5.5c4 0 6 1.4 7 2.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </div>
      <h1>Spotiseek</h1>
    </div>

    <p class="sub">Entre para gerenciar suas sincronizações.</p>

    {#if USE_MOCKS}
      <div class="hint">Modo demonstração — qualquer credencial entra.</div>
    {/if}

    <label class="field">
      <span>E-mail</span>
      <input class="input" type="email" bind:value={email} placeholder="admin@spotiseek.local" autocomplete="username" required />
    </label>

    <label class="field">
      <span>Senha</span>
      <input class="input" type="password" bind:value={password} placeholder="••••••••" autocomplete="current-password" required />
    </label>

    {#if error}<div class="error">{error}</div>{/if}

    <button class="btn btn-blue" type="submit" disabled={loading}>
      {loading ? 'Entrando…' : 'Entrar'}
    </button>
  </form>
</div>

<style>
  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(900px 500px at 20% -10%, rgba(0, 113, 227, 0.08), transparent 60%),
      var(--bg);
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: var(--surface);
    border-radius: var(--r);
    box-shadow: var(--sh-2);
    padding: 34px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand .mark {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    flex: none;
    background: linear-gradient(135deg, #0a84ff, #0058c9);
    display: grid;
    place-items: center;
    box-shadow: 0 6px 14px -3px rgba(10, 132, 255, 0.5);
  }
  .brand .mark svg {
    width: 21px;
    height: 21px;
  }
  .brand h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .sub {
    color: var(--text-2);
    font-size: 13.5px;
    margin: -2px 0 8px;
  }
  .hint {
    background: var(--blue-tint);
    color: var(--blue);
    font-size: 12px;
    font-weight: 500;
    padding: 8px 12px;
    border-radius: var(--r-sm);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field span {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
  }
  .field .input {
    width: 100%;
  }
  .error {
    color: var(--red);
    font-size: 12.5px;
    font-weight: 500;
  }
  .btn {
    justify-content: center;
    padding: 11px;
    margin-top: 6px;
    font-size: 14px;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
