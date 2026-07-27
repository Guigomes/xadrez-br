import { defineConfig } from 'vitest/config';

// Sem isso, o glob padrão do vitest ('**/*.{test,spec}.ts') pegaria os specs
// do Playwright em e2e/ — eles usam o test/expect do @playwright/test, não
// têm jsdom, e não são o que 'npm test' deve rodar.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
