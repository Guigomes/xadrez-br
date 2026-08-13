import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const FALLBACK_ANSWER = 'Não consegui gerar uma resposta agora — tente de novo em instantes.';
// Resposta com pódio (líder por grupo) + rótulo de grupo não cabe em 500.
const MAX_TOKENS = 700;
// Cada pergunta = 1 chamada de ferramenta (tiro único). O teto existe só pra
// nunca entrar num loop infinito se o modelo insistir.
const MAX_TOOL_ROUNDS = 2;
// Modelo do Gambito por env var (Haiku default) — dá pra subir pra Sonnet sem
// redeploy de código se a escolha entre as ferramentas errar muito.
const ANTHROPIC_MODEL = process.env.CHAT_LLM_MODEL || 'claude-haiku-4-5-20251001';

/**
 * Provedor trocável via CHAT_LLM_PROVIDER ('gemini' | 'anthropic') — Gemini
 * tem free tier (20 req/dia por modelo, bem apertado), Anthropic é pago por
 * uso mas sem teto diário. Tool calling (lib/chat/tools.ts) implementado
 * pros dois — TOOL_DEFINITIONS fica em formato neutro (JSON Schema puro),
 * cada função aqui adapta pro formato específico do provedor.
 */
export async function generateAnswer(
  systemPrompt: string,
  history: ChatTurn[],
  message: string,
  toolContext?: ToolContext,
): Promise<string> {
  const provider = process.env.CHAT_LLM_PROVIDER || 'gemini';
  return provider === 'anthropic'
    ? generateWithAnthropic(systemPrompt, history, message, toolContext)
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

function toAnthropicTools(): Anthropic.Tool[] {
  return TOOL_DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters,
  }));
}

async function generateWithAnthropic(
  systemPrompt: string,
  history: ChatTurn[],
  message: string,
  toolContext?: ToolContext,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];
  const tools = toolContext ? toAnthropicTools() : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const completion = await getAnthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
      tools,
    });

    // TODOS os blocos tool_use da resposta — não só o primeiro. Com 8
    // ferramentas o Haiku pode pedir mais de uma na mesma volta; ecoar o
    // content inteiro (abaixo) sem devolver um tool_result por bloco daria
    // erro 400 na próxima chamada ("tool_use ids without tool_result").
    const toolUseBlocks = completion.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (toolUseBlocks.length === 0 || !toolContext) {
      const text = completion.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return text || FALLBACK_ANSWER;
    }

    const results = await Promise.all(
      toolUseBlocks.map((b) => executeTool(b.name, (b.input as Record<string, unknown>) ?? {}, toolContext)),
    );
    messages.push({ role: 'assistant', content: completion.content });
    messages.push({
      role: 'user',
      content: toolUseBlocks.map((b, i) => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: JSON.stringify(results[i]),
      })),
    });
  }

  return FALLBACK_ANSWER;
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

const JSON_TYPE_TO_GEMINI_TYPE: Record<string, Type> = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  object: Type.OBJECT,
  array: Type.ARRAY,
};

function toGeminiDeclarations(): FunctionDeclaration[] {
  return TOOL_DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(def.parameters.properties).map(([key, prop]) => [
          key,
          { type: JSON_TYPE_TO_GEMINI_TYPE[prop.type] ?? Type.STRING, description: prop.description },
        ])
      ),
      required: def.parameters.required,
    },
  }));
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
  if (toolContext) config.tools = [{ functionDeclarations: toGeminiDeclarations() }];

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
