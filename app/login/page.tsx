'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSignIn, useSignUp, useSignInWithGoogle } from '@/lib/hooks/use-auth';
import { canSignUp, BETA_SIGNUP_MESSAGE } from '@/lib/auth/beta';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Gambito } from '@/components/mascot/gambito';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [wantsOrganizer, setWantsOrganizer] = useState(true);
  const [wantsArbiter, setWantsArbiter] = useState(false);
  const [wantsParticipant, setWantsParticipant] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const signIn = useSignIn();
  const signUp = useSignUp();
  const signInWithGoogle = useSignInWithGoogle();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signin') {
        await signIn.mutateAsync({ email, password });
        router.push('/admin');
      } else {
        // Beta fechado: só a allowlist cria conta nova (lib/auth/beta.ts).
        // Checado antes da validação de capacidade pra não pedir que a pessoa
        // corrija um formulário que não vai ser aceito de qualquer jeito.
        if (!canSignUp(email)) {
          setError(BETA_SIGNUP_MESSAGE);
          return;
        }
        if (!wantsOrganizer && !wantsArbiter && !wantsParticipant) {
          setError('Marque pelo menos uma opção: organizar, arbitrar ou participar.');
          return;
        }
        await signUp.mutateAsync({
          email, password, fullName: name,
          isOrganizer: wantsOrganizer, isArbiter: wantsArbiter, isParticipant: wantsParticipant,
        });
        setError('');
        setSuccess('Conta criada! Verifique seu email para confirmar o cadastro.');
        setMode('signin');
      }
    } catch (err: any) {
      setError(err.message ?? 'Erro ao processar. Tente novamente.');
    }
  }

  async function handleGoogle() {
    setError('');
    try {
      await signInWithGoogle.mutateAsync(undefined);
      // Não chega a resolver em caso de sucesso — signInWithOAuth já
      // navegou o browser pro Google. Erro (provider indisponível, etc.)
      // é o único caso que cai aqui de fato.
    } catch (err: any) {
      setError(err.message ?? 'Erro ao entrar com Google.');
    }
  }

  const loading = signIn.isPending || signUp.isPending;

  return (
    <div className="container-app py-16 flex justify-center">
      <div className="w-full max-w-sm">
        <div className="relative mb-8 text-center">
          <Gambito
            pose="acenando"
            alt="Gambito dando boas-vindas"
            priority
            className="mx-auto w-32 drop-shadow-lg sm:w-40"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">Torneios Xadrez BR</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === 'signin' ? 'Entrar no Xadrez BR' : 'Criar sua conta'}
          </p>
        </div>

        <div className="card p-6">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            loading={signInWithGoogle.isPending}
            onClick={handleGoogle}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.56-5.17 3.56-8.82Z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.26A12 12 0 0 0 0 12c0 1.94.47 3.77 1.26 5.39l4.01-3.11Z" />
              <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.61l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z" />
            </svg>
            Entrar com Google
          </Button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowEmailForm((v) => !v)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
            >
              {showEmailForm ? 'Esconder login por e-mail' : 'Entrar com e-mail'}
            </button>
          </div>

          {error && !showEmailForm && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {showEmailForm && (
        <div className="card p-6 mt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <Input
                  label="Nome completo"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    O que você quer fazer aqui? (marque pelo menos uma)
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantsOrganizer}
                      onChange={(e) => setWantsOrganizer(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Organizar torneios</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantsArbiter}
                      onChange={(e) => setWantsArbiter(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Arbitrar torneios</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wantsParticipant}
                      onChange={(e) => setWantsParticipant(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Participar de torneios</span>
                  </label>
                  <p className="text-xs text-gray-400">
                    Não é preciso estar cadastrado para jogar — a inscrição em torneios é aberta a
                    qualquer pessoa. Marcar &quot;participar&quot; só serve para ter seus dados
                    reaproveitados e a inscrição preenchida automaticamente num próximo torneio.
                    Dá pra ajustar tudo isso depois em &quot;Minha conta&quot;.
                  </p>
                </div>
              </>
            )}
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {success && (
              <p className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
                {success}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading} size="lg">
              {mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
              className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              {mode === 'signin' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
            </button>
          </div>
        </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Organize, arbitre ou acompanhe seus torneios. A consulta pública continua disponível sem conta.{' '}
          <Link href="/tournaments" className="text-brand-600 dark:text-brand-400 hover:underline">
            Consulta pública aqui.
          </Link>
        </p>
      </div>
    </div>
  );
}
