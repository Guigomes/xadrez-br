import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Perguntas de dado ao vivo ("quantos torneios tem no MS agora", "quantos
 * eu tenho") não cabem em busca semântica sobre a KB estática (docs/kb) —
 * precisam de contagem real no banco. Lista fechada de propósito: evita o
 * bot virar uma interface de query genérica (§ do plano original nunca
 * quis o bot executando ações/consultas livres no sistema).
 *
 * Só disponível pra usuário logado — o chat inteiro já exige login
 * (app/api/chat/message/route.ts retorna 401 antes de chegar aqui), então
 * essas ferramentas nunca rodam sem um userId real.
 *
 * Formato neutro (JSON Schema puro), não amarrado ao SDK de nenhum
 * provedor — lib/chat/llm.ts adapta pro formato de tool calling específico
 * do Gemini (`Type` enum) ou da Anthropic (`input_schema`, já é esse
 * formato quase 1:1).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'contar_torneios_por_estado',
    description:
      'Conta quantos torneios públicos (já publicados, não em rascunho) existem hoje em um estado brasileiro (UF).',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Sigla do estado (UF), ex: MS, SP, RJ.' },
      },
      required: ['estado'],
    },
  },
  {
    name: 'contar_meus_torneios',
    description: 'Conta quantos torneios o usuário logado (quem está conversando agora) já criou, em qualquer status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_pergunta_sem_resposta',
    description:
      'Chame isso SEMPRE que você não conseguir responder — a pergunta não está no CONTEXTO e nenhuma outra ferramenta se aplica. Registra a pergunta pra alguém do time revisar depois e melhorar o sistema. Chame antes de dizer que não sabe, nunca em vez de responder quando você já sabe a resposta.',
    parameters: { type: 'object', properties: {} },
  },
];

export interface ToolContext {
  /** Client autenticado como o próprio usuário — RLS aplica, nunca service_role. Usado pelas ferramentas de contagem. */
  supabase: SupabaseClient;
  userId: string;
  /** Só pra registrar_pergunta_sem_resposta — essa tabela não tem policy de insert pro client comum, de propósito. */
  admin: SupabaseClient;
  sessionId: string;
  /** Pergunta original do usuário nesta mensagem — não confia no modelo reescrever, evita deriva/paráfrase no registro. */
  originalQuestion: string;
}

/**
 * "Meus torneios" nunca vaza pra outro usuário porque o filtro usa sempre
 * ctx.userId (vem do JWT da sessão), nunca um id que o modelo mandou nos
 * argumentos — o modelo não tem como pedir dado de outra pessoa.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'contar_torneios_por_estado': {
      const estado = typeof args.estado === 'string' ? args.estado.trim().toUpperCase().slice(0, 2) : '';
      if (!estado) return { error: 'Estado não informado.' };
      const { count, error } = await ctx.supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('state', estado)
        .eq('is_public', true)
        .neq('status', 'draft');
      if (error) return { error: error.message };
      return { estado, count: count ?? 0 };
    }
    case 'contar_meus_torneios': {
      const { count, error } = await ctx.supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', ctx.userId);
      if (error) return { error: error.message };
      return { count: count ?? 0 };
    }
    case 'registrar_pergunta_sem_resposta': {
      const { error } = await ctx.admin.from('unanswered_questions').insert({
        session_id: ctx.sessionId,
        user_id: ctx.userId,
        question: ctx.originalQuestion.slice(0, 2000),
      });
      if (error) return { error: error.message };
      return { ok: true };
    }
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
