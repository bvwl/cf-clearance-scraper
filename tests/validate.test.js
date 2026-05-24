process.env.NODE_ENV = 'development'
process.env.SKIP_LAUNCH = "true"
process.env.authToken = "123456"
process.env.browserLimit = -1

// 这个测试文件只验证入口层的鉴权和并发限制，不需要真的启动 Chromium。
// SKIP_LAUNCH=true 会跳过 createBrowser，browserLimit=-1 会让并发检查稳定触发 429。
const server = require('../src/index')
const request = require("supertest")
const reqValidate = require('../src/module/reqValidate')

const modes = ["source", "turnstile-min", "turnstile-max", "turnstile-session", "waf-session"]

function payloadForMode(mode, extra = {}) {
    return {
        url: 'https://turnstile.zeroclover.io/',
        mode,
        ...(mode === "turnstile-min" ? { siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0" } : {}),
        ...extra
    }
}

test('turnstile-session 模式可以通过请求体校验', () => {
    const check = reqValidate({
        url: 'https://turnstile.zeroclover.io/',
        mode: "turnstile-session",
        siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0",
        cookies: {
            cf_clearance: "test-clearance",
            ph_phc_tk2o4SiS2sDMPP3NP20jAzFAdHk24GhgB9qNv5DvGEj_posthog: "test-posthog"
        },
        headers: {
            "user-agent": "Mozilla/5.0",
            "accept-language": "zh-CN,zh;q=0.9"
        },
        authToken: "123456"
    })

    expect(check).toBe(true)
})

test('所有模式都可以不带 proxy cookies headers', () => {
    for (const mode of modes) {
        expect(reqValidate(payloadForMode(mode))).toBe(true)
    }
})

test('所有模式都可以带 proxy cookies headers', () => {
    for (const mode of modes) {
        const check = reqValidate(payloadForMode(mode, {
            proxy: {
                host: "127.0.0.1",
                port: 7890,
                username: "user",
                password: "pass"
            },
            cookies: {
                cf_clearance: "test-clearance"
            },
            headers: {
                "user-agent": "Mozilla/5.0",
                "accept-language": "zh-CN,zh;q=0.9"
            }
        }))

        expect(check).toBe(true)
    }
})

test('proxy 如果传入就必须包含 host 和 port', () => {
    const check = reqValidate(payloadForMode("source", {
        proxy: {
            host: "127.0.0.1"
        }
    }))

    expect(check).not.toBe(true)
})

test('请求缺少正确 authToken 时返回 401', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "source"
        })
        .expect(401)
}, 10000)

test('达到 browserLimit 限制时返回 429', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "source",
            authToken: "123456"
        })
        .expect(429)
}, 10000)
