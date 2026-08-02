'use client';

import { useProfile } from '@/lib/hooks/use-auth';
import { useUnansweredQuestions } from '@/lib/hooks/use-unanswered-questions';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminUnansweredQuestionsPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return <UnansweredQuestionsPanel />;
}

function UnansweredQuestionsPanel() {
  const { data: questions, isLoading } = useUnansweredQuestions();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">❓ Perguntas sem resposta</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Perguntas que o Gambito não conseguiu responder — nem pela base de conhecimento, nem
          pelas ferramentas de dado ao vivo. Sinal de doc faltando ou funcionalidade faltando.
        </p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !questions?.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma pergunta sem resposta ainda. 🎉</p>
      ) : (
        <div className="card p-0 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {questions.map((q) => (
            <div key={q.id} className="px-4 py-3">
              <p className="text-sm text-gray-900 dark:text-gray-100">{q.question}</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {new Date(q.created_at).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
