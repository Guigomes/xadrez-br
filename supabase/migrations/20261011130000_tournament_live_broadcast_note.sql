-- Observação curta da transmissão ao vivo (ex.: "São transmitidas as 15 primeiras mesas."),
-- mostrada no aviso da aba "Acompanhe ao Vivo". Varia por torneio, por isso não é texto fixo.
alter table tournaments add column if not exists live_broadcast_note text;
