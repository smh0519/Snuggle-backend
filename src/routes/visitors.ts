import { Router, Request, Response } from 'express'
import { trackVisitor, getDailyVisitorCount } from '../services/visitor.service.js'

const router = Router()

// 방문자 기록 (POST /api/visitors)
router.post('/', async (req: Request, res: Response) => {
    try {
        // 프록시 환경(Nginx, Cloudflare 등)을 고려하여 IP 추출
        const forwarded = req.headers['x-forwarded-for'] as string
        const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress || '127.0.0.1'

        // 비동기로 처리하여 응답 속도에 영향을 주지 않음
        trackVisitor(ip).catch(err => console.error('Visitor tracking failed:', err))

        res.status(200).json({ success: true })
    } catch (error) {
        console.error('Track visitor error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// 오늘의 방문자 수 조회 (GET /api/visitors/count)
router.get('/count', async (req: Request, res: Response) => {
    try {
        const count = await getDailyVisitorCount()
        res.json({ count })
    } catch (error) {
        console.error('Get visitor count error:', error)
        res.status(500).json({ error: 'Failed to get count' })
    }
})

export default router