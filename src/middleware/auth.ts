import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
  }
}

const supabase = createClient(env.supabase.url, env.supabase.anonKey)

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    req.user = {
      id: user.id,
      email: user.email,
    }

    next()
  } catch {
    res.status(401).json({ error: 'Token verification failed' })
  }
}
