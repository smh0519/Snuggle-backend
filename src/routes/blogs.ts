import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.service.js'

const router = Router()

// 파라미터 검증 헬퍼 함수
function validatePagination(limitStr: string | undefined, offsetStr: string | undefined): { limit: number; offset: number } {
    const limit = Math.min(Math.max(1, parseInt(limitStr as string) || 20), 100)
    const offset = Math.max(0, parseInt(offsetStr as string) || 0)
    return { limit, offset }
}

// 신규 블로거 목록 (최근 생성된 블로그)
router.get('/new', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 3

        const { data: blogs, error } = await supabase
            .from('blogs')
            .select('id, name, description, thumbnail_url, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        // 프로필 이미지 가져오기
        const userIds = (blogs || []).map((b) => b.user_id)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, profile_image_url')
            .in('id', userIds)

        const profileMap = new Map(
            (profiles || []).map((p) => [p.id, p.profile_image_url])
        )

        const blogsWithProfile = (blogs || []).map((blog) => ({
            id: blog.id,
            name: blog.name,
            description: blog.description,
            thumbnail_url: blog.thumbnail_url,
            profile_image_url: profileMap.get(blog.user_id) || null,
            created_at: blog.created_at,
        }))

        res.json(blogsWithProfile)
    } catch (error) {
        console.error('Get new blogs error:', error)
        res.status(500).json({ error: 'Failed to get new blogs' })
    }
})

// 블로그 상세 조회
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params

        const { data: blog, error } = await supabase
            .from('blogs')
            .select('id, name, description, thumbnail_url, user_id, created_at')
            .eq('id', id)
            .maybeSingle()

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        if (!blog) {
            res.status(404).json({ error: 'Blog not found' })
            return
        }

        // 프로필 정보 가져오기
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, nickname, profile_image_url')
            .eq('id', blog.user_id)
            .maybeSingle()

        // 구독자 수 가져오기
        const { count: subscriberCount } = await supabase
            .from('subscribe')
            .select('id', { count: 'exact', head: true })
            .eq('subed_id', blog.user_id)

        // 게시글 수 가져오기
        const { count: postCount } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('blog_id', id)
            .eq('published', true)

        res.json({
            ...blog,
            profile: profile || null,
            subscriber_count: subscriberCount || 0,
            post_count: postCount || 0,
        })
    } catch (error) {
        console.error('Get blog error:', error)
        res.status(500).json({ error: 'Failed to get blog' })
    }
})

export default router
