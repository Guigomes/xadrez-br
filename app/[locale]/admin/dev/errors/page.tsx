'use client';

import { useState } from 'react';
import { useProfile } from '@/lib/hooks/use-auth';
import { useErrorLogs } from '@/lib/hooks/use-error-logs';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { ErrorLog } from '@/types/database';

const SOURCE_LABEL: Record<string, string> = {
  client: 'Navegador',
  server: 'Servidor',
  api: 'API',
};

export default function AdminErrorLogsPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <ErrorLogsPanel />;
}

function ErrorLogsPanel() {
  const { data: logs, isLoading } = useErrorLogs();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🐛 Log de erros</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Erros não esperados capturados no site — navegador e servidor. Últimos 100.
        </p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !logs?.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum erro registrado ainda. 🎉</p>
      ) : (
        <div className="card p-0 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {logs.map((log) => (
            <ErrorRow
              key={log.id}
              log={log}
              expanded={expanded === log.id}
              onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorRow({ log, expanded, onToggle }: { log: ErrorLog; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {SOURCE_LABEL[log.source] ?? log.source}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(log.created_at).toLocaleString('pt-BR')}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{log.message}</p>
        {log.route && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {log.method ? `${log.method} ` : ''}{log.route}
            {log.status_code ? ` · ${log.status_code}` : ''}
          </p>
        )}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {log.stack && (
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {log.stack}
            </pre>
          )}
          {log.context && (
            <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {JSON.stringify(log.context, null, 2)}
            </pre>
          )}
          {log.user_id && (
            <p className="text-xs text-gray-500 dark:text-gray-400">user_id: {log.user_id}</p>
          )}
        </div>
      )}
    </div>
  );
}
