import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path'; // 1. Import path

export default defineConfig(({ mode }) => {
  return {
    plugins: [vue()],
    
    // 2. Add Alias Support (Prevents import errors)
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      port: 3001,      
      strictPort: true,
      // 3. CRITICAL FIX: Allow Vercel CLI to connect
      host: true, 
    },

    esbuild: {
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
      drop: mode === 'production' ? ['debugger'] : [],
    },
  };
});