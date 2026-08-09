# Pendências e pontos de preocupação — i18n (pt-BR / es / en)

Complemento do `docs/plano-i18n.md`. Registra **o que foi implementado**, **o que ficou de fora e por quê**, e **os riscos abertos** que precisam de decisão ou de ambiente que o agente não tem.

Data desta rodada: 2026-08-09.

---

## 1. O que foi implementado (scaffolding dormente + Fase 1 parcial)

Tudo aditivo. **Nada disto ativa até a Fase 0 mover a árvore para `app/[locale]`** — as rotas de hoje respondem idênticas (verificado: `/`, `/tournaments`, `/players`, `/login`, `/noticias` → 200 com o plugin já wired).

- **`next-intl@^4.13.5`** instalado (`package.json` + lockfile).
- **`i18n/routing.ts`** — `defineRouting` com `['pt-BR','es','en']`, default `pt-BR`, `localePrefix: 'as-needed'`, `localeDetection: false`.
- **`i18n/detect.ts`** — função PURA `resolveLocale(country, acceptLanguage)` + `primaryLanguage()` + constante `SPANISH_COUNTRIES` (21 países). É a peça que codifica a decisão pt-BR/es/en. **100% testada** (`i18n/__tests__/detect.test.ts`).
- **`i18n/request.ts`** — `getRequestConfig` com fallback de namespace pro pt-BR. Dormente.
- **`i18n/navigation.ts`** — wrappers locale-aware (`Link`/`useRouter`/`usePathname`/`redirect`/`getPathname`). Dormente — nada importa deles ainda.
- **`messages/{pt-BR,es,en}.json`** — seed com a chrome universal: `brand`, `nav`, `account`, `footer` (as strings de `header.tsx` e `footer.tsx`). ~13 chaves × 3 idiomas. É semente, não a superfície inteira.
- **`next.config.js`** — `createNextIntlPlugin('./i18n/request.ts')` envolvendo o config. Só afeta rotas dentro de `app/[locale]`, que ainda não existe → no-op em runtime hoje.
- **Testes** (`i18n/__tests__/`): `detect.test.ts` (detecção) e `messages-parity.test.ts` (paridade de chaves entre os 3 arquivos, comparando cada idioma contra o pt-BR como fonte). 12 casos, todos passando. Rodam no `npx vitest run` normal.

Verificação feita: `npx vitest run` (90 passam), `npx eslint i18n` (limpo), dev server sobe e serve as rotas atuais com o plugin wired.

---

## 2. O que NÃO foi feito — e por que não dá pra fazer com segurança aqui

### 2.1 Fase 0 completa (mover `app/*` → `app/[locale]/*` + reescrever middleware) — BLOQUEADO por ambiente

Esta é a fase de maior risco do plano e **a única que pode quebrar o que já funciona** (§8 do plano). Não foi feita, de propósito. Motivos concretos, não preguiça:

1. **Não dá pra verificar o middleware aqui.** O gate da Fase 0 (§2.5) exige provar que login, logout, proteção de `/admin` e redirect do `last_tournament` continuam funcionando. O browser do sandbox **não alcança o Supabase** (503 Offline — registrado no CLAUDE.md), e as telas admin são client-gated por auth. Não consigo exercer nenhum desses caminhos. Reescrever `middleware.ts` + `lib/supabase/middleware.ts` às cegas e mandar pro deploy (que sai no push pra `main`) é exatamente o cenário a evitar.
2. **O encadeamento de resposta é a parte frágil.** `updateSession` cria e recria o próprio `NextResponse.next({request})` — isso descarta o rewrite do next-intl (§2.3.1 do plano). O conserto exige refatorar a assinatura pra receber a resposta do intl como carrier, e testar que o cookie de auth do Supabase ainda é setado E o rewrite de locale sobrevive. Sem browser real logado, não valido.
3. **Mover a árvore é mecânico mas irreversível de meia-boca.** `app/*` (exceto `app/api`) vai pra `app/[locale]/*`, e TODOS os ~99 `.tsx` com `next/link`/`next/navigation` de navegação interna trocam pro `i18n/navigation`. Fazer metade disso deixa links quebrados (quem está em `/es` cai pro pt-BR). É tudo-ou-nada, e o "tudo" precisa de verificação que não tenho.

**Recomendação:** a Fase 0 é uma sessão própria, feita e verificada em **Chrome real logado**, com o gate da §2.5 batido item por item antes de qualquer push. O scaffolding desta rodada deixa o terreno pronto pra isso (config, detecção, navegação, mensagens já existem).

### 2.2 Extração de strings além da chrome (resto da Fase 1 + Fases 3–4)

Só a chrome (header/footer) foi extraída. As ~700–900 chaves restantes (superfície pública + admin) não. Isso é trabalho volumoso mas de baixo risco — pode ser incremental, superfície por superfície, DEPOIS que a Fase 0 existir (sem `[locale]`, o `NextIntlClientProvider` não tem onde ser montado).

### 2.3 Detecção wired no middleware (Fase 2)

`resolveLocale` existe e está testada, mas **nada a chama** — o middleware que a consumiria é justamente o da Fase 0. O seletor de idioma no header (dropdown de 3 opções) também não foi criado: ele depende do `i18n/navigation` ativo, que depende da árvore movida.

---

## 3. Pontos de preocupação abertos (precisam de decisão do dono)

### 3.1 O nome da marca é "Torneios Xadrez BR" — português puro, em todos os idiomas

Deixei `brand.name` = `"Torneios Xadrez BR"` **igual nos 3 arquivos**, tratando como nome próprio (o plano manda proper names ficarem). Mas ele literalmente lê "Chess Tournaments BR" em português — um inglês/argentino vê um nome que não entende. **Decisão pendente:** a marca é intocável (fica pt em tudo) ou ganha versão localizada ("BR Chess Tournaments" / "Torneos de Ajedrez BR")? Se for localizar, o `copyright` do footer também muda. Não decidi por você.

### 3.2 "Painel" → "Dashboard" (en) / "Panel" (es) — conferir tom

Traduzi `nav.panel` como "Dashboard" (en) e "Panel" (es). "Dashboard" é o termo de produto usual; se preferir "Panel"/"Admin" em inglês, é uma linha. Sem falante nativo revisando, as traduções da chrome são as óbvias — **um hispanofalante/anglófono deveria revisar antes de ir pro público** (§3.1 do plano fala do risco de falso cognato).

### 3.3 `SPANISH_COUNTRIES` é curadoria editorial minha

A lista de 21 países é chute meu (Cone Sul + México + Espanha + Caribe hispano + América Central; Guiné Equatorial incluída por ser hispanofalante oficial). Deixei EUA, Belize, Andorra, Portugal de fora **de propósito**. Se você quer incluir/excluir algum (ex.: EUA por causa da população hispana), é editar o Set em `i18n/detect.ts` — o teste `detect.test.ts` fixa as inclusões/exclusões atuais e vai falhar avisando se mudar, então atualize o teste junto.

### 3.4 Build de produção NÃO foi verificado

O `next.config.js` agora envolve o config com `withNextIntl`. O `npm run build` local **falha com EISDIR no Windows** (ambiente, não código — registrado no CLAUDE.md), e o sandbox não builda. Confirmei que o **dev server** sobe e serve as rotas com o plugin, mas o **build de produção da Vercel é o único gate real** e não passou por ele ainda. Risco baixo (o plugin é padrão e as rotas respondem), mas **não é zero** — ao subir, acompanhar o deploy da Vercel e reverter o wiring do plugin se o build quebrar. O wiring é as 3 linhas no topo + a última linha do `next.config.js`; remover volta ao estado anterior sem tocar em mais nada.

### 3.5 Fallback de mensagem é raso (nível de namespace)

`i18n/request.ts` faz `{ ...ptBR, ...locale }` — se um namespace inteiro faltar em es/en, cai no pt-BR; mas se faltar UMA chave dentro de um namespace, o namespace de es/en (incompleto) ganha e a chave some. A rede real é o teste de paridade, que **falha o build** se as chaves divergirem. Enquanto o teste rodar no CI, ok. Se algum dia o teste for desligado, o fallback raso não segura sozinho.

---

## 4. Como retomar (ordem sugerida)

1. **Fase 0 em Chrome real** (§2.1): mover árvore, reescrever os dois middlewares, trocar navegação nos ~99 arquivos, bater o gate §2.5 logado. Não pushar sem isso.
2. **Fase 2**: wire `resolveLocale` no middleware novo + criar o seletor dropdown no header.
3. **Fases 3–4**: extrair strings superfície por superfície, pt-BR/es/en, mantendo o teste de paridade verde.
4. Revisar §3.1/§3.2 com falante nativo antes de expor `/es` e `/en` ao público.

---

## 5. Arquivos desta rodada

Novos: `i18n/routing.ts`, `i18n/detect.ts`, `i18n/request.ts`, `i18n/navigation.ts`, `i18n/__tests__/detect.test.ts`, `i18n/__tests__/messages-parity.test.ts`, `messages/pt-BR.json`, `messages/es.json`, `messages/en.json`, este arquivo.

Modificados: `package.json` + `package-lock.json` (next-intl), `next.config.js` (plugin wired).

**Não commitado/pushado por padrão** — decisão de subir é sua (ver §3.4 sobre o build de produção não verificado).
