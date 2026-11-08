import { defineConfig } from 'vitest/config'
export default defineConfig({
     test: { include: ['tests/\*\*/\*.{test,spec}.{js,ts}'],
     globals: true,  
     environment: 'node', 
     testTimeout: 30000, 
     sequence: { concurrent: false, 
        }, 
    }, 
});   
