import Redis from 'ioredis'
import { env } from '../config/env.js'

// Next.js의 Hot Reloading 환경에서 연결이 중복 생성되는 것을 방지하기 위한 싱글톤 패턴
const globalWithRedis = global as typeof globalThis & {
  redis: Redis
}

let redis: Redis

if (!globalWithRedis.redis) {
  const client = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    // Upstash 등 클라우드 Redis 사용 시 TLS 연결 활성화
    tls: env.redis.host.includes('upstash') ? {} : undefined,
    // 연결 끊김 시 자동 재연결 전략 설정
    retryStrategy: (times) => {
      // 재연결 시도 횟수에 따라 대기 시간 증가 (최대 2초)
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  })

  client.on('connect', () => console.log('Redis Connected'))
  client.on('error', (err) => console.error('Redis Connection Error:', err))
  client.on('reconnecting', () => console.log('Redis Reconnecting...'))

  globalWithRedis.redis = client
}

redis = globalWithRedis.redis

export default redis
