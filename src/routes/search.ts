import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.service.js'

const router = Router()

// 파라미터 검증 헬퍼 함수
function validatePagination(limitStr: string | undefined, offsetStr: string | undefined): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, parseInt(limitStr as string) || 20), 100)
  const offset = Math.max(0, parseInt(offsetStr as string) || 0)
  return { limit, offset }
}

// 글 검색
router.get('/posts', async (req: Request, res: Response): Promise<void> => {
    try {
        const query = (req.query.q as string) || ''
        const { limit, offset } = validatePagination(req.query.limit as string, req.query.offset as string)

        if (!query.trim()) {
            res.json([])
            return
        }

        const searchQuery = `%${query.trim()}%`

        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, title, content, thumbnail_url, created_at, blog_id')
            .eq('published', true)
            .or(`title.ilike.${searchQuery},content.ilike.${searchQuery}`)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        // 블로그 ID 일괄 조회 (N+1 쿼리 방지)
        const blogIds = [...new Set((posts || []).map(p => p.blog_id))]

        let blogMap = new Map<string, { id: string; name: string; thumbnail_url: string | null }>()
        if (blogIds.length > 0) {
            const { data: blogs } = await supabase
                .from('blogs')
                .select('id, name, thumbnail_url')
                .in('id', blogIds)

            blogMap = new Map(
                (blogs || []).map((b) => [b.id, { id: b.id, name: b.name, thumbnail_url: b.thumbnail_url }])
            )
        }

        const postsWithDetails = (posts || []).map(post => ({
            ...post,
            blog: blogMap.get(post.blog_id) || null,
        }))

        res.json(postsWithDetails)
    } catch (error) {
        console.error('Search posts error:', error)
        res.status(500).json({ error: 'Failed to search posts' })
    }
})

// 블로그 검색
router.get('/blogs', async (req: Request, res: Response): Promise<void> => {
    try {
        const query = (req.query.q as string) || ''
        const { limit, offset } = validatePagination(req.query.limit as string, req.query.offset as string)

        if (!query.trim()) {
            res.json([])
            return
        }

        const searchQuery = `%${query.trim()}%`

        const { data: blogs, error } = await supabase
            .from('blogs')
            .select('id, name, description, thumbnail_url, user_id, created_at')
            .or(`name.ilike.${searchQuery},description.ilike.${searchQuery}`)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        // 프로필 정보 일괄 조회 (N+1 쿼리 방지)
        const userIds = [...new Set((blogs || []).map((b) => b.user_id))]

        let profileMap = new Map<string, { id: string; nickname: string | null; profile_image_url: string | null }>()
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nickname, profile_image_url')
                .in('id', userIds)

            profileMap = new Map(
                (profiles || []).map((p) => [p.id, p])
            )
        }

        const blogsWithProfiles = (blogs || []).map((blog) => {
            const profile = profileMap.get(blog.user_id)
            return {
                ...blog,
                profile: profile || {
                    id: blog.user_id,
                    nickname: null,
                    profile_image_url: null,
                },
            }
        })

        res.json(blogsWithProfiles)
    } catch (error) {
        console.error('Search blogs error:', error)
        res.status(500).json({ error: 'Failed to search blogs' })
    }
})

// 검색어 자동완성 추천
router.get('/suggest', async (req: Request, res: Response): Promise<void> => {
    try {
        const query = (req.query.q as string) || ''

        if (!query.trim() || query.trim().length < 2) {
            res.json({ posts: [], blogs: [], categories: [] })
            return
        }

        const searchQuery = `%${query.trim()}%`

        // 병렬로 3개 테이블 조회
        const [postsResult, blogsResult, categoriesResult] = await Promise.all([
            // 게시글 제목 검색 (공개된 글만)
            supabase
                .from('posts')
                .select('id, title, blog_id')
                .eq('published', true)
                .ilike('title', searchQuery)
                .order('created_at', { ascending: false })
                .limit(5),

            // 블로그 이름 검색
            supabase
                .from('blogs')
                .select('id, name, thumbnail_url')
                .ilike('name', searchQuery)
                .order('created_at', { ascending: false })
                .limit(3),

            // 카테고리 이름 검색
            supabase
                .from('categories')
                .select('id, name, blog_id')
                .ilike('name', searchQuery)
                .limit(3),
        ])

        res.json({
            posts: postsResult.data || [],
            blogs: blogsResult.data || [],
            categories: categoriesResult.data || [],
        })
    } catch (error) {
        console.error('Search suggest error:', error)
        res.status(500).json({ error: 'Failed to get suggestions' })
    }
})

export default router
