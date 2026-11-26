import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
});
