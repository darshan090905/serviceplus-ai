import { API_BASE } from './services/api'

export interface EnvStatus {
  supabaseUrl: boolean
  supabaseAnonKey: boolean
  apiBase: boolean
  appUrl: boolean
  allConfigured: boolean
}

export function checkEnv(): EnvStatus {
  const supabaseUrl = Boolean(import.meta.env.VITE_SUPABASE_URL)
  const supabaseAnonKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)
  const apiBase = Boolean(API_BASE)
  const appUrl = Boolean(import.meta.env.VITE_APP_URL)
  return {
    supabaseUrl,
    supabaseAnonKey,
    apiBase,
    appUrl,
    allConfigured: supabaseUrl && supabaseAnonKey,
  }
}

export function warnMissingEnv(): void {
  const env = checkEnv()
  const missing: string[] = []
  if (!env.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!env.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!env.apiBase) missing.push('VITE_API_BASE_URL (n8n backend — optional until wired)')
  if (!env.appUrl) missing.push('VITE_APP_URL (base URL for payment QR codes)')
  if (missing.length > 0) {
    console.warn('[ServicePulse] Missing environment variables:', missing.join(', '))
  }
}