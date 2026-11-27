import { defineConfig } from 'vitest/config'

// Testes unitários: rodam sem banco nem API no ar. Testes de API: vitest.api.config.ts; integração: vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    sequence: {
      concurrent: false,
    },
    // URL fictícia: lib/auth.ts a exige na importação, mas o pg só conecta na primeira consulta e os testes usam pg falso.
    env: {
      AUTH_DATABASE_URL: 'postgresql://unit-test@127.0.0.1:1/unit-test',
    },
  },
})
