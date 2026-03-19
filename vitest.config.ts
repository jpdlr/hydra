import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    // Sequential file execution to prevent Firebase dynamic import() mock contamination
    fileParallelism: false
  }
})
