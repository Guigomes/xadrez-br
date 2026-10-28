-- ============================================================
-- Comprovante de pagamento: organizador volta a conseguir abrir
-- ============================================================
-- Bug desde a 011: as policies de leitura/remoção do bucket privado payment-receipts
-- faziam `split_part(name, '/', 1)` DENTRO de uma subconsulta em `tournaments`, e ali
-- `name` sem qualificação resolve para tournaments.name (o nome do torneio), não para
-- storage.objects.name (o caminho do arquivo). A comparação nunca casava: o upload do
-- inscrito funcionava, mas ninguém conseguia gerar a signed URL ("Não foi possível
-- abrir o comprovante.").
--
-- Agora a pasta (<tournament_id>/...) é lida sem subconsulta e a permissão segue
-- is_tournament_organizer (018): dono, organizador da equipe do torneio ou admin — os
-- mesmos que gerenciam as inscrições. O `case` evita erro de cast em caminho que não
-- comece por um UUID (avaliação de AND não tem ordem garantida no Postgres).
--
-- Idempotente (drop if exists + create).

drop policy if exists "payment-receipts: owner can read" on storage.objects;
create policy "payment-receipts: owner can read"
  on storage.objects for select
  using (
    bucket_id = 'payment-receipts'
    and case
      when split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tournament_organizer(split_part(storage.objects.name, '/', 1)::uuid)
      else false
    end
  );

drop policy if exists "payment-receipts: owner can delete" on storage.objects;
create policy "payment-receipts: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'payment-receipts'
    and case
      when split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tournament_organizer(split_part(storage.objects.name, '/', 1)::uuid)
      else false
    end
  );
