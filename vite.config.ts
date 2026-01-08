import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// We change this to a function so we can check if we are in 'production' mode
export default defineConfig(({ mode }) => {
  return {
    plugins: [vue()],
    
    server: {
      port: 3001,      
      strictPort: true, 
    },

    
    esbuild: {
      // If building for production, remove console.log, .debug, and .info
      // If in dev, keep them so you can see what you are doing
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
    },
  };
});