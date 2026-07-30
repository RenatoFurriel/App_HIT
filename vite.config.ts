import { defineConfig } from 'vitest/config'

// `base` precisa bater com o caminho do repositório no GitHub Pages.
// Em https://<usuario>.github.io/App_HIT/ o base é '/App_HIT/'.
// Se um dia o app for para um domínio próprio, isto vira '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/App_HIT/',
  build: {
    target: 'es2022',
    assetsDir: 'assets',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
