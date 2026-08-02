import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { TOOL_DECLARATIONS, executeTool, type ToolContext } from './tools';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const FALLBACK_ANSWER = 'Não consegui gerar uma resposta agora — tente de novo em instantes.';
const MAX_TOKENS = 500;
// Perguntas de contagem só precisam de 1 chamada de ferramenta — o teto
// existe só pra nunca entrar num loop infinito se o modelo insistir.
const MAX_TOOL_ROUNDS = 2;

/**
 * Provedor trocável via CHAT_LLM_PROVIDER ('gemini' | 'anthropic') — Gemini
 * tem free tier (~250-1500 req/dia), Anthropic é pago por uso mas sem teto.
 * Trocar de volta pra Anthropic: mudar CHAT_LLM_PROVIDER=anthropic e
 * preencher ANTHROPIC_API_KEY em .env.local — nenhum outro código muda,
 * prompt.ts é o mesmo pros dois provedores.
 *
 * toolContext (lib/chat/tools.ts) só existe no caminho Gemini por agora —
 * é o provedor ativo. Se voltar pro Anthropic, as perguntas de contagem
 * (ver tools.ts) deixam de funcionar até essa chamada ganhar tool use
 * também; o resto do chat (KB) continua igual.
 */
export async function generateAnswer(
  systemPrompt: string,
  history: ChatTurn[],
  message: string,
  toolContext?: ToolContext,
): Promise<string> {
  const provider = process.env.CHAT_LLM_PROVIDER || 'gemini';
  return provider === 'anthropic'
    ? generateWithAnthropic(systemPrompt, history, message)
    : generateWithGemini(systemPrompt, history, message, toolContext);
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada.');
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

async function generateWithAnthropic(systemPrompt: string, history: ChatTurn[], message: string): Promise<string> {
  const completion = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ],
  });
  const text = completion.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  return text || FALLBACK_ANSWER;
}

let _gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
    _gemini = new GoogleGenAI({ apiKey });
  }
  return _gemini;
}

async function generateWithGemini(
  systemPrompt: string,
  history: ChatTurn[],
  message: string,
  toolContext?: ToolContext,
): Promise<string> {
  // Gemini usa role 'model' onde a Anthropic usa 'assistant'.
  const contents: any[] = [
    ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  const config: any = { systemInstruction: systemPrompt, maxOutputTokens: MAX_TOKENS };
  if (toolContext) config.tools = [{ functionDeclarations: TOOL_DECLARATIONS }];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await getGemini().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config,
    });

    // Pega o Part cru (não o getter response.functionCalls, que descarta o
    // thoughtSignature) — modelos com thinking exigem ecoar esse Part
    // inteiro de volta, senão a Gemini API rejeita a próxima chamada com
    // "Function call is missing a thought_signature".
    const functionCallPart = response.candidates?.[0]?.content?.parts?.find((p) => p.functionCall);
    if (!functionCallPart?.functionCall || !toolContext) {
      return response.text?.trim() || FALLBACK_ANSWER;
    }

    // Só a primeira — nenhuma das duas ferramentas depende uma da outra,
    // não há motivo pro modelo pedir mais de uma por rodada aqui.
    const call = functionCallPart.functionCall;
    const result = await executeTool(call.name ?? '', call.args ?? {}, toolContext);
    contents.push({ role: 'model', parts: [functionCallPart] });
    contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: result } }] });
  }

  return FALLBACK_ANSWER;
}
