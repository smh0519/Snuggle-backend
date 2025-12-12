import { Router, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js'
import { uploadToR2, deleteFromR2, getKeyFromUrl } from '../services/r2.service.js'
import { env } from '../config/env.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})

// 영구 이미지 업로드 (발행된 게시글용)
router.post(
  '/',
  authMiddleware,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const file = req.file
      const user = req.user!

      if (!file) {
        res.status(400).json({ error: 'No file provided' })
        return
      }

      // 파일 타입 검증 (GIF 제외)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(file.mimetype)) {
        res.status(400).json({ error: 'JPG, PNG, WEBP 파일만 업로드 가능합니다' })
        return
      }

      // 파일 크기 제한 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        res.status(400).json({ error: 'File too large (max 5MB)' })
        return
      }

      // 파일 이름 생성
      const ext = file.originalname.split('.').pop()
      const key = `blog/${user.id}/${Date.now()}.${ext}`

      const url = await uploadToR2(file.buffer, key, file.mimetype)

      res.json({ url })
    } catch (error) {
      console.error('Upload error:', error)
      res.status(500).json({ error: 'Upload failed' })
    }
  }
)

// 임시 이미지 업로드 (드래프트용)
router.post(
  '/temp',
  authMiddleware,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const file = req.file
      const user = req.user!

      if (!file) {
        res.status(400).json({ error: 'No file provided' })
        return
      }

      // 파일 타입 검증
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.mimetype)) {
        res.status(400).json({ error: 'JPG, PNG, WEBP, GIF 파일만 업로드 가능합니다' })
        return
      }

      // 파일 크기 제한 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        res.status(400).json({ error: '파일 크기는 10MB 이하여야 합니다' })
        return
      }

      // 파일 확장자 추출
      const ext = file.originalname.split('.').pop()?.toLowerCase() || 'png'

      // temp 폴더에 고유한 파일명으로 저장
      const key = `temp/${user.id}/${uuidv4()}.${ext}`

      const url = await uploadToR2(file.buffer, key, file.mimetype)

      res.json({ url })
    } catch (error) {
      console.error('Upload error:', error)
      res.status(500).json({ error: 'Upload failed' })
    }
  }
)

// 임시 이미지 삭제
router.delete(
  '/temp',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!
      const { url } = req.body

      if (!url) {
        res.status(400).json({ error: 'No URL provided' })
        return
      }

      const key = getKeyFromUrl(url)

      if (!key) {
        res.status(400).json({ error: 'Invalid URL' })
        return
      }

      // temp 폴더의 해당 사용자 파일인지 확인
      if (!key.startsWith(`temp/${user.id}/`)) {
        res.status(403).json({ error: 'Unauthorized' })
        return
      }

      await deleteFromR2(key)

      res.json({ success: true })
    } catch (error) {
      console.error('Delete error:', error)
      res.status(500).json({ error: 'Delete failed' })
    }
  }
)

export default router
