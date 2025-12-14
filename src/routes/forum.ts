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

// 입력값 길이 검증
function validateStringLength(value: string, maxLength: number): string {
  return value.slice(0, maxLength)
}

// ===== 특정 경로 라우트 (/:id 보다 먼저 선언해야 함) =====

// 댓글 작성 (인증 필요)
router.post('/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const user = req.user!
        const { forum_id, blog_id, content, parent_id } = req.body

        if (!forum_id || !blog_id || !content) {
            res.status(400).json({ error: 'forum_id, blog_id, and content are required' })
            return
        }

        // 입력값 길이 검증
        const validatedContent = validateStringLength(content, 5000)

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

        const token = req.headers.authorization!.split(' ')[1]
        const authClient = createAuthenticatedClient(token)

        const { data, error } = await authClient
            .from('forum_comments')
            .insert({
                forum_id,
                user_id: user.id,
                blog_id,
                content: validatedContent,
                parent_id: parent_id || null,
            })
            .select()
            .single()

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        res.status(201).json(data)
    } catch (error) {
        console.error('Create comment error:', error)
        res.status(500).json({ error: 'Failed to create comment' })
    }
})

// 댓글 목록 조회 - /:id/comments 보다 먼저 매칭되지 않도록 별도 처리 필요
// Express에서 /:id가 먼저 오면 "comments"도 id로 인식됨
// 따라서 /:id/comments를 명시적으로 먼저 선언

// 댓글 목록 조회
router.get('/:id/comments', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params

        const { data: comments, error } = await supabase
            .from('forum_comments')
            .select('id, content, created_at, user_id, blog_id, parent_id')
            .eq('forum_id', id)
            .order('created_at', { ascending: true })

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        // 블로그 정보 일괄 조회 (N+1 쿼리 방지)
        const blogIds = [...new Set((comments || []).map(c => c.blog_id))]

        let blogMap = new Map<string, { name: string; thumbnail_url: string | null }>()
        if (blogIds.length > 0) {
            const { data: blogs } = await supabase
                .from('blogs')
                .select('id, name, thumbnail_url')
                .in('id', blogIds)

            blogMap = new Map(
                (blogs || []).map((b) => [b.id, { name: b.name, thumbnail_url: b.thumbnail_url }])
            )
        }

        // 댓글에 블로그 정보 추가 및 대댓글 구조화
        const commentsWithBlog = (comments || []).map(comment => ({
            ...comment,
            blog: blogMap.get(comment.blog_id) || null,
        }))

        // 대댓글 구조화 (parent_id가 null인 것이 최상위)
        const topLevelComments = commentsWithBlog.filter(c => !c.parent_id)
        const replies = commentsWithBlog.filter(c => c.parent_id)

        const commentsWithReplies = topLevelComments.map(comment => ({
            ...comment,
            replies: replies.filter(r => r.parent_id === comment.id),
        }))

        res.json(commentsWithReplies)
    } catch (error) {
        console.error('Get comments error:', error)
        res.status(500).json({ error: 'Failed to get comments' })
    }
})

// ===== 일반 경로 라우트 =====

// 포럼 목록 조회
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { limit, offset } = validatePagination(req.query.limit as string, req.query.offset as string)

        const { data: forums, error } = await supabase
            .from('forum')
            .select('id, title, description, created_at, user_id, blog_id, view_count')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        // 블로그 ID와 포럼 ID 수집
        const blogIds = [...new Set((forums || []).map(f => f.blog_id))]
        const forumIds = (forums || []).map(f => f.id)

        // 블로그 정보 일괄 조회 (N+1 쿼리 방지)
        const { data: blogs } = await supabase
            .from('blogs')
            .select('id, name, thumbnail_url')
            .in('id', blogIds)

        const blogMap = new Map(
            (blogs || []).map((b) => [b.id, { name: b.name, thumbnail_url: b.thumbnail_url }])
        )

        // 댓글 수 일괄 조회 (N+1 쿼리 방지)
        const { data: commentCounts } = await supabase
            .from('forum_comments')
            .select('forum_id')
            .in('forum_id', forumIds)

        const commentCountMap = new Map<string, number>()
        for (const c of commentCounts || []) {
            commentCountMap.set(c.forum_id, (commentCountMap.get(c.forum_id) || 0) + 1)
        }

        const forumsWithDetails = (forums || []).map(forum => ({
            ...forum,
            blog: blogMap.get(forum.blog_id) || null,
            comment_count: commentCountMap.get(forum.id) || 0,
        }))

        res.json(forumsWithDetails)
    } catch (error) {
        console.error('Get forums error:', error)
        res.status(500).json({ error: 'Failed to get forums' })
    }
})

// 포럼 글 작성 (인증 필요)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const user = req.user!
        const { title, description, blog_id } = req.body

        if (!title || !description || !blog_id) {
            res.status(400).json({ error: 'title, description, and blog_id are required' })
            return
        }

        // 입력값 길이 검증
        const validatedTitle = validateStringLength(title.trim(), 200)
        const validatedDescription = validateStringLength(description, 10000)

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

        const token = req.headers.authorization!.split(' ')[1]
        const authClient = createAuthenticatedClient(token)

        const { data, error } = await authClient
            .from('forum')
            .insert({
                title: validatedTitle,
                description: validatedDescription,
                user_id: user.id,
                blog_id,
                view_count: 0,
            })
            .select()
            .single()

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        res.status(201).json(data)
    } catch (error) {
        console.error('Create forum error:', error)
        res.status(500).json({ error: 'Failed to create forum post' })
    }
})

// 포럼 상세 조회 - 가장 마지막에 선언 (/:id 패턴)
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params

        const { data: forum, error } = await supabase
            .from('forum')
            .select('id, title, description, created_at, user_id, blog_id, view_count')
            .eq('id', id)
            .maybeSingle()

        if (error || !forum) {
            res.status(404).json({ error: 'Forum post not found' })
            return
        }

        // 조회수 증가 (비동기로 처리, 실패해도 응답에 영향 없음)
        void supabase
            .from('forum')
            .update({ view_count: (forum.view_count || 0) + 1 })
            .eq('id', id)

        // 블로그 정보
        const { data: blog } = await supabase
            .from('blogs')
            .select('name, thumbnail_url')
            .eq('id', forum.blog_id)
            .maybeSingle()

        // 댓글 수
        const { count: commentCount } = await supabase
            .from('forum_comments')
            .select('id', { count: 'exact', head: true })
            .eq('forum_id', id)

        res.json({
            ...forum,
            view_count: (forum.view_count || 0) + 1,
            blog: blog || null,
            comment_count: commentCount || 0,
        })
    } catch (error) {
        console.error('Get forum error:', error)
        res.status(500).json({ error: 'Failed to get forum' })
    }
})

export default router
