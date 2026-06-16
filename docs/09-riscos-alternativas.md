# 09 — Limitações legais, operacionais e de ToS

Este documento consolida a **avaliação crítica** pedida no brief: *antes de qualquer
implementação, avaliar as limitações técnicas, legais e operacionais* da integração com
Soulseek (e, por extensão, Spotify). Leitura obrigatória para quem opera a instância.

---

## 1. Soulseek — realidade legal e de etiqueta

### Não há API oficial nem endosso a automação
- Soulseek é uma rede P2P proprietária. **Não existe API pública/oficial.** O cliente
  oficial (SoulseekQt) é GUI-only.
- Integramos via **slskd**, um cliente *de terceiros* legítimo e amplamente usado, construído
  sobre a biblioteca `Soulseek.NET`. Isso é tecnicamente sólido, mas o operador deve entender
  que automação não é um caso de uso "abençoado" pela rede.

### Etiqueta: a rede vive de compartilhamento (ratio)
- A cultura do Soulseek penaliza **leechers** (quem só baixa). Muitos usuários configuram
  seus clientes para **bloquear quem não compartilha nada** ou tem listas vazias.
- **Decisão do operador: compartilhamento DESLIGADO por padrão.** Para o cenário alvo —
  **uso pessoal, single-tenant, baixa intensidade** — o operador optou por **não** expor a
  biblioteca. O `slskd.yml` vem com `shares.directories: []` (vazio) e o `/music` **não** é
  montado no container do slskd (doc 02 §5, doc 06 §2).
- **Tradeoff assumido conscientemente:** sem compartilhar, o operador é um *leecher* — alguns
  peers podem **recusar/atrasar uploads** para a conta, reduzindo a disponibilidade de
  downloads (especialmente de material raro), e a reputação na rede é pior. Em uso de baixo
  volume isso costuma ser tolerável, mas é um custo real, não gratuito.
- **Como reverter (recomendado se notar downloads travando):** habilitar o compartilhamento
  é simples — montar `music-library:/music:ro` no slskd e definir `shares.directories: [ /music ]`,
  além de garantir **port-forward/UPnP** da porta de escuta `50300` se atrás de NAT. Isso
  melhora drasticamente a disponibilidade e mantém a conta em boa reputação.

### Risco de banimento por automação agressiva
- O servidor central pode aplicar **rate-limit/ban temporário** a clientes que disparam
  buscas em excesso.
- **Mitigação:** fila `search` com **rate-limit de ~1 req/s**, *jitter* e backoff (doc 05);
  early-stop na coleta para não manter buscas abertas à toa; sem flood de re-tentativas.

### Copyright — declaração honesta
- A maior parte do conteúdo na rede é **protegido por direitos autorais**. Baixar obras sem
  licença pode ser **ilegal** na sua jurisdição (varia muito por país).
- Este produto é uma **ferramenta de automação de uso pessoal**. Ele **não hospeda, não
  distribui e não indexa** conteúdo; apenas orquestra um cliente que o operador instala e
  controla. **A responsabilidade pelo que é baixado/compartilhado é inteiramente do
  operador.** Esse aviso aparece no README e deve aparecer no primeiro acesso da UI
  (tela de onboarding) — recomendação de produto.

---

## 2. Spotify — limitações operacionais **verificadas** (jun/2026)

A integração com o Spotify Web API tem restrições importantes que moldam o que é viável num
produto **self-hosted**. Estes pontos foram verificados contra a documentação atual:

### a) Quota e "Development Mode" — o ponto mais crítico
- Toda app começa em **Development Mode**, que permite apenas **um número muito pequeno de
  usuários** autorizados (atualmente **~5**; historicamente era 25 — o Spotify reduziu).
  Cada usuário precisa ser **adicionado manualmente** no dashboard do app pelo dono.
- Sair para **Extended Quota Mode** exige, hoje, **conta business registrada e ~250k+ MAU** —
  **inatingível e irrelevante** para uma app self-hosted doméstica.
- **Implicação de arquitetura (boa notícia):**
  - **Playlists públicas → use Client Credentials flow** (app-to-app, *sem usuário*). Não
    consome slot de usuário, não tem o limite de 5. É o caminho default para importar
    qualquer playlist pública por URL.
  - **Playlists privadas / "Curtidas" → Authorization Code (OAuth)**, que **consome 1 slot**
    de Development Mode. Para o cenário alvo (1 família, 1 conta Spotify), **1 de 5 slots é
    folga enorme** — não é um problema prático.
  - **Recomendação de produto:** deixar claro na UI que o operador registra **seu próprio**
    app no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) e cola
    `CLIENT_ID/SECRET` — assim cada instância usa sua própria quota. (Como Sonarr/qBit, a
    config de credenciais é do usuário.)

### b) Deprecações de nov/2024 — o que parou de existir (e por que não nos afeta)
O Spotify **removeu acesso** (para apps novas / em Development Mode) a vários endpoints:
- ❌ Audio Features / Audio Analysis
- ❌ Recommendations
- ❌ Related Artists
- ❌ Featured Playlists, Category's Playlists
- ❌ Playlists **editoriais/algorítmicas** da própria Spotify (ex.: "Discover Weekly", "This
  Is …") — **não podem mais ser lidas** por apps de terceiros.
- ❌ 30s preview URLs em vários contextos.

**O que continua funcionando — e é tudo o que precisamos:**
- ✅ Ler **playlists do usuário** (privadas/colaborativas) e **playlists públicas de
  usuários** via `GET /v1/playlists/{id}` e `/tracks`.
- ✅ Metadados de faixa: `name`, `artists`, `album`, `duration_ms`, `popularity`, e
  **`external_ids.isrc`** (nossa chave forte de matching/dedupe).
- ✅ Biblioteca do usuário (álbuns/faixas salvas) com scope adequado.

> **Impacto de design:** o produto foi desenhado para **não depender** de nenhum endpoint
> deprecado. A única limitação real é: **não dá para importar playlists algorítmicas da
> própria Spotify** (Discover Weekly etc.). Mitigação: o usuário pode *duplicar* a playlist
> algorítmica para uma playlist própria no app Spotify (vira "de usuário" e fica legível), ou
> usar a **wishlist manual**. Isso deve ser explicado na UI.

### c) Scopes OAuth mínimos
`playlist-read-private`, `playlist-read-collaborative`, `user-library-read`.
Nada além do necessário (princípio do menor privilégio).

### d) Rate limits do Spotify
- Limite por janela de tempo (rolling). **Mitigação:** cache in-process (memória) de respostas
  e de tokens; respeitar `snapshot_id` para *no-op* quando a playlist não mudou (doc 05);
  paginação eficiente; backoff em `429` com `Retry-After`.

---

## 3. Matriz de risco consolidada (legal/operacional)

| Risco | Probab. | Impacto | Mitigação |
|---|---|---|---|
| Conteúdo protegido por copyright | Alta | Legal (operador) | Aviso explícito; uso pessoal; sem hospedagem/distribuição pelo produto; decisão do operador. |
| Downloads limitados por leech (sharing OFF) | Média | Downloads lentos/recusados | **Aceito** por decisão do operador (uso pessoal baixo volume); rate-limit de busca evita flood; reversível ativando `shares` + porta `50300` (ver §1). |
| Quota Spotify (5 usuários dev) | Baixa (single-tenant) | Funcional | Client Credentials p/ públicas; cada operador usa seu próprio app/credenciais. |
| Playlists algorítmicas ilegíveis | Média | Funcional parcial | Duplicar p/ playlist própria; wishlist manual; comunicado na UI. |
| Mudança de contrato slskd | Baixa | Técnico | Tag fixa + testes de contrato + camada de provider. |
| Indisponibilidade de faixas raras no P2P | Média | Funcional | Fallback de qualidade; fila de re-tentativa; seleção/rematch manual. |

---

## 4. Postura recomendada (resumo executivo)

1. **slskd como sidecar** é a base técnica certa — robusta, headless, multi-arch, mantida.
2. **Compartilhamento OFF por padrão** é a escolha atual do operador para uso pessoal de baixo
   volume — com o tradeoff de pior disponibilidade/reputação assumido conscientemente (§1). Se
   downloads começarem a travar, **ativar o `shares` + porta `50300`** é o caminho recomendado.
3. **Tratar credenciais Spotify como config do operador** (cada instância, seu próprio app)
   contorna a quota de Development Mode de forma limpa.
4. **Não depender de endpoints Spotify deprecados** — já é o caso no design.
5. **Transparência legal** no onboarding: a ferramenta automatiza; a responsabilidade pelo
   conteúdo é de quem opera. Sem isso, o produto induz o usuário a riscos que ele não
   entende.
