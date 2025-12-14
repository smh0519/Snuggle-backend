import { Router, Request, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient, supabase } from '../services/supabase.service.js'

const router = Router()

// 파라미터 검증 헬퍼 함수
function validatePagination(limitStr: string | undefined, offsetStr: string | undefined): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, parseInt(limitStr as string) || 20), 100)
  const offset = Math.max(0, parseInt(offsetStr as string) || 0)
  return { limit, offset }
}

// ===== 특정 경로 라우트 (/:id 보다 먼저 선언해야 함) =====

// 마켓플레이스 스킨 목록 조회 (공개 스킨)
router.get('/marketplace', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, css_variables, layout_config, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data || [])
  } catch (error) {
    console.error('Get marketplace skins error:', error)
    res.status(500).json({ error: 'Failed to get marketplace skins' })
  }
})

// 사용자 스킨 라이브러리 조회 (인증 필요)
router.get('/library', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!

    const { data, error } = await supabase
      .from('user_skin_library')
      .select('skin_id, downloaded_at')
      .eq('user_id', user.id)
      .order('downloaded_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data || [])
  } catch (error) {
    console.error('Get skin library error:', error)
    res.status(500).json({ error: 'Failed to get skin library' })
  }
})

// 블로그에 적용된 스킨 조회 (인증 불필요)
router.get('/blog/:blogId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { blogId } = req.params

    const { data, error } = await supabase
      .from('blog_skin_applications')
      .select(`
        id,
        blog_id,
        skin_id,
        custom_css_variables,
        custom_layout_config,
        updated_at,
        skin:blog_skins (
          id,
          name,
          description,
          css_variables,
          layout_config
        )
      `)
      .eq('blog_id', blogId)
      .maybeSingle()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get blog skin error:', error)
    res.status(500).json({ error: 'Failed to get blog skin' })
  }
})

// 블로그에 스킨 적용 (인증 필요)
router.post('/apply', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blog_id, skin_id } = req.body

    if (!blog_id || !skin_id) {
      res.status(400).json({ error: 'blog_id and skin_id are required' })
      return
    }

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blog_id)
      .maybeSingle()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    // 스킨 존재 확인
    const { data: skin } = await supabase
      .from('blog_skins')
      .select('id')
      .eq('id', skin_id)
      .maybeSingle()

    if (!skin) {
      res.status(404).json({ error: 'Skin not found' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // upsert로 기존 적용 스킨 업데이트 또는 새로 생성
    const { data, error } = await authClient
      .from('blog_skin_applications')
      .upsert({
        blog_id,
        skin_id,
        custom_css_variables: null,
        custom_layout_config: null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'blog_id',
      })
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Apply skin error:', error)
    res.status(500).json({ error: 'Failed to apply skin' })
  }
})

// 블로그 스킨 커스터마이징 저장 (인증 필요)
router.patch('/customize/:blogId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blogId } = req.params
    const { custom_css_variables, custom_layout_config } = req.body

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blogId)
      .maybeSingle()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // 기존 적용된 스킨이 있는지 확인
    const { data: existing } = await supabase
      .from('blog_skin_applications')
      .select('id, skin_id')
      .eq('blog_id', blogId)
      .maybeSingle()

    let result
    if (existing) {
      // 업데이트
      const { data, error } = await authClient
        .from('blog_skin_applications')
        .update({
          custom_css_variables,
          custom_layout_config,
          updated_at: new Date().toISOString(),
        })
        .eq('blog_id', blogId)
        .select()
        .single()

      if (error) {
        res.status(500).json({ error: error.message })
        return
      }
      result = data
    } else {
      // 기본 스킨으로 새로 생성
      const { data: defaultSkin } = await supabase
        .from('blog_skins')
        .select('id')
        .eq('name', '기본')
        .eq('is_system', true)
        .maybeSingle()

      const { data, error } = await authClient
        .from('blog_skin_applications')
        .insert({
          blog_id: blogId,
          skin_id: defaultSkin?.id || null,
          custom_css_variables,
          custom_layout_config,
        })
        .select()
        .single()

      if (error) {
        res.status(500).json({ error: error.message })
        return
      }
      result = data
    }

    res.json(result)
  } catch (error) {
    console.error('Customize skin error:', error)
    res.status(500).json({ error: 'Failed to customize skin' })
  }
})

// 스킨 다운로드 (라이브러리에 추가, 인증 필요)
router.post('/download/:skinId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { skinId } = req.params

    // 스킨 존재 확인
    const { data: skin } = await supabase
      .from('blog_skins')
      .select('id')
      .eq('id', skinId)
      .maybeSingle()

    if (!skin) {
      res.status(404).json({ error: 'Skin not found' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // 이미 다운로드했는지 확인
    const { data: existing } = await supabase
      .from('user_skin_library')
      .select('id')
      .eq('user_id', user.id)
      .eq('skin_id', skinId)
      .maybeSingle()

    if (existing) {
      res.json({ success: true, message: 'Already downloaded' })
      return
    }

    // 라이브러리에 추가
    const { error } = await authClient
      .from('user_skin_library')
      .insert({
        user_id: user.id,
        skin_id: skinId,
      })

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Download skin error:', error)
    res.status(500).json({ error: 'Failed to download skin' })
  }
})

// 블로그 스킨 초기화 (인증 필요)
router.delete('/blog/:blogId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blogId } = req.params

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blogId)
      .maybeSingle()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { error } = await authClient
      .from('blog_skin_applications')
      .delete()
      .eq('blog_id', blogId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Reset skin error:', error)
    res.status(500).json({ error: 'Failed to reset skin' })
  }
})

// ===== 일반 경로 라우트 =====

// 시스템 스킨 목록 조회 (인증 불필요)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, css_variables, layout_config, created_at')
      .eq('is_system', true)
      .order('created_at')

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get skins error:', error)
    res.status(500).json({ error: 'Failed to get skins' })
  }
})

// 스킨 상세 조회 (인증 불필요) - 가장 마지막에 선언
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, css_variables, layout_config, created_at')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      res.status(404).json({ error: 'Skin not found' })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get skin error:', error)
    res.status(500).json({ error: 'Failed to get skin' })
  }
})

export default router
