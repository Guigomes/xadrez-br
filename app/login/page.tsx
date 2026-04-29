'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSignIn, useSignUp } from '@/lib/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const signIn = useSignIn();
  const signUp = useSignUp();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signin') {
        await signIn.mutateAsync({ email, password });
        router.push('/admin');
      } else {
        await signUp.mutateAsync({ email, password, fullName: name });
        setError('');
        alert('Verifique seu email para confirmar o cadastro.');
        setMode('signin');
      }
    } catch (err: any) {
      setError(err.message ?? 'Erro ao processar. Tente novamente.');
    }
  }

  const loading = signIn.isPending || signUp.isPending;

  return (
    <div className="container-app py-16 flex justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">♟</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">XadrezBR</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === 'signin' ? 'Acesso para organizadores' : 'Criar conta de organizador'}
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input
                label="Nome completo"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
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

        <p className="text-center text-xs text-gray-400 mt-4">
          Apenas para organizadores e árbitros de torneios.{' '}
          <Link href="/tournaments" className="text-brand-600 dark:text-brand-400 hover:underline">
            Consulta pública aqui.
          </Link>
        </p>
      </div>
    </div>
  );
}
