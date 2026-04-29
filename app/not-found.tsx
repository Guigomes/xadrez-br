import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-app py-24 text-center">
      <p className="text-6xl mb-4">♟</p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Página não encontrada
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        O conteúdo que você procura não existe ou foi removido.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
