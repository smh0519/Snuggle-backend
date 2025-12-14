import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import uploadRouter from './routes/upload.js'
import postsRouter from './routes/posts.js'
import categoriesRouter from './routes/categories.js'
import profileRouter from './routes/profile.js'
import skinsRouter from './routes/skins.js'
import searchRouter from './routes/search.js'
import blogsRouter from './routes/blogs.js'
import forumRouter from './routes/forum.js'
import subscribeRouter from './routes/subscribe.js'

const app = express()

// Middleware
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // IP당 최대 1000 요청
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 30, // IP당 최대 30 요청
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10, // IP당 최대 10 업로드
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many uploads, please try again later.' })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 60, // IP당 최대 60 검색
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many search requests, please try again later.' })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// 전역 Rate Limiting 적용
app.use(generalLimiter)

// Routes with specific rate limits
app.use('/api/upload', uploadLimiter, uploadRouter)
app.use('/api/posts', postsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/profile', strictLimiter, profileRouter)
app.use('/api/skins', skinsRouter)
app.use('/api/search', searchLimiter, searchRouter)
app.use('/api/blogs', blogsRouter)
app.use('/api/forum', forumRouter)
app.use('/api/subscribe', subscribeRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Start server
app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`)
})
