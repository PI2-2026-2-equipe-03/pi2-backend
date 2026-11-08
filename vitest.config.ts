import { defineConfig } from 'vitest/config'
export default defineConfig({
     test: { winclude: ['tests/\*\*/\*.{test,spec}.{js,ts}'],
     globals: true,  
     environment: 'node', 
     testTimeout: 30000, 
     sequence: { concurrent: false, 
        }, 
    }, 
});   
