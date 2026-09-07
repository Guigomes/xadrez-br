'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useUser, useProfile, useUpdateMyCapabilities, useUpdateMyParticipantData, useUpdateMyName,
} from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BR_STATES } from '@/lib/utils/chess';
import { Gambito } from '@/components/mascot/gambito';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: loadingUser } = useUser();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const updateCapabilities = useUpdateMyCapabilities();
  const updateParticipantData = useUpdateMyParticipantData();
  const updateName = useUpdateMyName();

  const [fullName, setFullName] = useState('');
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isArbiter, setIsArbiter] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [birthYear, setBirthYear] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [clubOrSchool, setClubOrSchool] = useState('');
  const [federation, setFederation] = useState('BRA');
  const [fideId, setFideId] = useState('');
  const [cbxId, setCbxId] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setIsOrganizer(profile.is_organizer);
      setIsArbiter(profile.is_arbiter);
      setIsParticipant(profile.is_participant);
      setBirthYear(profile.birth_year ? String(profile.birth_year) : '');
      setCity(profile.city ?? '');
      setState(profile.state ?? '');
      setClubOrSchool(profile.club_or_school ?? '');
      setFederation(profile.federation || 'BRA');
      setFideId(profile.fide_id ?? '');
      setCbxId(profile.cbx_id ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (!loadingUser && !user) router.push('/login');
  }, [loadingUser, user, router]);

  const hasChanges = useMemo(() => !!profile && (
    fullName !== (profile.full_name ?? '') ||
    isOrganizer !== profile.is_organizer ||
    isArbiter !== profile.is_arbiter ||
    isParticipant !== profile.is_participant ||
    birthYear !== (profile.birth_year ? String(profile.birth_year) : '') ||
    city !== (profile.city ?? '') ||
    state !== (profile.state ?? '') ||
    clubOrSchool !== (profile.club_or_school ?? '') ||
    federation !== (profile.federation || 'BRA') ||
    fideId !== (profile.fide_id ?? '') ||
    cbxId !== (profile.cbx_id ?? '') ||
    phone !== (profile.phone ?? '')
  ), [birthYear, cbxId, city, clubOrSchool, federation, fideId, fullName, isArbiter, isOrganizer, isParticipant, phone, profile, state]);

  const saving = updateName.isPending || updateCapabilities.isPending || updateParticipantData.isPending;

  if (loadingUser || loadingProfile || !profile) return <PageSpinner />;

  async function handleSave() {
    setError('');
    setSaved(false);
    if (!fullName.trim()) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!isOrganizer && !isArbiter && !isParticipant) {
      setError('Mantenha pelo menos uma opção marcada: organizador, árbitro ou participante.');
      return;
    }
    try {
      await updateName.mutateAsync(fullName);
      await updateCapabilities.mutateAsync({ isOrganizer, isArbiter, isParticipant });
      if (isParticipant) {
        await updateParticipantData.mutateAsync({
          birthYear: birthYear ? Number(birthYear) : null,
          city, state, clubOrSchool, federation, fideId, cbxId, phone,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar.');
    }
  }

  return (
    <div className="container-app py-8 max-w-lg">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Minha conta</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{profile.full_name || profile.email}</p>
        </div>
        <Gambito
          pose={hasChanges ? 'alerta' : 'aprovado'}
          alt={hasChanges ? 'Gambito lembra que há alterações para salvar' : 'Gambito confirma que a conta está atualizada'}
          className="w-20 shrink-0 sm:w-28"
        />
      </div>

      <div className="card p-5 space-y-4">
        <Input
          label="Nome completo"
          placeholder="Seu nome"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          hint="Usado nos torneios em que você se inscrever e pelo Gambito pra saber quem está falando com ele."
        />

        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">O que você faz aqui</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            As três podem estar ativas ao mesmo tempo, mas é preciso manter pelo menos uma marcada.
            Inscrever-se para jogar um torneio não exige nenhuma delas.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isOrganizer}
            onChange={(e) => setIsOrganizer(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Organizador</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Pode criar e gerenciar torneios.</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isArbiter}
            onChange={(e) => setIsArbiter(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Árbitro</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pode cadastrar jogadores e ser adicionado à equipe de torneios de outros organizadores.
            </p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isParticipant}
            onChange={(e) => setIsParticipant(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Participante</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Não é preciso estar cadastrado para se inscrever em um torneio
            </p>
          </div>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
          >
            Salvar
          </Button>
          {saved && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              ✓ Salvo
            </span>
          )}
        </div>
      </div>

      {isParticipant && (
        <div className="card p-5 space-y-4 mt-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Dados para inscrição automática
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Preencha aqui, ou deixe em branco e complete na primeira inscrição — a partir daí fica
              salvo para ser reaproveitado nos próximos torneios.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ano de nascimento"
              type="number"
              inputMode="numeric"
              placeholder="2010"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            />
            <Input
              label="Cidade"
              placeholder="Sua cidade"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="UF" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Selecione…</option>
              {BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>)}
            </Select>
            <Input
              label="Escola / clube de xadrez"
              placeholder="Opcional"
              value={clubOrSchool}
              onChange={(e) => setClubOrSchool(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="ID CBX"
              inputMode="numeric"
              value={cbxId}
              onChange={(e) => setCbxId(e.target.value)}
            />
            <Input
              label="ID FIDE"
              inputMode="numeric"
              value={fideId}
              onChange={(e) => setFideId(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Federação"
              maxLength={3}
              value={federation}
              onChange={(e) => setFederation(e.target.value)}
              hint="Sigla de 3 letras. Padrão: BRA"
            />
            <Input
              label="Telefone / WhatsApp"
              type="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
              Salvar dados da conta
            </Button>
            {hasChanges && !saving && (
              <span className="text-sm text-amber-700 dark:text-amber-400">Alterações não salvas</span>
            )}
            {saved && (
              <span className="text-sm font-medium text-green-600 dark:text-green-400" aria-live="polite">
                ✓ Salvo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
