process.env.NODE_ENV = 'development'
const server = require('../src/index')
const request = require("supertest")

beforeAll(async () => {
    // endpoint 集成测试需要真实浏览器。这里等待 createBrowser.js 把 global.browser 初始化完成。
    while (!global.browser) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}, 30000);


afterAll(async () => {
    // 告诉 createBrowser.js 不要在测试退出时继续自动重连，然后关闭浏览器释放资源。
    global.finished = true
    await global.browser.close()
})


test('从 Cloudflare WAF 页面获取源码', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "source"
        })
        .expect(200)
        .then(response => { expect(response.body.code).toEqual(200); })
}, 60000)


test('使用最小资源模式创建 Turnstile token', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://turnstile.zeroclover.io/',
            siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0",
            mode: "turnstile-min"
        })
        .expect(200)
        .then(response => { expect(response.body.code).toEqual(200); })
}, 60000)

test('使用完整页面加载模式创建 Turnstile token', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://turnstile.zeroclover.io/',
            mode: "turnstile-max"
        })
        .expect(200)
        .then(response => { expect(response.body.code).toEqual(200); })
}, 60000)

test('同一会话中创建 Turnstile token 并返回 cookies', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://turnstile.zeroclover.io/',
            siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0",
            mode: "turnstile-session"
        })
        .expect(200)
        .then(response => {
            expect(response.body.code).toEqual(200);
            expect(response.body.token).toBeTruthy();
            expect(Array.isArray(response.body.cookies)).toBe(true);
        })
}, 60000)

test('创建 Cloudflare WAF session', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "waf-session"
        })
        .expect(200)
        .then(response => { expect(response.body.code).toEqual(200); })
}, 60000)
