'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { TourTriggerButton } from '@/components/admin/tour-trigger-button';
import { DimensionQuestion, Chip, CustomRangeForm } from '@/components/admin/classification-ui';
import { applyClassificationDraft } from '@/lib/utils/create-tournament-setup';
import { generateClassificationCells } from '@/lib/utils/classification-match';
import {
  AGE_PRESETS, RATING_PRESETS, CLASSIFICATION_COUNT_WARNING_THRESHOLD,
  type AgePreset, type RatingPreset,
} from '@/lib/constants/classification-presets';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { slugify } from '@/lib/utils/chess';
import type { TournamentFormValues } from '@/types/database';
import { useUser, useProfile } from '@/lib/hooks/use-auth';

const FORM_ID = 'new-tournament-form';

export default function NewTournamentPage() {
  const router = useRouter();
  const { user } = useUser();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Rascunho de Classificação — nada disso existe em banco ainda (categoria
  // tem FK pro torneio, que só nasce no submit). Mesma pergunta/aparência da
  // aba Editar (components/admin/classification-setup.tsx), só que em estado
  // local até "Criar torneio".
  const [ageOn, setAgeOn] = useState(false);
  const [ratingOn, setRatingOn] = useState(false);
  const [femaleOn, setFemaleOn] = useState(false);
  const [ageBands, setAgeBands] = useState<AgePreset[]>([]);
  const [ratingBands, setRatingBands] = useState<RatingPreset[]>([]);
  const [customAge, setCustomAge] = useState({ name: '', min: '', max: '' });
  const [customRating, setCustomRating] = useState({ name: '', min: '', max: '' });

  const previewCells = useMemo(
    () => generateClassificationCells({
      ageBands: ageOn ? ageBands : [],
      ratingBands: ratingOn ? ratingBands : [],
      female: femaleOn,
    }),
    [ageOn, ratingOn, femaleOn, ageBands, ratingBands]
  );
  const customAgeBands = ageBands.filter((b) => !AGE_PRESETS.some((p) => p.name === b.name));
  const customRatingBands = ratingBands.filter((b) => !RATING_PRESETS.some((p) => p.name === b.name));

  const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;

  useEffect(() => {
    if (!loadingProfile && profile && !canCreate) router.replace('/admin');
  }, [loadingProfile, profile, canCreate, router]);

  if (loadingProfile || !profile || !canCreate) return <PageSpinner />;

  function toggleAgePreset(preset: AgePreset) {
    setAgeBands((prev) => (prev.some((b) => b.name === preset.name) ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]));
  }
  function toggleRatingPreset(preset: RatingPreset) {
    setRatingBands((prev) => (prev.some((b) => b.name === preset.name) ? prev.filter((b) => b.name !== preset.name) : [...prev, preset]));
  }
  function addCustomAge() {
    if (!customAge.name.trim()) { setError('Informe o nome da faixa de idade.'); return; }
    setError('');
    setAgeBands((prev) => [...prev, {
      name: customAge.name.trim(),
      minAge: customAge.min ? Number(customAge.min) : null,
      maxAge: customAge.max ? Number(customAge.max) : null,
    }]);
    setCustomAge({ name: '', min: '', max: '' });
  }
  function addCustomRating() {
    if (!customRating.name.trim()) { setError('Informe o nome da faixa de rating.'); return; }
    setError('');
    setRatingBands((prev) => [...prev, {
      name: customRating.name.trim(),
      minRating: customRating.min ? Number(customRating.min) : null,
      maxRating: customRating.max ? Number(customRating.max) : null,
    }]);
    setCustomRating({ name: '', min: '', max: '' });
  }

  async function handleSubmit(values: TournamentFormValues) {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const slug = slugify(values.name) + '-' + values.start_date.replace(/-/g, '');
      // Torneio criado por aqui é sempre nativo — modo não é escolha do
      // organizador (torneios importados só existem via painel de dev).
      const { data: tournament, error: err } = await supabase
        .from('tournaments')
        .insert({ ...values, mode: 'native', slug, created_by: user.id })
        .select('id').single();
      if (err) throw err;

      await applyClassificationDraft(tournament.id, { ageOn, ratingOn, femaleOn, ageBands, ratingBands });

      // Direto pra aba Emparceiramento — é a única decisão que falta antes
      // de poder publicar (?criado=1 aciona o popup de aviso lá, ver
      // groups/page.tsx). Torneio nasce em rascunho: sem isso, o organizador
      // só ia notar a pendência ao tentar publicar e ver o botão travado.
      router.push(`/admin/tournaments/${slug}/groups?criado=1`);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar torneio.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <TourTriggerButton
          stepId="info-basica"
          label="❔ Dicas de como criar um torneio"
          className="mb-2 inline-flex rounded-full bg-brand-50 dark:bg-brand-950/50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors"
        />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Novo torneio</h1>
      </div>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <TournamentForm onSubmit={handleSubmit} loading={loading} formId={FORM_ID} />

      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Classificação</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Ranking de premiação: cada jogador cai numa faixa (ou só no Geral),
            classificado automaticamente pelos próprios dados — idade, rating e sexo.
          </p>
        </div>

        <section className="card p-5 space-y-3" data-tour="secao-classificacao">
          <DimensionQuestion
            dataTour="pergunta-idade"
            question="Seu torneio vai ter classificação separada por idade?"
            on={ageOn}
            onToggle={() => { setAgeOn((v) => !v); if (ageOn) setAgeBands([]); }}
          >
            <div className="flex flex-wrap gap-1.5">
              {AGE_PRESETS.map((p) => (
                <Chip key={p.name} active={ageBands.some((b) => b.name === p.name)} onClick={() => toggleAgePreset(p)}>
                  {p.name}
                </Chip>
              ))}
            </div>
            {customAgeBands.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customAgeBands.map((b) => (
                  <Chip key={b.name} active onClick={() => toggleAgePreset(b)}>{b.name}</Chip>
                ))}
              </div>
            )}
            <CustomRangeForm label="idade" value={customAge} onChange={setCustomAge} onAdd={addCustomAge} />
          </DimensionQuestion>

          <DimensionQuestion
            dataTour="pergunta-rating"
            question="Seu torneio vai ter classificação separada por rating?"
            on={ratingOn}
            onToggle={() => { setRatingOn((v) => !v); if (ratingOn) setRatingBands([]); }}
          >
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Rating não é pedido na inscrição pública — preencha em Participantes pra cada jogador que precisar.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {RATING_PRESETS.map((p) => (
                <Chip key={p.name} active={ratingBands.some((b) => b.name === p.name)} onClick={() => toggleRatingPreset(p)}>
                  {p.name}
                </Chip>
              ))}
            </div>
            {customRatingBands.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customRatingBands.map((b) => (
                  <Chip key={b.name} active onClick={() => toggleRatingPreset(b)}>{b.name}</Chip>
                ))}
              </div>
            )}
            <CustomRangeForm label="rating" value={customRating} onChange={setCustomRating} onAdd={addCustomRating} />
          </DimensionQuestion>

          <DimensionQuestion
            dataTour="pergunta-feminina"
            question="Seu torneio vai ter classificação feminina?"
            on={femaleOn}
            onToggle={() => setFemaleOn((v) => !v)}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cruza com idade/rating quando marcados — ex: idade + feminina gera &quot;Sub-17&quot; e &quot;Sub-17 Feminino&quot;,
              não uma &quot;Feminino&quot; avulsa. Só feminina marcada gera &quot;Feminino&quot; sozinha.
            </p>
          </DimensionQuestion>

          {previewCells.length > 0 && (
            <div className="card p-4 space-y-3" data-tour="gerar-classificacoes">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Prévia — {previewCells.length} classificaç{previewCells.length !== 1 ? 'ões' : 'ão'}
              </p>
              {previewCells.length > CLASSIFICATION_COUNT_WARNING_THRESHOLD && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {previewCells.length} classificações é bastante — confira se não cruzou dimensão demais.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {previewCells.map((c) => (
                  <span key={c.name} className="rounded-full px-2.5 py-1 text-xs bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                    {c.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400">Serão criadas junto com o torneio, ao clicar em &quot;Criar torneio&quot;.</p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800" data-tour="criar">
        <Button type="submit" form={FORM_ID} loading={loading} size="lg" className="w-full sm:w-auto">
          Criar torneio
        </Button>
      </div>
    </div>
  );
}
