'use client';

import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/use-auth';
import { useAccessAnalytics, useMarkOwnerDevice } from '@/lib/hooks/use-access-analytics';
import { getOrCreateDeviceId } from '@/lib/analytics/device';
import type { AccessDevice } from '@/lib/analytics/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';

const DEVICE_ICON = {
  desktop: '💻',
  mobile: '📱',
  tablet: '▯',
  other: '◻',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DevAccessesPage() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState
        icon="🔒"
        title="Acesso restrito"
        description="Esta contagem é visível apenas no painel de desenvolvedor."
      />
    );
  }

  return <AccessesPanel />;
}

function AccessesPanel() {
  const { data, isLoading, error, refetch, isFetching } = useAccessAnalytics();
  const markOwner = useMarkOwnerDevice();
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  useEffect(() => setCurrentDeviceId(getOrCreateDeviceId()), []);

  function toggleOwner(device: AccessDevice) {
    if (device.isOwner) {
      markOwner.mutate({ deviceId: device.id, isOwner: false });
      return;
    }

    const suggested = device.deviceType === 'mobile' ? 'Meu celular' : 'Meu computador';
    const label = window.prompt('Como você quer identificar este aparelho?', suggested)?.trim();
    if (label) markOwner.mutate({ deviceId: device.id, isOwner: true, label });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Acessos do site</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Visualizações separadas por navegador. Nenhum endereço IP é armazenado.
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={isFetching} onClick={() => refetch()}>
          Atualizar
        </Button>
      </div>

      {isLoading ? <PageSpinner /> : error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error.message}
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Últimas 24h', data.summary.last24Hours],
              ['Últimos 7 dias', data.summary.last7Days],
              ['Últimos 30 dias', data.summary.last30Days],
              ['Aparelhos (30d)', data.summary.uniqueDevices30Days],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Aparelhos</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Marque os seus para destacá-los no histórico.
              </p>
            </div>
            {!data.devices.length ? (
              <div className="card p-5 text-sm text-gray-500">Nenhum acesso registrado ainda.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.devices.map((device) => (
                  <div key={device.id} className={`card p-4 ${device.isOwner ? 'ring-1 ring-brand-500' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl" aria-hidden>{DEVICE_ICON[device.deviceType]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {device.isOwner ? device.ownerLabel : `${device.browser} · ${device.os}`}
                          </p>
                          {device.isOwner && (
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                              Meu
                            </span>
                          )}
                          {device.id === currentDeviceId && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              Este aparelho
                            </span>
                          )}
                        </div>
                        {device.isOwner && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{device.browser} · {device.os}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {device.views30Days} acesso(s) em 30 dias · último em {formatDate(device.lastSeenAt)}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {device.lastPath ?? '—'} · ID {device.id.slice(-8)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOwner(device)}
                      disabled={markOwner.isPending}
                      className="mt-3 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
                    >
                      {device.isOwner ? 'Não é meu' : 'Marcar como meu'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Acessos recentes</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Últimas 100 visualizações.</p>
            </div>
            <div className="card divide-y divide-gray-100 overflow-hidden p-0 dark:divide-gray-800">
              {!data.recent.length ? (
                <p className="p-5 text-sm text-gray-500">Nenhum acesso registrado ainda.</p>
              ) : data.recent.map((access) => (
                <div key={access.id} className={`flex items-center gap-3 px-4 py-3 ${access.isOwner ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''}`}>
                  <span aria-hidden>{DEVICE_ICON[access.deviceType]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{access.path}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {access.isOwner ? `Meu · ${access.ownerLabel}` : `${access.browser} · ${access.os} · ${access.deviceId.slice(-8)}`}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">{formatDate(access.visitedAt)}</time>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
