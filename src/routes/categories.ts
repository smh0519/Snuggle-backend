import { Router, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient, supabase } from '../services/supabase.service.js'

const router = Router()

// 블로그별 카테고리 목록 (인증 불필요)
router.get('/blog/:blogId', async (req, res): Promise<void> => {
  try {
    const { blogId } = req.params

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, blog_id')
      .eq('blog_id', blogId)
      .order('name')

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get categories error:', error)
    res.status(500).json({ error: 'Failed to get categories' })
  }
})

// 카테고리 추가 (인증 필요)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blog_id, name } = req.body

    if (!blog_id || !name) {
      res.status(400).json({ error: 'blog_id and name are required' })
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

    // 중복 체크
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('blog_id', blog_id)
      .ilike('name', name.trim())
      .single()

    if (existing) {
      res.status(400).json({ error: '이미 존재하는 카테고리입니다' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { data, error } = await authClient
      .from('categories')
      .insert({
        blog_id,
        name: name.trim(),
      })
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.status(201).json(data)
  } catch (error) {
    console.error('Create category error:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// 카테고리 삭제 (인증 필요)
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { id } = req.params

    // 카테고리 소유자 확인
    const { data: category } = await supabase
      .from('categories')
      .select('blog_id')
      .eq('id', id)
      .single()

    if (!category) {
      res.status(404).json({ error: 'Category not found' })
      return
    }

    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', category.blog_id)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { error } = await authClient
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Delete category error:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

export default router
