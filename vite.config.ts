import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Refuse to build a production bundle that has no backend.
 *
 * Without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY the app does not crash —
 * it silently falls back to an in-memory demo store and shows hardcoded sample
 * customers. That is genuinely useful for `npm run dev` and genuinely dangerous
 * for a deploy, because a build with no configuration still succeeds, still
 * deploys, and looks like a working site until somebody tries to save a record
 * and watches it vanish. Failing here turns a silent production incident into a
 * red CI job.
 *
 * Vite inlines VITE_* at build time, so these have to be present in the build
 * environment, not merely on the machine. See .env.example.
 */
function requireSupabaseEnv(mode: string, root: string) {
  if (mode !== 'production') return
  // Vite does not populate process.env from .env files while this config is
  // being evaluated — it does that later, when it transforms the client code.
  // Reading the files here is the only way to see what the build will actually
  // inline, and it also picks up real environment variables from CI, which
  // loadEnv merges over the files.
  const env = loadEnv(mode, root, 'VITE_')
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
    (k) => !(process.env[k] ?? env[k] ?? '').trim(),
  )
  if (missing.length === 0) return
  throw new Error(
    `\n\n  Refusing to build: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.\n\n` +
      `  A production bundle with no backend URL silently serves the in-memory demo\n` +
      `  store instead of the database, so it deploys and then quietly discards every\n` +
      `  record a user creates.\n\n` +
      `  Set ${missing.join(' and ')} in the build environment (see .env.example), or\n` +
      `  export them before building.\n\n`,
  )
}

export default defineConfig(({ mode }) => {
  requireSupabaseEnv(mode, process.cwd())
  return {
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  }
})