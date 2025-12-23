import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000, // Let's give Admin the "3000" penthouse
    strictPort: true, // Fail if 3000 is taken (so you know something is wrong)
  }
})
