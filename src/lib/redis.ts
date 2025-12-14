import Redis from 'ioredis'
import { env } from '../config/env.js'

const redis = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
})

export default redis