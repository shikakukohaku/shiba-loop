import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    rollupOptions: {
      input: {
        // 本命：2Dアクション
        main: resolve(__dirname, 'index.html'),
        // 方針転換前の散歩プロトタイプ（3D）。比較用に残してある
        walk3d: resolve(__dirname, 'walk3d.html'),
      },
    },
  },
});
