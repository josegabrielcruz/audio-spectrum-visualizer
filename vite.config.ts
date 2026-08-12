import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single instance of React throughout the bundle.
    // Without this, Vite may load both the app's React and R3F's peer copy
    // as separate modules, causing "Cannot read properties of undefined
    // (reading 'ReactCurrentOwner')" at runtime.
    dedupe: ['react', 'react-dom', '@react-three/fiber'],
  },
})
