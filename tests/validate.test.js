process.env.NODE_ENV = 'development'
process.env.SKIP_LAUNCH = "true"
process.env.authToken = "123456"
process.env.browserLimit = -1

// 这个测试文件只验证入口层的鉴权和并发限制，不需要真的启动 Chromium。
// SKIP_LAUNCH=true 会跳过 createBrowser，browserLimit=-1 会让并发检查稳定触发 429。
const server = require('../src/index')
const request = require("supertest")
const reqValidate = require('../src/module/reqValidate')

test('turnstile-session 模式可以通过请求体校验', () => {
    const check = reqValidate({
        url: 'https://turnstile.zeroclover.io/',
        mode: "turnstile-session",
        authToken: "123456"
    })

    expect(check).toBe(true)
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
