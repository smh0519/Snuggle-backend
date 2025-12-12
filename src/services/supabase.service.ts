import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

// 사용자 토큰으로 인증된 Supabase 클라이언트 생성
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

// 기본 Supabase 클라이언트 (익명)
export const supabase = createClient(env.supabase.url, env.supabase.anonKey)
