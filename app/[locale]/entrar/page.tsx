'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useSignIn, useSignUp, useSignInWithGoogle } from '@/lib/hooks/use-auth';
import { canSignUp, BETA_SIGNUP_MESSAGE } from '@/lib/auth/beta';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Gambito } from '@/components/mascot/gambito';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';

// Google é a entrada principal. A flag mostra também e-mail/senha na tela normal;
// /login?metodo=email abre o acesso alternativo para testes, com a mesma autenticação.
const EMAIL_LOGIN_ENABLED = process.env.NEXT_PUBLIC_EMAIL_LOGIN === 'true';

/**
 * Para onde voltar depois de entrar (?next=, ex.: a rodada onde a pessoa tocou "ver lances").
 * Só caminho interno ("/..." e não "//..."), para o login não virar redirecionamento aberto.
 */
function nextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

/** Depois do login: volta ao ?next (recarregando, já com a sessão) ou vai ao painel. */
function goAfterLogin(router: ReturnType<typeof useRouter>) {
  const next = nextPath();
  if (next) {
    window.location.assign(next);
    return;
  }
  router.push('/admin');
  router.refresh();
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);
  const emailLoginEnabled = EMAIL_LOGIN_ENABLED || emailRequested;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('metodo') === 'email') {
      setEmailRequested(true);
      setShowEmailForm(true);
    }
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Botão do Google (GIS) indisponível — sem client id, script bloqueado — e o
  // fluxo antigo por redirecionamento vira o botão principal.
  const [gisUnavailable, setGisUnavailable] = useState(false);

  const signIn = useSignIn();
  const signUp = useSignUp();
  const signInWithGoogle = useSignInWithGoogle();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signin') {
        await signIn.mutateAsync({ email, password });
        goAfterLogin(router);
      } else {
        // Beta fechado: só a allowlist cria conta nova (lib/auth/beta.ts).
        if (!canSignUp(email)) {
          setError(BETA_SIGNUP_MESSAGE);
          return;
        }
        await signUp.mutateAsync({ email, password, fullName: name });
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
      await signInWithGoogle.mutateAsync(nextPath() ?? undefined);
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">Gambito Torneios</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === 'signin' ? 'Entrar no Gambito Torneios' : 'Criar sua conta'}
          </p>
        </div>

        <div className="card p-6">
          {gisUnavailable ? (
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
          ) : (
            <>
              <GoogleSignInButton
                onSuccess={() => goAfterLogin(router)}
                onError={setError}
                onUnavailable={() => setGisUnavailable(true)}
              />
              {/* O botão do Google não avisa quando a origem não está autorizada
                  no Google Cloud — então o caminho antigo fica sempre à mão. */}
              <button
                type="button"
                onClick={handleGoogle}
                className="mt-3 block w-full text-center text-xs text-gray-400 hover:underline"
              >
                O botão não funcionou? Entrar de outro jeito
              </button>
            </>
          )}

          {emailLoginEnabled ? (
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={() => setShowEmailForm((v) => !v)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
            >
              {showEmailForm ? 'Esconder login por e-mail' : 'Entrar com e-mail'}
            </button>
            {/* Antes só aparecia depois de abrir o form de e-mail e trocar o
                modo lá dentro (2 cliques escondidos) — quem só olhava a tela
                inicial via só "Entrar" e achava que não dava pra criar conta. */}
            <button
              type="button"
              onClick={() => { setMode('signup'); setShowEmailForm(true); }}
              className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              Não tem conta? Cadastre-se
            </button>
          </div>
          ) : (
            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Não tem conta? Entre com Google — o primeiro acesso já cria sua conta.
            </p>
          )}

          {error && !showEmailForm && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {emailLoginEnabled && showEmailForm && (
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
          <Link href="/torneios" className="text-brand-600 dark:text-brand-400 hover:underline">
            Consulta pública aqui.
          </Link>
        </p>
      </div>
    </div>
  );
}
