import { Router, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient } from '../services/supabase.service.js'

const router = Router()

// 프로필 동기화 (카카오 프로필 정보를 profiles 테이블에 저장)
router.post('/sync', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // 현재 사용자의 auth 메타데이터 가져오기
    const { data: { user }, error: userError } = await authClient.auth.getUser()

    if (userError || !user) {
      res.status(401).json({ error: 'Failed to get user' })
      return
    }

    const metadata = user.user_metadata
    const profileImageUrl = metadata?.avatar_url || metadata?.picture || null
    const nickname = metadata?.name || metadata?.full_name || null

    // profiles 테이블 업데이트
    const { data, error } = await authClient
      .from('profiles')
      .upsert({
        id: user.id,
        profile_image_url: profileImageUrl,
        nickname: nickname,
      }, {
        onConflict: 'id',
      })
      .select()
      .single()

    if (error) {
      console.error('Profile sync error:', error)
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Profile sync error:', error)
    res.status(500).json({ error: 'Failed to sync profile' })
  }
})

export default router
