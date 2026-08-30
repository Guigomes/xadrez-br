# Templates SQL do import manual (Passo 5)

Rode via `mcp__Supabase__execute_sql`. `execute_sql` não aceita bind params — os dados
parseados (saída de `scripts/parse-chess-results.mjs`) viram um literal `jsonb` colado direto
na query. Troque `<TOURNAMENT_ID>` e o array `jsonb` de cada bloco pelos dados reais antes de
rodar. Depois de CADA bloco, rode a query de conferência que vem logo abaixo dele — não
prossiga pro próximo passo sem confirmar que o anterior gravou o que devia.

**Status de validação:** o template de jogadores (1) foi rodado contra produção nesta sessão
(torneio real, 37 inscritos, resultado conferido linha a linha). Os templates de pareamentos
(2) e classificação (3) portam a mesma lógica dos arquivos `.ts` correspondentes; o lado de
*parsing* (`parse-chess-results.mjs pairings/standings`) foi validado ao vivo contra um torneio
real (`tnr1449184`, incluindo um caso de W.O.), e o lado de *escrita* (os dois blocos `do $$`)
foi validado com dados sintéticos dentro de `begin; ... rollback;` (sem deixar rastro em
produção) — pegou e corrigiu um bug real de cast de enum (`round_status`) nesse processo. O
que **não** foi testado é a combinação: escrever pareamentos/classificação de um torneio de
verdade, vindos do chess-results, ponta a ponta. Rode a query de conferência de cada bloco com
atenção antes de seguir pro próximo.

## 0. Helper de normalização de nome (rode uma vez, é idempotente)

Só é necessário pros templates 2 e 3 (casamento de jogador por nome). Reimplementa
`normalizeNameKey` de `../xadrez-br-cron/src/normalize.ts` em SQL puro (sem depender da
extension `unaccent`, que não está instalada neste projeto — ver nota abaixo se preferir
instalá-la em vez disso).

```sql
create or replace function chess_normalize_name_key(p text) returns text
language sql immutable as $$
  select coalesce(
    (select string_agg(w, ' ' order by w)
     from unnest(
       regexp_split_to_array(
         trim(
           translate(
             lower(replace(coalesce(p, ''), ',', ' ')),
             'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
             'aaaaaaeeeeiiiiooooouuuucnyy'
           )
         ),
         '\s+'
       )
     ) as w
     where w <> ''
    ),
    ''
  );
$$;
```
> Se preferir a extension nativa (`create extension if not exists unaccent;`) em vez desse
> `translate()` manual, tudo bem — só não faça isso sem avisar o usuário, é uma mudança de
> schema fora do escopo do import em si.

Confira: `select chess_normalize_name_key('Gabriel Felix Vilela, Vitor');` deve devolver as
mesmas 4 palavras que `chess_normalize_name_key('Vitor Gabriel Felix Vilela')` (ordem
alfabética cancela a inversão "Sobrenome, Nome").

## 1. Jogadores + categorias (validado)

Substitua `<TOURNAMENT_ID>` e o array de participantes (saída de `parse-chess-results.mjs
players <url>` — copie o JSON inteiro).

```sql
do $$
declare
  v_tournament_id uuid := '<TOURNAMENT_ID>';
  v_participants jsonb := '<COLE AQUI O JSON DE participants>'::jsonb;
  v_cat_name text;
  p jsonb;
  v_player_id uuid;
  v_category_id uuid;
begin
  for v_cat_name in select distinct value->>'category' from jsonb_array_elements(v_participants) as value where value->>'category' is not null
  loop
    if not exists (select 1 from tournament_categories where tournament_id = v_tournament_id and name = v_cat_name) then
      insert into tournament_categories (tournament_id, name, pairing_group_id) values (v_tournament_id, v_cat_name, null);
    end if;
  end loop;

  for p in select * from jsonb_array_elements(v_participants)
  loop
    v_player_id := null;
    v_category_id := null;

    if p->>'category' is not null then
      select id into v_category_id from tournament_categories where tournament_id = v_tournament_id and name = p->>'category';
    end if;

    -- 1) casa por fide_id (não sobrescreve full_name — só enriquece cadastro)
    if p->>'fideId' is not null then
      select id into v_player_id from players where fide_id = p->>'fideId' limit 1;
      if v_player_id is not null then
        update players set
          city = coalesce(p->>'city', city),
          rating_std = coalesce((p->>'ratingStd')::smallint, rating_std),
          federation = coalesce(federation, 'BRA')
        where id = v_player_id;
      end if;
    end if;

    -- 2) senão, nome exato (case-insensitive)
    if v_player_id is null then
      select id into v_player_id from players where lower(full_name) = lower(p->>'fullName') limit 1;
      if v_player_id is not null then
        update players set
          fide_id = coalesce(fide_id, p->>'fideId'),
          city = coalesce(p->>'city', city),
          rating_std = coalesce((p->>'ratingStd')::smallint, rating_std)
        where id = v_player_id;
      end if;
    end if;

    -- 3) senão, cria
    if v_player_id is null then
      insert into players (full_name, fide_id, federation, rating_std, city)
      values (p->>'fullName', p->>'fideId', 'BRA', (p->>'ratingStd')::smallint, p->>'city')
      returning id into v_player_id;
    end if;

    if exists (select 1 from tournament_players where tournament_id = v_tournament_id and player_id = v_player_id) then
      update tournament_players set
        initial_ranking = (p->>'initialRanking')::smallint,
        category_id = v_category_id
      where tournament_id = v_tournament_id and player_id = v_player_id;
    else
      insert into tournament_players (tournament_id, player_id, initial_ranking, category_id, pairing_group_id)
      values (v_tournament_id, v_player_id, (p->>'initialRanking')::smallint, v_category_id, null);
    end if;
  end loop;
end $$;
```

**Conferência:**
```sql
select count(*) from tournament_players where tournament_id = '<TOURNAMENT_ID>';
select tp.initial_ranking, p.full_name, p.fide_id, tc.name as category
from tournament_players tp
join players p on p.id = tp.player_id
left join tournament_categories tc on tc.id = tp.category_id
where tp.tournament_id = '<TOURNAMENT_ID>'
order by tp.initial_ranking;
```
Confira: contagem bate com `participants.length`, nenhum `full_name` vazio, `fide_id` batendo
pra quem tinha na planilha.

> **Só vale pra torneio novo sem `tournament_players` prévio e sem outros grupos no mesmo
> torneio.** Ver "Limitações conhecidas" no `SKILL.md` antes de rodar numa reexecução ou num
> torneio multi-grupo — este template não tem a lógica de homônimo-entre-grupos nem a de
> remover quem saiu da planilha que o worker real tem.

## 2. Pareamentos de uma rodada (não testado em produção — revise a conferência com atenção)

Rode o helper da seção 0 primeiro. Substitua `<TOURNAMENT_ID>`, `<ROUND_NUMBER>` e o array
`v_pairings` (saída de `parse-chess-results.mjs pairings <url> <n>`, campo `.pairings`).

```sql
do $$
declare
  v_tournament_id uuid := '<TOURNAMENT_ID>';
  v_round_number smallint := <ROUND_NUMBER>;
  v_pairings jsonb := '<COLE AQUI O JSON de .pairings>'::jsonb;
  v_round_id uuid;
  v_round_status round_status;
  v_desired round_status;
  p jsonb;
  v_white_tp uuid;
  v_black_tp uuid;
  v_all_final boolean := true;
  v_any boolean := false;
begin
  select id, status into v_round_id, v_round_status
  from rounds
  where tournament_id = v_tournament_id and round_number = v_round_number and pairing_group_id is null;

  if v_round_id is null then
    insert into rounds (tournament_id, round_number, status, pairing_group_id)
    values (v_tournament_id, v_round_number, 'pending', null)
    returning id, status into v_round_id, v_round_status;
  end if;

  -- idempotente: substitui os pareamentos desta rodada a cada reexecução
  delete from pairings where round_id = v_round_id;

  for p in select * from jsonb_array_elements(v_pairings)
  loop
    v_any := true;

    select tp.id into v_white_tp
    from tournament_players tp join players pl on pl.id = tp.player_id
    where tp.tournament_id = v_tournament_id
      and chess_normalize_name_key(pl.full_name) = chess_normalize_name_key(p->>'whiteName')
    limit 1;
    if v_white_tp is null and p->>'whiteNo' is not null then
      select id into v_white_tp from tournament_players where tournament_id = v_tournament_id and initial_ranking = (p->>'whiteNo')::smallint;
    end if;

    v_black_tp := null;
    if p->>'blackName' is not null then
      select tp.id into v_black_tp
      from tournament_players tp join players pl on pl.id = tp.player_id
      where tp.tournament_id = v_tournament_id
        and chess_normalize_name_key(pl.full_name) = chess_normalize_name_key(p->>'blackName')
      limit 1;
      if v_black_tp is null and p->>'blackNo' is not null then
        select id into v_black_tp from tournament_players where tournament_id = v_tournament_id and initial_ranking = (p->>'blackNo')::smallint;
      end if;
    end if;

    if v_white_tp is null and v_black_tp is null then
      continue; -- ninguém dos dois lados casou — não sobra nada útil pra gravar
    end if;

    insert into pairings (tournament_id, round_id, board_number, white_tp_id, black_tp_id, result, white_points, black_points, is_bye)
    values (
      v_tournament_id, v_round_id, (p->>'board')::smallint, v_white_tp, v_black_tp,
      (p->>'result')::game_result, (p->>'whitePoints')::numeric, (p->>'blackPoints')::numeric,
      (p->>'isBye')::boolean
    );

    if (p->>'result') = '*' then v_all_final := false; end if;
  end loop;

  if v_any then
    -- cast explícito pro enum: `case when ... then 'finished' else 'ongoing' end`
    -- sem cast dá erro "operator does not exist: round_status = text" — o literal
    -- de dentro do CASE não herda o tipo da coluna como um `column = 'literal'`
    -- direto herdaria. Achado testando este template contra o banco.
    v_desired := case when v_all_final then 'finished' else 'ongoing' end;
    if v_round_status is distinct from v_desired then
      update rounds set status = v_desired where id = v_round_id;
    end if;
  end if;
end $$;
```

**Conferência:**
```sql
select r.round_number, r.status, count(pr.*) as pareamentos,
  count(*) filter (where pr.white_tp_id is null or pr.black_tp_id is null) as lados_nao_casados
from rounds r left join pairings pr on pr.round_id = r.id
where r.tournament_id = '<TOURNAMENT_ID>' and r.round_number = <ROUND_NUMBER>
group by r.round_number, r.status;
```
Confira: `pareamentos` bate com `.pairings.length` do JSON parseado (exceto byes, que não têm
`black_tp_id` — isso é esperado, não conte como "não casado"). Se `lados_nao_casados` estiver
alto, o nome na planilha de pareamento provavelmente diverge da de inscritos (grafia, nome do
meio) — compare manualmente um exemplo antes de seguir pra próxima rodada.

## 3. Classificação (não testado em produção — revise a conferência com atenção)

Rode depois de importar todas as rodadas disponíveis. Substitua `<TOURNAMENT_ID>` e o array
`v_rows` (saída de `parse-chess-results.mjs standings <url>`, campo `.rows`); `<COMPLETED_ROUND>`
é o campo `.completedRound` da mesma saída (pode ser `null`).

```sql
do $$
declare
  v_tournament_id uuid := '<TOURNAMENT_ID>';
  v_completed_round smallint := <COMPLETED_ROUND_OU_NULL>;
  v_rows jsonb := '<COLE AQUI O JSON de .rows>'::jsonb;
  r jsonb;
  v_tp_id uuid;
  v_has_results boolean := false;
begin
  for r in select * from jsonb_array_elements(v_rows)
  loop
    select id into v_tp_id from tournament_players
    where tournament_id = v_tournament_id and initial_ranking = (r->>'initialRanking')::smallint;
    if v_tp_id is null then continue; end if;

    if (r->>'points')::numeric > 0 then v_has_results := true; end if;

    insert into standings (tournament_id, tournament_player_id, rank, points, buchholz, buchholz_cut1, sonneborn_berger, updated_at)
    values (
      v_tournament_id, v_tp_id, (r->>'rank')::smallint, (r->>'points')::numeric,
      (r->>'buchholz')::numeric, (r->>'buchholzCut1')::numeric, (r->>'sonnebornBerger')::numeric, now()
    )
    on conflict (tournament_id, tournament_player_id) do update set
      rank = excluded.rank, points = excluded.points, buchholz = excluded.buchholz,
      buchholz_cut1 = excluded.buchholz_cut1, sonneborn_berger = excluded.sonneborn_berger, updated_at = now();

    update tournament_players set
      current_score = (r->>'points')::numeric,
      current_rank = (r->>'rank')::smallint,
      buchholz = (r->>'buchholz')::numeric,
      buchholz_cut1 = (r->>'buchholzCut1')::numeric,
      sonneborn_berger = (r->>'sonnebornBerger')::numeric
    where id = v_tp_id;
  end loop;

  if v_has_results then
    if v_completed_round is not null then
      update rounds set status = 'finished'
      where tournament_id = v_tournament_id and pairing_group_id is null and status = 'ongoing' and round_number <= v_completed_round;
    else
      update rounds set status = 'finished'
      where id = (
        select id from rounds
        where tournament_id = v_tournament_id and pairing_group_id is null and status = 'ongoing'
        order by round_number desc limit 1
      );
    end if;
  end if;
end $$;
```

**Conferência:**
```sql
select count(*) from standings where tournament_id = '<TOURNAMENT_ID>';
select r.round_number, r.status from rounds where tournament_id = '<TOURNAMENT_ID>' order by r.round_number;
```
Confira: contagem de `standings` bate com `.rows.length` (menos quem não casou por
`initial_ranking`), e as rodadas que já tinham todos os resultados aparecem `finished`.
