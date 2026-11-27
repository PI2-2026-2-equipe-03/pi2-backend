import { defineConfig } from 'vitest/config'

// Testes de API (caixa-preta): chamam a API em execução (API_URL, padrão http://localhost:3000/api).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    sequence: {
      concurrent: false,
    },
  },
})
