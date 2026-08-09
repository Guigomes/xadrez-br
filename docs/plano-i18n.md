# Plano — Internacionalização (pt-BR / en)

Objetivo: aplicação bilíngue **pt-BR** (padrão, Brasil) e **en** (resto do mundo), com detecção automática de localidade e seletor manual no header.

Status: **plano** — nada implementado.

---

## 1. Decisões de arquitetura

### 1.1 Biblioteca: `next-intl`

Next 15 App Router com **62 client components** e **37 `page.tsx`** (mistura server/client em quase toda tela). Solução caseira exigiria reimplementar: carregamento de dicionário no servidor, contexto no cliente, interpolação, plurais, formatadores de data/número livres de mismatch de hidratação. `next-intl` é a opção nativa de App Router para isso e resolve os quatro.

Descartado: `react-i18next` (client-first, ruim em RSC), dicionário caseiro (custo de manutenção maior que o ganho).

### 1.2 Roteamento: segmento `[locale]` com `localePrefix: 'as-needed'`

```
app/
  [locale]/
    layout.tsx          # o atual app/layout.tsx
    page.tsx
    tournaments/...
    players/...
    noticias/...
    login/ account/ admin/...
  api/                  # FICA FORA do [locale] — rotas de API não têm locale de URL
```

Resultado nas URLs:

| URL | Locale |
|---|---|
| `/tournaments/xyz` | pt-BR (padrão, sem prefixo) |
| `/en/tournaments/xyz` | en |

**Por que prefixo de URL e não só cookie.** A alternativa (locale só em cookie, zero mudança de rota) é mais barata de implementar, mas quebra dois pontos que importam neste app:

1. **Cache/render estático**: a mesma URL passaria a renderizar conteúdo diferente por cookie. As páginas públicas de torneio são o caminho quente e hoje podem ser cacheadas/estáticas; `Vary: Cookie` mata isso.
2. **SEO e link compartilhável**: sem prefixo não há `hreflang`, o Google indexa uma versão só, e "manda o link em inglês pro estrangeiro" não existe.

**Por que `as-needed` e não `always`.** `always` (`/pt-BR/tournaments`) mudaria **todas** as URLs já existentes: índice do Google, links de torneio compartilhados no WhatsApp, `start_url` da PWA (`/?home=1`), cookie `last_tournament`. `as-needed` mantém a URL pt-BR atual byte a byte válida e adiciona só o ramo `/en`.

### 1.3 Códigos de locale

`pt-BR` e `en`. Manter `pt-BR` (não `pt`) — casa com o `lang="pt-BR"` atual, com `manifest.json` e com o formato de data já usado. `en` genérico (não `en-US`) porque o público é "qualquer lugar fora do Brasil", não os EUA.

### 1.4 Prioridade de detecção

Da maior pra menor:

1. **Escolha explícita** — cookie `NEXT_LOCALE` (gravado pelo seletor do header). Sempre ganha.
2. **Prefixo da URL** — `/en/...` é en, resto é pt-BR.
3. **Geo** — header `x-vercel-ip-country` (Vercel). `BR` → pt-BR; qualquer outro país → en.
4. **`Accept-Language`** — fallback quando não há geo (dev local, outro host). Começa com `pt` → pt-BR; resto → en.
5. **Padrão** — pt-BR.

Regras que não podem ser violadas:

- Geo/`Accept-Language` só decidem **na primeira visita a URL sem prefixo**, via redirect que já grava o cookie. Nunca reavaliar geo em request subsequente — senão link compartilhado muda de idioma dependendo de quem abre.
- Uma vez que o cookie existe, geo é ignorado (brasileiro viajando continua em pt-BR).

---

## 2. Fase 0 — Infra e roteamento (maior risco, fazer isolado)

Esta fase não traduz nada. Ela só põe o app rodando dentro de `[locale]` sem regressão. É onde estão todos os riscos reais.

### 2.1 Instalação e config

- `npm i next-intl`
- `i18n/routing.ts` — `defineRouting({ locales: ['pt-BR','en'], defaultLocale: 'pt-BR', localePrefix: 'as-needed', localeDetection: false })`. `localeDetection: false` porque a detecção por geo é nossa (item 1.4), não a de `Accept-Language` da lib.
- `i18n/request.ts` — `getRequestConfig` carregando `messages/{locale}.json`.
- `i18n/navigation.ts` — exporta `Link`, `redirect`, `usePathname`, `useRouter` locale-aware.
- `next.config.js` — envolver com `createNextIntlPlugin()`.

### 2.2 Mover a árvore

`app/*` (exceto `app/api/`) → `app/[locale]/*`. `app/global-error.tsx` **fica na raiz** (roda fora do layout, tem `<html>` próprio) e por isso não tem acesso ao locale — trata-se com string bilíngue fixa ou pt-BR mesmo.

### 2.3 Middleware — o ponto crítico

Hoje `middleware.ts` roda `updateSession` (Supabase) e tem `matcher: ['/', '/admin/:path*']`. Com next-intl o matcher tem que pegar **todas** as páginas. Consequências, cada uma um bug real se ignorada:

1. **Encadeamento de respostas.** O middleware do next-intl faz **rewrite** (`/tournaments` → `/pt-BR/tournaments`) ou **redirect** (`/tournaments` → `/en/tournaments`). O `updateSession` atual cria o próprio `NextResponse.next({ request })` e o recria dentro de `setAll` — isso **descarta o rewrite**. Refatorar `updateSession(request, response)` para receber a resposta do next-intl como carrier e só fazer `response.cookies.set(...)`, sem recriar.
2. **Checagem de rota admin.** `pathname.startsWith('/admin')` passa a ver `/en/admin` e não protege mais nada. Precisa remover o prefixo de locale antes de comparar. Vale para todo `startsWith`/`===` de pathname no middleware.
3. **`redirectTo` do login.** `loginUrl.searchParams.set('redirectTo', pathname)` grava o pathname com prefixo — o redirect pós-login tem que preservar/reconstruir o locale.
4. **Redirect do `last_tournament`.** `NextResponse.redirect(new URL('/tournaments/'+slug))` tem que virar URL com locale. E a comparação `pathname === '/'` idem (item 2).
5. **`updateSession` passa a rodar em toda página** (hoje só `/` e `/admin/*`). É o padrão recomendado do Supabase SSR (refresh de token em toda navegação), mas é mudança de comportamento: mais um `getUser()` por request. Se o custo pesar, dá pra rodar o Supabase condicionalmente por pathname dentro do middleware único.

### 2.4 Links internos

Com `as-needed`, um usuário em `/en/...` que clica num `<Link href="/tournaments">` do `next/link` cru **cai de volta pro pt-BR**. Todo `Link`/`useRouter`/`usePathname`/`redirect` de navegação interna tem que passar a vir de `i18n/navigation.ts`. Varredura mecânica em ~99 `.tsx`.

Efeito colateral já detectável: `components/layout/header.tsx:59` usa `pathname.startsWith(link.href)` pro estado ativo do menu — o `usePathname` do next-intl já devolve o pathname **sem** prefixo, o que conserta isso de graça (com o `usePathname` do `next/navigation`, quebraria em `/en`).

### 2.5 Gate da Fase 0

- URLs pt-BR atuais respondem idênticas (nenhum redirect novo).
- Login, logout e proteção de `/admin` funcionando.
- Redirect do `last_tournament` funcionando para anônimo.
- `/en/tournaments` responde (mesmo ainda em português).
- `npx next lint` com 0 *Error*; e2e existente passando (ver §7).

---

## 3. Fase 1 — Infra de strings

### 3.1 Arquivos de mensagem

`messages/pt-BR.json` e `messages/en.json`, namespaced por superfície:

```
common      nav        footer     auth
home        tournament standings  pairings
players     registration          news
chess       tiebreak   errors
admin.*     (tournaments, rounds, registrations, staff, groups, dev, stats)
chat        tour
```

Volume estimado por varredura de frases: **~700–900 chaves distintas**, ~40% superfície pública / ~60% painel admin.

**Bundle**: passar o JSON inteiro pro `NextIntlClientProvider` empurra tudo pro cliente. Passar **só os namespaces daquele layout** — layout público recebe os namespaces públicos, `app/[locale]/admin/layout.tsx` recebe os `admin.*`. Sem isso o visitante anônimo baixa as ~500 chaves de admin que nunca vai ver.

### 3.2 Extrair labels de `lib/utils/chess.ts`

Hoje o arquivo mistura regra de negócio com texto em português. Mapas a mover para mensagens, mantendo no código só as **chaves**:

- `TOURNAMENT_STATUS_LABELS`, `ROUND_STATUS_LABELS`, `TOURNAMENT_TYPE_LABELS`, `RATING_KIND_LABELS`
- `TIEBREAK_INFO` (textos longos de explicação de critério de desempate)
- `getTournamentStatusLabel(...)` — hoje devolve string pronta; passa a devolver chave de mensagem + os dados (o `registration_closes_by_date` do 3º parâmetro continua igual), e quem renderiza traduz. **Atenção**: essa função tem muitos call sites (admin/page, organizer-home, players, tournament-card, chrome, layouts público e admin) — mesma lista do bug do selo de inscrição registrado no CLAUDE.md. Mudar a assinatura exige varrer todos.
- `TOURNAMENT_STATUS_COLORS`/`ROUND_STATUS_COLORS` **não mudam** (são classes CSS, não texto).

**Não internacionalizar** `todayInSaoPaulo()` nem o `Intl.DateTimeFormat('en-CA', …)` de `chess.ts:99`: o fuso de São Paulo é **regra de negócio** (torneio brasileiro vira o dia no horário de Brasília, não no do visitante), e o `en-CA` ali é só um truque pra formatar `YYYY-MM-DD`. Um inglês vendo o torneio de fora continua no fuso do torneio.

`BR_STATES` fica como está (nomes próprios); só o rótulo "Estado" traduz.

### 3.3 Datas e números

- `lib/utils/date.ts` fixa `ptBR` do date-fns e usa padrão `"dd 'de' MMM 'de' yyyy"` (a preposição é português). Passa a receber o locale e escolher entre `ptBR`/`enUS` + padrão por idioma.
- ~15 chamadas de `toLocaleDateString('pt-BR')` / `toLocaleString('pt-BR')` espalhadas (register, chat-history, native-rounds, relative-time, admin/dev/*, admin/stats, history, registrations, imports). Trocar por formatador de locale ativo. Usar os formatadores do next-intl (`useFormatter`/`getFormatter`) em vez de `Intl` cru: eles são **seguros contra mismatch de hidratação**, que é justamente o risco aqui (servidor e cliente formatando com locale/fuso diferentes).
- `stats/page.tsx:101` `toLocaleString('pt-BR')` em número (separador de milhar) — mesmo tratamento.

### 3.4 `lib/utils/time-control.ts` e `lib/constants/classification-presets.ts`

Rótulos dos presets traduzem; **as chaves (`bullet`/`blitz`/`rapid`/`classical`/`other`) não** — elas vão pro banco em `time_control_kind`.

Ressalva importante nos presets de classificação: os nomes de categoria ("Sub-12", "Absoluto") são **copiados pro banco** quando o torneio é criado. Traduzir o preset muda só torneios **novos**; torneio já criado mantém o nome em português para sempre. Ver §6.

---

## 4. Fase 2 — Detecção + seletor no header

### 4.1 Detecção (no middleware da Fase 0)

Implementar a prioridade da §1.4. Só age quando: request sem prefixo de locale **e** sem cookie `NEXT_LOCALE`. Nesse caso, se geo ≠ BR (ou `Accept-Language` não-pt), redirect 307 para `/en<pathname>` e grava o cookie.

Dev local não tem `x-vercel-ip-country` — cai no `Accept-Language`, então navegador em português continua em pt-BR. Para testar en localmente: seletor do header, ou cookie na mão.

### 4.2 Seletor

`components/ui/locale-toggle.tsx`, ao lado do `ThemeToggle` no header (`header.tsx:71`), mesmo padrão visual.

Com **dois** locales, toggle de dois estados (`PT` / `EN` com ícone de globo) em vez de dropdown — menos clique e menos código. Se um terceiro idioma entrar depois, vira dropdown.

Comportamento: `router.replace(pathname, { locale })` do `i18n/navigation` — preserva pathname e query, grava `NEXT_LOCALE`. Aparecer também no menu mobile (`header.tsx:151+`).

### 4.3 Metadata e SEO

- `<html lang={locale}>` em vez do `pt-BR` fixo (`layout.tsx:55`).
- `metadata` estático → `generateMetadata({ params: { locale } })`: title, description, openGraph traduzidos. Inclui o `appleWebApp.title`.
- `alternates.languages` com `hreflang` pt-BR/en + `x-default`.
- `public/manifest.json` tem `"lang": "pt-BR"` e nome/descrição em português. Manifest por locale é chato (a PWA instala uma vez). Decisão proposta: **manter um manifest só, pt-BR**, e aceitar que o nome instalado da PWA fique em português. Se virar requisito, vira `app/manifest.ts` dinâmico depois.

---

## 5. Fases 3–5 — Tradução das superfícies

Ordem por valor: público primeiro (é quem pode ser estrangeiro), admin depois.

### Fase 3 — Superfície pública (~300–400 chaves)

`app/[locale]/page.tsx` + `components/home/marketing-home.tsx` e `organizer-home.tsx`, `tournaments` (lista, detalhe, standings, rounds, players, participants, register), `players`, `noticias` (moldura da página, não os artigos), `login`, `account`, `components/layout/{header,footer}`, `components/ui/*` (empty-state, share-button, flash-message, spinner, tooltip, relative-time), `components/tournament/*`, `error.tsx`, `not-found.tsx`, `loading.tsx`.

Nota de escopo: o **slug de rota `/noticias` fica em português** nos dois idiomas. Traduzir segmento de rota (`pathnames` do next-intl) é possível, mas quebra URL indexada e não vale a complexidade agora.

### Fase 4 — Painel admin (~400–500 chaves)

`app/[locale]/admin/**` e `components/admin/**`, + `lib/tour/steps.ts` (256 linhas de copy do tour do driver.js).

**Recomendação: fase separada e opcional.** O painel é usado por organizadores brasileiros; o retorno de traduzir 500 chaves de admin é baixo perto das 400 do público. Se o objetivo é "estrangeiro consegue ver e se inscrever num torneio", a Fase 3 já entrega isso. Deixar admin em pt-BR na primeira entrega é uma escolha defensável — mas então o seletor no header precisa continuar visível no admin (o usuário troca e nada muda ali; alternativa é esconder o seletor dentro de `/admin`).

### Fase 5 — Gambito (chatbot) locale-aware

`lib/chat/prompt.ts:34` manda "Responda em português". Passar o locale de `/api/chat/message` até o prompt e instruir o idioma de resposta.

Ressalva: a **KB (`kb_chunks`) é toda em português**. Em `en`, o LLM responde em inglês a partir de contexto português — funciona (é tradução na hora), mas a qualidade fica abaixo do pt-BR e termos podem oscilar. Indexar a KB em inglês é trabalho separado, fora deste plano.

Como as rotas `app/api/*` ficam fora do `[locale]`, o locale precisa ir no corpo/header da requisição — não vem da URL.

---

## 6. Fora de escopo (declarar, não silenciar)

Nada disto é traduzido por este plano, e o motivo importa:

- **Conteúdo do banco**: nome de torneio, nome de grupo/categoria, nome de jogador, cidade, local. Digitado pelo organizador, num idioma só. Traduzir exigiria coluna por idioma em várias tabelas.
- **Notícias (`noticias`)**: artigos vivem no banco. Precisaria de coluna `lang` (ou tabela de traduções) + filtro na listagem. Fase própria se virar requisito.
- **Push notifications** (`lib/push.ts`): payload montado no servidor num evento (rodada publicada), sem request do destinatário — não há geo nem cookie. O idioma teria que vir de **preferência gravada**: coluna `user_profiles.locale` (migration nova), gravada pelo seletor do header. Fase 6 opcional; hoje as notificações continuam em pt-BR.
- **E-mails do Supabase Auth**: templates configurados no dashboard do Supabase, não no código. Suporte a multi-idioma ali é limitado. Fora do escopo de código.
- **`docs/` e `CLAUDE.md`**: documentação interna, permanece em português.
- **Slugs de rota** (`/noticias`, `/tournaments`): §5, Fase 3.

---

## 7. Testes

- **e2e existente** (`admin-panels`, `tournament-lifecycle`, `chat`, `chat-escalation`, `tour`) casa por texto em português. Com pt-BR como default sem prefixo, os specs continuam válidos — **desde que** o Playwright não seja empurrado pro `/en` pela detecção. Fixar `NEXT_LOCALE=pt-BR` via `context.addInitScript`/cookie no setup (mesmo mecanismo que o `chat-escalation.spec.ts` já usa para o `sessionId` — ver a pegadinha registrada no CLAUDE.md).
- **Novo spec**: seletor troca idioma, cookie persiste entre navegações, `/en/tournaments/[slug]` renderiza em inglês.
- **Teste de paridade de chaves** (vitest): `messages/pt-BR.json` e `messages/en.json` têm exatamente o mesmo conjunto de chaves. Barato e pega a regressão mais comum (chave nova só num idioma).
- **Lint**: `npx next lint` 0 *Error*. Vale considerar `eslint-plugin-formatjs`/regra de "no literal string em JSX" **só** nas pastas já traduzidas, pra impedir volta de string crua.

Lembrete de ambiente (CLAUDE.md): telas admin *client-gated* por auth não carregam no browser interno do agente. Validação visual do `/en` no admin precisa de Chrome real; a superfície pública é server-rendered e dá pra ver no preview.

---

## 8. Sequência recomendada e risco

| Fase | Escopo | Risco | Bloqueia |
|---|---|---|---|
| 0 | `[locale]` + middleware + navegação | **Alto** — auth, redirect, cache | todas |
| 1 | mensagens, labels de `chess.ts`, datas | Médio (assinatura de `getTournamentStatusLabel`) | 3, 4 |
| 2 | detecção geo + seletor | Baixo | — |
| 3 | tradução pública | Baixo, volumoso | — |
| 4 | tradução admin (opcional) | Baixo, volumoso | — |
| 5 | Gambito bilíngue | Baixo (qualidade limitada pela KB pt) | — |
| 6 | push por `user_profiles.locale` (opcional, migration) | Baixo | — |

A Fase 0 é a única que pode quebrar o que já funciona. Fazer, verificar o gate da §2.5 e só então seguir.
