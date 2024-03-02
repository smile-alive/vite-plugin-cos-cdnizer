import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'node:path';
import cdnizer from 'vite-plugin-cos-cdnizer';

dotenv.config({ path: path.resolve(process.cwd(), '../', '.env.local') });

export default defineConfig({
	plugins: [
		react(),
		cdnizer({
			secretId: process.env.VITE_SECRET_ID!,
			secretKey: process.env.VITE_SECRET_KEY!,
			bucket: 'md-1307877784',
			region: 'ap-beijing',
			domain: 'https://static.rux.ink/'
		})
	]
});
