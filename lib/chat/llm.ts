import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const FALLBACK_ANSWER = 'Não consegui gerar uma resposta agora — tente de novo em instantes.';
const MAX_TOKENS = 500;

/**
 * Provedor trocável via CHAT_LLM_PROVIDER ('gemini' | 'anthropic') — Gemini
 * tem free tier (~250-1500 req/dia), Anthropic é pago por uso mas sem teto.
 * Trocar de volta pra Anthropic: mudar CHAT_LLM_PROVIDER=anthropic e
 * preencher ANTHROPIC_API_KEY em .env.local — nenhum outro código muda,
 * prompt.ts é o mesmo pros dois provedores.
 */
export async function generateAnswer(systemPrompt: string, history: ChatTurn[], message: string): Promise<string> {
  const provider = process.env.CHAT_LLM_PROVIDER || 'gemini';
  return provider === 'anthropic'
    ? generateWithAnthropic(systemPrompt, history, message)
    : generateWithGemini(systemPrompt, history, message);
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

async function generateWithGemini(systemPrompt: string, history: ChatTurn[], message: string): Promise<string> {
  // Gemini usa role 'model' onde a Anthropic usa 'assistant'.
  const contents = [
    ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];
  const response = await getGemini().models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: { systemInstruction: systemPrompt, maxOutputTokens: MAX_TOKENS },
  });
  return response.text?.trim() || FALLBACK_ANSWER;
}
