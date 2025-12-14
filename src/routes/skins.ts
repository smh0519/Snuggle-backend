import { Router, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient, supabase } from '../services/supabase.service.js'

const router = Router()

// 사용자가 사용 가능한 스킨 목록 조회 (기본 제공 + 다운로드한 스킨)
router.get('/', async (req, res): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    let userId: string | null = null

    // 인증된 사용자인 경우 토큰에서 사용자 ID 추출
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const authClient = createAuthenticatedClient(token)
      const { data: { user } } = await authClient.auth.getUser()
      userId = user?.id || null
    }

    // 기본 제공 스킨 조회
    const { data: defaultSkins, error: defaultError } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, is_default, css_variables, layout_config, created_at')
      .eq('is_system', true)
      .eq('is_default', true)
      .order('created_at')

    if (defaultError) {
      res.status(500).json({ error: defaultError.message })
      return
    }

    let downloadedSkins: typeof defaultSkins = []

    // 로그인한 사용자인 경우 다운로드한 스킨도 조회
    if (userId) {
      const { data: library } = await supabase
        .from('user_skin_library')
        .select('skin_id')
        .eq('user_id', userId)

      if (library && library.length > 0) {
        const skinIds = library.map(l => l.skin_id)
        const { data: userSkins } = await supabase
          .from('blog_skins')
          .select('id, name, description, thumbnail_url, is_system, is_default, css_variables, layout_config, created_at')
          .in('id', skinIds)
          .order('created_at')

        downloadedSkins = userSkins || []
      }
    }

    // 중복 제거 후 합치기
    const allSkins = [...defaultSkins]
    for (const skin of downloadedSkins) {
      if (!allSkins.find(s => s.id === skin.id)) {
        allSkins.push(skin)
      }
    }

    res.json(allSkins)
  } catch (error) {
    console.error('Get skins error:', error)
    res.status(500).json({ error: 'Failed to get skins' })
  }
})

// 마켓플레이스 스킨 목록 조회 (다운로드 가능한 스킨)
router.get('/marketplace', async (req, res): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, is_default, css_variables, layout_config, created_at')
      .eq('is_system', true)
      .eq('is_default', false)
      .order('created_at')

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get marketplace skins error:', error)
    res.status(500).json({ error: 'Failed to get marketplace skins' })
  }
})

// 사용자의 스킨 라이브러리 조회 (다운로드한 스킨 ID 목록)
router.get('/library', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!

    const { data, error } = await supabase
      .from('user_skin_library')
      .select('skin_id, downloaded_at')
      .eq('user_id', user.id)

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

// 스킨 다운로드 (라이브러리에 추가)
router.post('/download/:skinId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { skinId } = req.params

    // 스킨 존재 확인
    const { data: skin } = await supabase
      .from('blog_skins')
      .select('id, is_system')
      .eq('id', skinId)
      .single()

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
      .single()

    if (existing) {
      res.status(400).json({ error: 'Already downloaded' })
      return
    }

    // 라이브러리에 추가
    const { data, error } = await authClient
      .from('user_skin_library')
      .insert({
        user_id: user.id,
        skin_id: skinId,
      })
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Download skin error:', error)
    res.status(500).json({ error: 'Failed to download skin' })
  }
})

// 스킨 상세 조회 (인증 불필요)
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('blog_skins')
      .select('id, name, description, thumbnail_url, is_system, css_variables, layout_config, created_at')
      .eq('id', id)
      .single()

    if (error) {
      res.status(404).json({ error: 'Skin not found' })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get skin error:', error)
    res.status(500).json({ error: 'Failed to get skin' })
  }
})

// 블로그에 적용된 스킨 조회 (인증 불필요)
router.get('/blog/:blogId', async (req, res): Promise<void> => {
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
      .single()

    if (error) {
      // 적용된 스킨이 없으면 null 반환
      if (error.code === 'PGRST116') {
        res.json(null)
        return
      }
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
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    // 스킨 존재 확인
    const { data: skin } = await supabase
      .from('blog_skins')
      .select('id')
      .eq('id', skin_id)
      .single()

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
      .single()

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
      .single()

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
        .single()

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
      .single()

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

export default router
