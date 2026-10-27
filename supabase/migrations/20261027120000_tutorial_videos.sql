-- Vídeos de tutorial (série do organizador) guardados para o painel do desenvolvedor.
-- Bucket PRIVADO e sem nenhuma policy: só a service_role grava e gera link assinado. A página
-- /admin/dev/tutoriais confere role = admin no servidor antes de gerar o link (1 h).
-- Quando os vídeos forem liberados ao público, a decisão é outra (bucket público ou página aberta).
--
-- Idempotente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutorials', 'tutorials', false, 104857600, array['video/mp4'])
on conflict (id) do nothing;
