import { Router, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient, supabase } from '../services/supabase.service.js'

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

// 계정 삭제 상태 확인
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!

    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', user.id)
      .single()

    res.json({
      isDeleted: !!profile?.deleted_at,
      deletedAt: profile?.deleted_at || null,
    })
  } catch (error) {
    console.error('Get account status error:', error)
    res.status(500).json({ error: 'Failed to get account status' })
  }
})

// 계정 삭제 (소프트 삭제)
router.delete('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // 프로필에 deleted_at 설정
    const { error } = await authClient
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    // 사용자의 모든 블로그도 소프트 삭제
    await authClient
      .from('blogs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('deleted_at', null)

    res.json({ success: true })
  } catch (error) {
    console.error('Delete account error:', error)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

// 계정 복구
router.post('/restore', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // 프로필 복구
    const { error } = await authClient
      .from('profiles')
      .update({ deleted_at: null })
      .eq('id', user.id)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Restore account error:', error)
    res.status(500).json({ error: 'Failed to restore account' })
  }
})

// 삭제된 블로그 목록 조회
router.get('/blogs/deleted', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!

    const { data, error } = await supabase
      .from('blogs')
      .select('id, name, description, thumbnail_url, deleted_at')
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data || [])
  } catch (error) {
    console.error('Get deleted blogs error:', error)
    res.status(500).json({ error: 'Failed to get deleted blogs' })
  }
})

// 블로그 삭제 (소프트 삭제)
router.delete('/blog/:blogId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blogId } = req.params

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blogId)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { error } = await authClient
      .from('blogs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', blogId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Delete blog error:', error)
    res.status(500).json({ error: 'Failed to delete blog' })
  }
})

// 블로그 복구
router.post('/blog/:blogId/restore', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blogId } = req.params

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blogId)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { error } = await authClient
      .from('blogs')
      .update({ deleted_at: null })
      .eq('id', blogId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Restore blog error:', error)
    res.status(500).json({ error: 'Failed to restore blog' })
  }
})

export default router
