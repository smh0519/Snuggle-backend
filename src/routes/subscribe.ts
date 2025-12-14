import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.service.js'

const router = Router()

// 구독 수 조회 (팔로워/팔로잉 수)
router.get('/counts', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.query.userId as string

        if (!userId) {
            res.status(400).json({ error: 'userId is required' })
            return
        }

        // 팔로워 수 (나를 구독하는 사람)
        const { count: followerCount } = await supabase
            .from('subscribe')
            .select('id', { count: 'exact', head: true })
            .eq('subed_id', userId)

        // 팔로잉 수 (내가 구독하는 사람)
        const { count: followingCount } = await supabase
            .from('subscribe')
            .select('id', { count: 'exact', head: true })
            .eq('sub_id', userId)

        res.json({
            followers: followerCount || 0,
            following: followingCount || 0,
        })
    } catch (error) {
        console.error('Get subscription counts error:', error)
        res.status(500).json({ error: 'Failed to get subscription counts' })
    }
})

// 팔로잉 목록 조회 (내가 구독하는 사용자 ID 목록)
router.get('/following', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.query.userId as string

        if (!userId) {
            res.status(400).json({ error: 'userId is required' })
            return
        }

        const { data, error } = await supabase
            .from('subscribe')
            .select('subed_id')
            .eq('sub_id', userId)

        if (error) {
            res.status(500).json({ error: error.message })
            return
        }

        const followingIds = (data || []).map(row => row.subed_id)
        res.json(followingIds)
    } catch (error) {
        console.error('Get following error:', error)
        res.status(500).json({ error: 'Failed to get following list' })
    }
})

export default router
