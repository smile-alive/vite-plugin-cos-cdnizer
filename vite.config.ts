import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rux from './plugin/vite-plugin-rux';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		rux({
			secretId: 'AKIDeBXgzQhqmbGzfAWgdP3Y6WyMeo8Sgks9',
			secretKey: 'Kc2Z4TtLhqumb0IdAsQpAPbbk0Rkvz23',
			bucket: 'md-1307877784',
			region: 'ap-beijing',
			domain: 'https://static.rux.ink/'
		})
	]
});
