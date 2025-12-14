import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.service.js'

const router = Router()

// 글 검색
router.get('/posts', async (req: Request, res: Response): Promise<void> => {
    try {
        const query = (req.query.q as string) || ''
        const limit = parseInt(req.query.limit as string) || 20
        const offset = parseInt(req.query.offset as string) || 0

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

        // 각 포스트의 블로그 정보 가져오기
        const postsWithDetails = await Promise.all(
            (posts || []).map(async (post) => {
                const { data: blog } = await supabase
                    .from('blogs')
                    .select('id, name, thumbnail_url')
                    .eq('id', post.blog_id)
                    .single()

                return {
                    ...post,
                    blog: blog || null,
                }
            })
        )

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
        const limit = parseInt(req.query.limit as string) || 20
        const offset = parseInt(req.query.offset as string) || 0

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

        // 프로필 정보 가져오기
        const userIds = (blogs || []).map((b) => b.user_id)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, nickname, profile_image_url')
            .in('id', userIds)

        const profileMap = new Map(
            (profiles || []).map((p) => [p.id, p])
        )

        const blogsWithProfiles = (blogs || []).map((blog) => ({
            ...blog,
            profile: profileMap.get(blog.user_id) || null,
        }))

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
