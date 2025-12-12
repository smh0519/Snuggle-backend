import { Router, Request, Response } from 'express'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { createAuthenticatedClient, supabase } from '../services/supabase.service.js'

const router = Router()

// HTML content에서 첫 번째 이미지 URL 추출
function extractFirstImageUrl(content: string): string | null {
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/)
  return imgMatch ? imgMatch[1] : null
}

// 전체 게시글 목록 (공개글만, 인증 불필요)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 20
    const offset = parseInt(req.query.offset as string) || 0

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, title, content, thumbnail_url, created_at, blog_id')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    // 각 포스트의 블로그 정보 가져오기
    const postsWithDetails = await Promise.all(
      (posts || []).map(async (post) => {
        const { data: blog } = await supabase
          .from('blogs')
          .select('name, thumbnail_url')
          .eq('id', post.blog_id)
          .single()

        return {
          ...post,
          blog: blog ? { name: blog.name, thumbnail_url: blog.thumbnail_url } : null,
        }
      })
    )

    res.json(postsWithDetails)
  } catch (error) {
    console.error('Get posts error:', error)
    res.status(500).json({ error: 'Failed to get posts' })
  }
})

// 블로그별 게시글 목록
router.get('/blog/:blogId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { blogId } = req.params
    const showAll = req.query.showAll === 'true'
    const authHeader = req.headers.authorization
    let isOwner = false

    // 인증된 사용자인 경우 소유자 확인
    if (authHeader?.startsWith('Bearer ') && showAll) {
      const token = authHeader.split(' ')[1]
      const authClient = createAuthenticatedClient(token)
      const { data: { user } } = await authClient.auth.getUser()

      if (user) {
        const { data: blog } = await supabase
          .from('blogs')
          .select('user_id')
          .eq('id', blogId)
          .single()

        isOwner = blog?.user_id === user.id
      }
    }

    let query = supabase
      .from('posts')
      .select('*')
      .eq('blog_id', blogId)
      .order('created_at', { ascending: false })

    // 소유자가 아니면 공개글만
    if (!isOwner) {
      query = query.eq('published', true)
    }

    const { data, error } = await query

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json(data)
  } catch (error) {
    console.error('Get blog posts error:', error)
    res.status(500).json({ error: 'Failed to get blog posts' })
  }
})

// 게시글 상세 조회
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const authHeader = req.headers.authorization

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single()

    if (postError || !post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }

    // 블로그 정보
    const { data: blog } = await supabase
      .from('blogs')
      .select('id, user_id, name, thumbnail_url')
      .eq('id', post.blog_id)
      .single()

    if (!blog) {
      res.status(404).json({ error: 'Blog not found' })
      return
    }

    // 비공개 글 접근 권한 확인
    if (!post.published) {
      let isOwner = false

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1]
        const authClient = createAuthenticatedClient(token)
        const { data: { user } } = await authClient.auth.getUser()
        isOwner = user?.id === blog.user_id
      }

      if (!isOwner) {
        res.status(404).json({ error: 'Post not found' })
        return
      }
    }

    // 카테고리 정보
    let category = null
    if (post.category_id) {
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id, name')
        .eq('id', post.category_id)
        .single()
      category = categoryData
    }

    // 프로필 정보
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nickname, profile_image_url')
      .eq('id', blog.user_id)
      .single()

    res.json({
      ...post,
      blog,
      category,
      profile,
    })
  } catch (error) {
    console.error('Get post error:', error)
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// 게시글 생성 (인증 필요)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { blog_id, title, content, category_ids, published } = req.body

    if (!blog_id || !title) {
      res.status(400).json({ error: 'blog_id and title are required' })
      return
    }

    // 블로그 소유자 확인
    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', blog_id)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized to post to this blog' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    // content에서 첫 번째 이미지를 썸네일로 추출
    const thumbnailUrl = content ? extractFirstImageUrl(content) : null

    const { data, error } = await authClient
      .from('posts')
      .insert({
        blog_id,
        user_id: user.id,
        title: title.trim(),
        content: content || '',
        published: published ?? true,
        thumbnail_url: thumbnailUrl,
      })
      .select()
      .single()

    if (error) {
      console.error('Insert error:', error)
      res.status(500).json({ error: error.message })
      return
    }

    // 카테고리 연결 (다중 카테고리)
    if (category_ids && Array.isArray(category_ids) && category_ids.length > 0) {
      const postCategories = category_ids.slice(0, 5).map((categoryId: string) => ({
        post_id: data.id,
        category_id: categoryId,
      }))

      await authClient
        .from('post_categories')
        .insert(postCategories)
    }

    res.status(201).json(data)
  } catch (error) {
    console.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// 게시글 수정 (인증 필요)
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, category_ids, published } = req.body

    // 게시글 소유자 확인
    const { data: post } = await supabase
      .from('posts')
      .select('blog_id')
      .eq('id', id)
      .single()

    if (!post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }

    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', post.blog_id)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized to edit this post' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title.trim()
    if (content !== undefined) {
      updateData.content = content
      // content가 변경되면 썸네일도 업데이트
      updateData.thumbnail_url = extractFirstImageUrl(content)
    }
    if (published !== undefined) updateData.published = published

    const { data, error } = await authClient
      .from('posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    // 카테고리 업데이트 (기존 삭제 후 새로 추가)
    if (category_ids !== undefined && Array.isArray(category_ids)) {
      // 기존 카테고리 연결 삭제
      await authClient
        .from('post_categories')
        .delete()
        .eq('post_id', id)

      // 새 카테고리 연결
      if (category_ids.length > 0) {
        const postCategories = category_ids.slice(0, 5).map((categoryId: string) => ({
          post_id: id,
          category_id: categoryId,
        }))

        await authClient
          .from('post_categories')
          .insert(postCategories)
      }
    }

    res.json(data)
  } catch (error) {
    console.error('Update post error:', error)
    res.status(500).json({ error: 'Failed to update post' })
  }
})

// 게시글 삭제 (인증 필요)
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!
    const { id } = req.params

    // 게시글 소유자 확인
    const { data: post } = await supabase
      .from('posts')
      .select('blog_id')
      .eq('id', id)
      .single()

    if (!post) {
      res.status(404).json({ error: 'Post not found' })
      return
    }

    const { data: blog } = await supabase
      .from('blogs')
      .select('user_id')
      .eq('id', post.blog_id)
      .single()

    if (!blog || blog.user_id !== user.id) {
      res.status(403).json({ error: 'Not authorized to delete this post' })
      return
    }

    const token = req.headers.authorization!.split(' ')[1]
    const authClient = createAuthenticatedClient(token)

    const { error } = await authClient
      .from('posts')
      .delete()
      .eq('id', id)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Delete post error:', error)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

export default router
