# XadrezBR – Torneios de Xadrez

MVP de sistema web para torneios de xadrez com foco em usabilidade mobile, acompanhamento de jogadores e experiência para público e organizadores.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | Next.js 15 (App Router) + TypeScript |
| Estilo | Tailwind CSS |
| Estado / cache | TanStack Query v5 |
| Backend / Auth | Supabase (PostgreSQL + Auth + RLS) |
| Lógica server-side | Supabase SQL functions + RPC |
| Deploy | Vercel |
| PWA | next-pwa |

---

## Funcionalidades do MVP

### Públicas
- Página inicial com torneios em andamento e inscrições abertas
- Lista e busca de torneios (nome, cidade, estado, status)
- Detalhe do torneio (info, rodadas, participantes, classificação)
- Emparceiramentos de cada rodada com atualização automática
- Classificação com desempates (Buchholz, BH-1, Sonneborn-Berger) e tooltips explicativos
- Perfil do jogador no torneio (stats, histórico rodada-a-rodada)
- Perfil global do jogador (ratings, histórico de torneios)
- Busca de jogadores
- Botão "seguir jogador" para usuários logados
- Compartilhamento de página (Web Share API / clipboard)
- Modo escuro / claro

### Administrativas
- Login de organizador
- Criar e editar torneio
- Controle de status (rascunho → inscrições → em andamento → encerrado)
- Cadastrar jogadores (busca de existentes ou criação manual)
- Criar rodadas manualmente
- Lançar/corrigir resultados de partidas
- Recálculo automático de classificação e desempates via RPC

---

## Setup local

### 1. Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com) (plano gratuito funciona)

### 2. Instalar dependências

```bash
cd chess-viewer
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Edite `.env.local` com os valores do seu projeto Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Configurar banco de dados no Supabase

No **SQL Editor** do Supabase, execute os arquivos na ordem:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_functions.sql
supabase/migrations/004_registration_period.sql
```

### 5. Inserir dados de exemplo (opcional)

```sql
-- Execute no SQL Editor do Supabase:
-- supabase/seed.sql
```

> **Atenção:** o seed usa um UUID fixo como `created_by`. Para que os torneios sejam editáveis no painel admin, crie uma conta via `/login` e atualize o campo `created_by` dos torneios com o UUID real do usuário criado, ou defina sua conta como `admin` na tabela `user_profiles`.

```sql
-- Promover usuário a admin (substitua o email):
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'seuemail@exemplo.com';
```

### 6. Gerar ícones PWA

```bash
npm install --save-dev sharp
npm run generate-icons
```

### 7. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## Estrutura do projeto

```
chess-viewer/
├── app/
│   ├── layout.tsx                  # Root layout + Providers
│   ├── page.tsx                    # Home
│   ├── not-found.tsx
│   ├── error.tsx
│   ├── providers.tsx               # TanStack Query provider
│   ├── tournaments/
│   │   ├── page.tsx                # Lista + busca
│   │   └── [slug]/
│   │       ├── layout.tsx          # Header do torneio + abas
│   │       ├── page.tsx            # Visão geral
│   │       ├── participants/page.tsx
│   │       ├── rounds/
│   │       │   ├── page.tsx        # Lista de rodadas
│   │       │   └── [roundNumber]/
│   │       │       ├── page.tsx
│   │       │       └── round-detail-client.tsx
│   │       ├── standings/page.tsx
│   │       └── players/[tpId]/page.tsx
│   ├── players/
│   │   ├── page.tsx                # Busca de jogadores
│   │   └── [id]/page.tsx           # Perfil global
│   ├── login/page.tsx
│   └── admin/
│       ├── layout.tsx              # Guard de autenticação
│       ├── page.tsx                # Dashboard
│       └── tournaments/
│           ├── new/page.tsx
│           └── [slug]/
│               ├── edit/page.tsx
│               ├── players/page.tsx
│               └── rounds/page.tsx
│
├── components/
│   ├── layout/
│   │   ├── header.tsx
│   │   └── footer.tsx
│   ├── ui/
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── empty-state.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── share-button.tsx
│   │   ├── spinner.tsx
│   │   ├── theme-toggle.tsx
│   │   └── tooltip.tsx
│   └── tournament/
│       ├── pairings-list.tsx
│       ├── standings-table.tsx
│       ├── tournament-card.tsx
│       ├── tournament-form.tsx
│       └── tournament-tabs.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   ├── server.ts               # Server Component client
│   │   └── middleware.ts           # Session refresh
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-player.ts
│   │   └── use-tournament.ts
│   └── utils/
│       ├── chess.ts                # Labels, formatação, desempates
│       ├── cn.ts                   # clsx + twMerge
│       └── date.ts                 # date-fns helpers
│
├── types/
│   └── database.ts                 # Todos os tipos TypeScript
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   ├── 003_functions.sql
│   │   └── 004_registration_period.sql
│   └── seed.sql
│
├── public/
│   ├── manifest.json               # PWA manifest
│   └── icons/                      # Ícones PWA
│
└── scripts/
    └── generate-icons.mjs          # Gera PNGs a partir do SVG
```

---

## Modelagem do banco

### Entidades principais

| Tabela | Descrição |
|---|---|
| `user_profiles` | Perfis de usuário (roles: admin, organizer, arbiter, public_user) |
| `players` | Cadastro global de jogadores (FIDE ID, CBX ID, ratings) |
| `tournaments` | Torneios (slug, status, visibilidade, datas) |
| `tournament_categories` | Sub-14, Absoluto, etc. |
| `tournament_players` | Relação jogador ↔ torneio (score, rank, desempates) |
| `rounds` | Rodadas (pending → ongoing → finished) |
| `pairings` | Emparelhamentos com resultado |
| `standings` | Snapshot materializado da classificação |
| `player_follows` | Jogadores seguidos por usuários |

### Funções RPC

| Função | Descrição |
|---|---|
| `recalculate_standings(tournament_id)` | Recalcula pontos, Buchholz, BH-1, SB e rank |
| `get_tournament_standings(tournament_id)` | Retorna classificação com dados do jogador |
| `get_player_tournament_history(tournament_id, tp_id)` | Histórico rodada-a-rodada |
| `get_round_pairings(round_id)` | Emparelhamentos com nomes e ratings |
| `search_tournaments(query, state, status)` | Busca paginada de torneios públicos |

---

## Deploy no Vercel

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Adicionar variáveis de ambiente no painel do Vercel:
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY
#    SUPABASE_SERVICE_ROLE_KEY
#    NEXT_PUBLIC_APP_URL (URL de produção)
```

No Supabase, adicione a URL de produção em:
**Authentication → URL Configuration → Site URL** e **Redirect URLs**.

---

## Arquitetura

### Decisões de design

- **Server Components** para páginas com dados estáticos ou SSR (detalhe do torneio, layout, metadata)
- **Client Components** apenas onde necessário: busca interativa, auto-refresh, formulários, toggle de tema
- **TanStack Query** gerencia cache, refetch automático e loading states dos dados dinâmicos
- **RLS no Supabase** como camada primária de segurança — nunca confia só no front-end
- **SQL functions/RPC** para cálculos pesados (standings, desempates) — mantém lógica perto dos dados
- **Slug** como identificador público dos torneios — URLs amigáveis e compartilháveis

### Fluxo de atualização de resultados (admin)

```
Árbitro lança resultado
  → UPDATE pairings SET result = '1-0'
  → CALL recalculate_standings(tournament_id)
    → Recalcula pontos de cada jogador
    → Calcula Buchholz, BH-1, Sonneborn-Berger
    → Atualiza rankings
  → TanStack Query invalida standings + pairings
  → UI atualiza automaticamente
```

---

## Limitações do MVP

| Limitação | Observação |
|---|---|
| Pareamento automático (suíço) | Rodadas são criadas manualmente; não há engine de pareamento |
| Importação Swiss Manager | Não implementado; estrutura pronta para receber |
| Push notifications reais | Apenas polling via `refetchInterval`; FCM/WebPush não implementado |
| Multi-tenant | Sem isolamento por organização; usa `created_by` simples |
| Billing | Não há planos ou pagamentos |
| Validação FIDE completa | Regras simplificadas; sem integração com banco FIDE |

---

## Próximos passos recomendados

### Prioridade alta
- [ ] **Engine de pareamento suíço** – implementar algoritmo Dutch/FIDE em Edge Function ou serviço externo
- [ ] **Importação Swiss Manager** – parser de arquivos `.trf` e `.swsx`
- [ ] **Categorias separadas** – classificação por categoria (Sub-10, Feminino, etc.)

### Prioridade média
- [ ] **PWA Push Notifications** – notificar seguidores quando resultado for lançado (Firebase FCM)
- [ ] **Painel mobile para árbitro** – interface simplificada para lançar resultados no celular em tempo real
- [ ] **Exportação de resultados** – PDF, TRF, planilha
- [ ] **Integração CBX/FIDE** – consultar e sincronizar ratings automaticamente

### Prioridade baixa
- [ ] **Multi-tenant por organização** – isolamento de dados por clube/federação
- [ ] **Histórico de rating** – gráfico de evolução do rating ao longo dos torneios
- [ ] **Premiação detalhada** – configuração de prêmios por posição e categoria
- [ ] **Inscrições online** – formulário público de inscrição com pagamento
