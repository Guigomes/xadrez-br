-- ============================================================
-- Chess Viewer – Seed Data (demo / development)
-- ============================================================
-- Run AFTER migrations. Uses fixed UUIDs for reproducibility.
-- ============================================================

-- NOTE: These inserts bypass RLS because they run as a Supabase admin.
-- In production, create real users via the Auth dashboard.

-- ============================================================
-- Demo user (organizer)  – create via Supabase Auth dashboard
-- and then update the profile below with the real UUID.
-- For seeding we use a placeholder UUID.
-- ============================================================

-- Placeholder organizer id (replace with real auth.users.id after signup)
do $$
declare
  v_organizer_id  uuid := 'a0000000-0000-0000-0000-000000000001';
begin

-- ============================================================
-- Players
-- ============================================================

insert into players (id, full_name, federation, state, city, birth_year, rating_std, rating_rpd, cbx_id) values
  ('b0000000-0000-0000-0000-000000000001', 'Lucas Henrique Oliveira',  'BRA', 'SP', 'São Paulo',    2014, 1420, 1510, 'CBX001'),
  ('b0000000-0000-0000-0000-000000000002', 'Mariana Costa Silva',      'BRA', 'SP', 'Campinas',     2013, 1380, 1450, 'CBX002'),
  ('b0000000-0000-0000-0000-000000000003', 'Pedro Augusto Ramos',      'BRA', 'RJ', 'Rio de Janeiro',2015, 1250, 1300, 'CBX003'),
  ('b0000000-0000-0000-0000-000000000004', 'Ana Beatriz Ferreira',     'BRA', 'MG', 'Belo Horizonte',2014, 1190, 1220, 'CBX004'),
  ('b0000000-0000-0000-0000-000000000005', 'Rafael Torres Souza',      'BRA', 'SP', 'Santos',       2016, 1100, 1150, 'CBX005'),
  ('b0000000-0000-0000-0000-000000000006', 'Isabela Nunes Martins',    'BRA', 'RS', 'Porto Alegre', 2015, 1060, 1090, 'CBX006'),
  -- Absoluto players
  ('b0000000-0000-0000-0000-000000000007', 'Carlos Eduardo Mendes',    'BRA', 'SP', 'São Paulo',    1990, 1980, 2050, 'CBX007'),
  ('b0000000-0000-0000-0000-000000000008', 'Fernanda Lima Carvalho',   'BRA', 'RJ', 'Niterói',      1995, 1820, 1870, 'CBX008'),
  ('b0000000-0000-0000-0000-000000000009', 'Gabriel Pereira Santos',   'BRA', 'SP', 'São Bernardo', 1988, 1760, 1800, 'CBX009'),
  ('b0000000-0000-0000-0000-000000000010', 'Juliana Rocha Alves',      'BRA', 'MG', 'Uberlândia',   1992, 1690, 1720, 'CBX010'),
  ('b0000000-0000-0000-0000-000000000011', 'Thiago Barbosa Lima',      'BRA', 'PR', 'Curitiba',     1985, 1640, 1660, 'CBX011'),
  ('b0000000-0000-0000-0000-000000000012', 'Camila Araújo Nascimento', 'BRA', 'SC', 'Florianópolis',1998, 1590, 1610, 'CBX012')
on conflict (id) do nothing;

-- ============================================================
-- Tournament 1 – Torneio Infantil (ongoing)
-- ============================================================

insert into tournaments (
  id, slug, name, description, city, state, venue,
  organizer_name, chief_arbiter, time_control, tournament_type,
  start_date, end_date, rounds_count, status, is_public, created_by
) values (
  'c0000000-0000-0000-0000-000000000001',
  'copa-primavera-infantil-2024',
  'Copa Primavera de Xadrez Infantil 2024',
  'Torneio infantil de xadrez no sistema suíço para jovens talentos entre 7 e 16 anos. Categorias Sub-10, Sub-12, Sub-14 e Sub-16.',
  'São Paulo', 'SP',
  'Clube de Xadrez Paulistano – Rua Augusta, 1200',
  'Clube de Xadrez Paulistano',
  'José Carlos Neves',
  'G/30+10',
  'swiss',
  '2024-11-15', '2024-11-17',
  5, 'ongoing', true,
  v_organizer_id
) on conflict (id) do nothing;

-- Categories for tournament 1
insert into tournament_categories (id, tournament_id, name, max_age, min_age) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Sub-10', 10, 0),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Sub-12', 12, 11),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Sub-14', 14, 13)
on conflict (id) do nothing;

-- Tournament players for tournament 1
insert into tournament_players (id, tournament_id, player_id, category_id, initial_ranking, current_score, current_rank, status) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 1, 2.5, 1, 'active'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 2, 2.0, 2, 'active'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 3, 1.5, 3, 'active'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', 4, 1.5, 4, 'active'),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 5, 1.0, 5, 'active'),
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 6, 0.5, 6, 'active')
on conflict (id) do nothing;

-- Rounds for tournament 1
insert into rounds (id, tournament_id, round_number, status, published_at) values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 'finished', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2, 'finished', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 3, 'ongoing',  null),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 4, 'pending',  null),
  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 5, 'pending',  null)
on conflict (id) do nothing;

-- Pairings Round 1 (all finished)
insert into pairings (id, tournament_id, round_id, board_number, white_tp_id, black_tp_id, result, white_points, black_points, is_bye) values
  ('g0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1, 'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', '1-0',       1.0, 0.0, false),
  ('g0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 2, 'e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004', '1/2-1/2',   0.5, 0.5, false),
  ('g0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 3, 'e0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000006', '1-0',       1.0, 0.0, false)
on conflict (id) do nothing;

-- Pairings Round 2 (all finished)
insert into pairings (id, tournament_id, round_id, board_number, white_tp_id, black_tp_id, result, white_points, black_points, is_bye) values
  ('g0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 1, 'e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', '1-0',       1.0, 0.0, false),
  ('g0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 2, 'e0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', '0-1',       0.0, 1.0, false),
  ('g0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 3, 'e0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000005', '0-1',       0.0, 1.0, false)
on conflict (id) do nothing;

-- Pairings Round 3 (ongoing – no results yet)
insert into pairings (id, tournament_id, round_id, board_number, white_tp_id, black_tp_id, result, white_points, black_points, is_bye) values
  ('g0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 1, 'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', '*',         null, null, false),
  ('g0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 2, 'e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', '*',         null, null, false),
  ('g0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 3, 'e0000000-0000-0000-0000-000000000005', null,                                   'bye',       1.0, null, true)
on conflict (id) do nothing;

-- Standings for tournament 1
insert into standings (tournament_id, tournament_player_id, points, rank, buchholz, buchholz_cut1, sonneborn_berger, games_played, wins, draws, losses) values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 2.5, 1, 3.5, 2.5, 2.0, 2, 2, 1, 0),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 2.0, 2, 3.0, 2.0, 1.5, 2, 1, 0, 1),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 1.5, 3, 2.5, 2.0, 0.5, 2, 0, 1, 1),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 1.5, 4, 2.5, 2.0, 0.5, 2, 0, 1, 1),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 1.0, 5, 1.5, 1.0, 0.0, 2, 1, 0, 1),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000006', 0.5, 6, 1.5, 1.0, 0.0, 2, 0, 0, 2)
on conflict (tournament_id, tournament_player_id) do nothing;

-- ============================================================
-- Tournament 2 – Torneio Absoluto (finished)
-- ============================================================

insert into tournaments (
  id, slug, name, description, city, state, venue,
  organizer_name, chief_arbiter, time_control, tournament_type,
  start_date, end_date, rounds_count, status, is_public, created_by
) values (
  'c0000000-0000-0000-0000-000000000002',
  'campeonato-paulista-absoluto-2024',
  'Campeonato Paulista Absoluto 2024',
  'Principal torneio do calendário paulista. Sistema suíço com 7 rodadas. Premiação em dinheiro para os 5 primeiros colocados.',
  'São Paulo', 'SP',
  'Associação Paulista de Xadrez – Av. Paulista, 900',
  'Associação Paulista de Xadrez',
  'Maria Helena Fonseca',
  '90''+30"',
  'swiss',
  '2024-10-05', '2024-10-06',
  7, 'finished', true,
  v_organizer_id
) on conflict (id) do nothing;

-- Tournament players for tournament 2
insert into tournament_players (id, tournament_id, player_id, initial_ranking, current_score, current_rank, buchholz, buchholz_cut1, sonneborn_berger, status) values
  ('e0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000007', 1, 5.5, 1, 22.5, 19.0, 17.25, 'active'),
  ('e0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000008', 2, 5.0, 2, 21.5, 18.0, 15.50, 'active'),
  ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000009', 3, 4.5, 3, 20.0, 17.0, 13.75, 'active'),
  ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000010', 4, 4.0, 4, 19.0, 16.5, 11.00, 'active'),
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000011', 5, 3.5, 5, 18.5, 15.5,  9.50, 'active'),
  ('e0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000012', 6, 3.0, 6, 17.0, 14.0,  8.00, 'active')
on conflict (id) do nothing;

-- Rounds for tournament 2 (all finished)
insert into rounds (id, tournament_id, round_number, status, published_at) values
  ('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 1, 'finished', now() - interval '10 days'),
  ('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 2, 'finished', now() - interval '10 days'),
  ('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000002', 3, 'finished', now() - interval '9 days'),
  ('f0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000002', 4, 'finished', now() - interval '9 days'),
  ('f0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002', 5, 'finished', now() - interval '9 days'),
  ('f0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 6, 'finished', now() - interval '8 days'),
  ('f0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 7, 'finished', now() - interval '8 days')
on conflict (id) do nothing;

-- Standings for tournament 2
insert into standings (tournament_id, tournament_player_id, points, rank, buchholz, buchholz_cut1, sonneborn_berger, games_played, wins, draws, losses) values
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000007', 5.5, 1, 22.5, 19.0, 17.25, 7, 5, 1, 1),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000008', 5.0, 2, 21.5, 18.0, 15.50, 7, 4, 2, 1),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000009', 4.5, 3, 20.0, 17.0, 13.75, 7, 4, 1, 2),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000010', 4.0, 4, 19.0, 16.5, 11.00, 7, 3, 2, 2),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000011', 3.5, 5, 18.5, 15.5,  9.50, 7, 3, 1, 3),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000012', 3.0, 6, 17.0, 14.0,  8.00, 7, 2, 2, 3)
on conflict (tournament_id, tournament_player_id) do nothing;

end $$;
