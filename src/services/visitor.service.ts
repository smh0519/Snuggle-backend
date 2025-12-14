import redis from '../lib/redis.js'

// 한국 시간(KST) 기준 날짜 문자열 반환 (YYYY-MM-DD)
const getTodayKey = () => {
    const kstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)
    const dateString = kstDate.toISOString().split('T')[0]
    return `snuggle:visitors:${dateString}`
}

export const trackVisitor = async (ip: string) => {
    const key = getTodayKey()

    // 1. IP를 Set에 추가 (이미 존재하면 무시됨 -> 중복 방지)
    await redis.sadd(key, ip)

    // 2. 키 만료 시간 설정 (48시간)
    await redis.expire(key, 60 * 60 * 48)
}

export const getDailyVisitorCount = async () => {
    const key = getTodayKey()
    // Set에 저장된 아이템 개수(방문자 수) 반환
    return await redis.scard(key)
}