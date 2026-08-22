import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      // api.js is plain JavaScript, so Vite does not apply TypeScript's
      // .js -> .ts resolution to its dynamic import of the client. In a build
      // this resolves because tsc has emitted client.js next to it; in the
      // source tree it has to be pointed at the TypeScript file.
      {
        find: './lib/mspa-api/client.js',
        replacement: fileURLToPath(new URL('./lib/mspa-api/client.ts', import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Everything that ships, including the plain JavaScript the build
      // tsconfig does not compile. The inline script in the widget's
      // index.html is exercised by test/widgets/mspa-panel-ui.test.ts but
      // cannot be instrumented here, so it is not listed.
      include: ['lib/**', 'drivers/**', 'app.ts', 'api.js', 'widgets/**/api.js'],
    },
  },
});
