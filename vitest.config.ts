import { defineConfig } from 'vitest/config';

// Unit tests cover the framework-free domain layer only, so no SvelteKit plugin here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true
  }
});
