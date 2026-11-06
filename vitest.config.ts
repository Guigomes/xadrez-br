import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Sem isso, o glob padrão do vitest ('**/*.{test,spec}.ts') pegaria os specs
// do Playwright em e2e/ — eles usam o test/expect do @playwright/test, não
// têm jsdom, e não são o que 'npm test' deve rodar.
export default defineConfig({
  // Mesmo alias do tsconfig ("@/*" -> "./*"). Antes faltava, e os testes eram
  // obrigados a importar por caminho relativo — e rota que importasse um módulo
  // "@/..." não mockado nem carregava no teste.
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
