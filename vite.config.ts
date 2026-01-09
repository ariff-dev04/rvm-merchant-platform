import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  return {
    plugins: [vue()],
    
    server: {
      // Runs on 3001 to avoid conflict with Web App
      port: 3001,      
      strictPort: true, 
    },

    // Strips logs in production
    esbuild: {
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
      drop: mode === 'production' ? ['debugger'] : [],
    },
  };
});