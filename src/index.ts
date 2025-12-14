import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import uploadRouter from './routes/upload.js'
import postsRouter from './routes/posts.js'
import categoriesRouter from './routes/categories.js'
import profileRouter from './routes/profile.js'
import skinsRouter from './routes/skins.js'
import searchRouter from './routes/search.js'
import visitorRouter from './routes/visitors.js'

const app = express()

// Middleware
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}))
app.use(express.json())

// Routes
app.use('/api/upload', uploadRouter)
app.use('/api/posts', postsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/profile', profileRouter)
app.use('/api/skins', skinsRouter)
app.use('/api/search', searchRouter)
app.use('/api/visitors', visitorRouter)

// Root route
app.get('/', (req, res) => {
  res.send('Snuggle API Server is running')
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Start server
app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`)
})
