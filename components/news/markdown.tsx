import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

/**
 * Renderiza o corpo Markdown de uma notícia (news.body_md).
 *
 * Segurança: react-markdown monta React direto do AST, sem
 * `dangerouslySetInnerHTML` em lugar nenhum, e `rehype-sanitize` roda com o
 * schema padrão (o do GitHub) — que já limita tags, atributos e protocolos de
 * href/src a http/https/mailto. NUNCA adicionar `rehype-raw` aqui: ele
 * reabre HTML cru no meio do Markdown e anula a sanitização.
 *
 * O mapeamento de `components` roda DEPOIS da sanitização, então o
 * target/rel que a gente injeta em <a> é confiável (não vem do conteúdo).
 *
 * Sem classes `prose`: @tailwindcss/typography não está instalado no projeto
 * e essas classes seriam no-op silencioso. Cada tag ganha estilo explícito,
 * nas mesmas cores do resto do app.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-6 mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">{children}</h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-5 mb-2 font-semibold text-gray-900 dark:text-gray-100">{children}</h3>
          ),
          p: ({ children }) => <p className="my-3">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>
          ),
          ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="text-brand-600 hover:underline dark:text-brand-400 break-all"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-gray-200 pl-4 italic text-gray-600 dark:border-gray-700 dark:text-gray-400">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-6 border-gray-200 dark:border-gray-800" />,
          // <img> normal em vez de next/image: o src vem do corpo da notícia e
          // pode apontar pra qualquer host, que não está em remotePatterns.
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (
            <img
              src={typeof src === 'string' ? src : undefined}
              alt={alt ?? ''}
              loading="lazy"
              className="my-4 max-w-full rounded-lg"
            />
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-900 dark:border-gray-800 dark:text-gray-100">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-gray-100 px-3 py-2 dark:border-gray-800/60">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
