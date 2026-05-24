const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const bodyParser = require('body-parser')
const authToken = process.env.authToken || null
const cors = require('cors')
const reqValidate = require('./module/reqValidate')

// 当前正在执行的浏览器上下文数量。这里不是浏览器进程数量，而是并发任务数。
global.browserLength = 0
// 最大并发任务数，超过后直接返回 429，避免同一个浏览器被过多页面压垮。
global.browserLimit = Number(process.env.browserLimit) || 20
// 全局请求超时时间，既用于 HTTP server，也会被各 endpoint 用作页面处理超时。
global.timeOut = Number(process.env.timeOut || 60000)

app.use(bodyParser.json({ limit: '2mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }))
app.use(cors())
if (process.env.NODE_ENV !== 'development') {
    let server = app.listen(port, () => { console.log(`服务已启动，监听端口 ${port}`) })
    try {
        server.timeout = global.timeOut
    } catch (e) { }
}
// 测试环境可以通过 SKIP_LAUNCH 跳过真实浏览器启动，方便只测试请求校验和限流逻辑。
if (process.env.SKIP_LAUNCH != 'true') require('./module/createBrowser')

const getSource = require('./endpoints/getSource')
const solveTurnstileMin = require('./endpoints/solveTurnstile.min')
const solveTurnstileMax = require('./endpoints/solveTurnstile.max')
const turnstileSession = require('./endpoints/turnstileSession')
const wafSession = require('./endpoints/wafSession')

function errorMessage(err) {
    // endpoint 内部既可能 reject Error，也可能 reject 字符串；统一转换后返回给调用方。
    return err?.message || String(err || '未知错误')
}

app.post('/cf-clearance-scraper', async (req, res) => {

    const data = req.body

    // 所有业务模式共用同一套 JSON Schema，非法字段和缺少必填字段会在这里拦截。
    const check = reqValidate(data)

    if (check !== true) return res.status(400).json({ code: 400, message: '请求参数不合法', schema: check })

    if (authToken && data.authToken !== authToken) return res.status(401).json({ code: 401, message: '认证失败' })

    if (global.browserLength >= global.browserLimit) return res.status(429).json({ code: 429, message: '请求过多，请稍后再试' })

    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({ code: 500, message: '浏览器尚未准备好，请稍后重试' })

    let result = { code: 500 }

    // 用 try/finally 保护并发计数，避免 endpoint 内部出现未预期异常时 browserLength 无法回落。
    global.browserLength++

    try {
        switch (data.mode) {
            case "source":
                // 返回目标页面最终 HTML，适合只需要页面源码的场景。
                result = await getSource(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: errorMessage(err) } })
                break;
            case "turnstile-min":
                // 最小资源模式：拦截目标文档请求，替换成一个只渲染 Turnstile 的本地页面。
                result = await solveTurnstileMin(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: errorMessage(err) } })
                break;
            case "turnstile-max":
                // 完整加载模式：真实访问页面，在页面脚本里等待 turnstile 返回 token。
                result = await solveTurnstileMax(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: errorMessage(err) } })
                break;
            case "turnstile-session":
                // 组合模式：在同一个 browser context 中返回 Turnstile token、cookies 和可复用 headers。
                result = await turnstileSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: errorMessage(err) } })
                break;
            case "waf-session":
                // 返回 cookies 和浏览器请求头，调用方可用这些信息复用一次已通过 Cloudflare WAF 的会话。
                result = await wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: errorMessage(err) } })
                break;
        }
    } finally {
        global.browserLength--
    }

    res.status(result.code ?? 500).send(result)
})

app.use((req, res) => { res.status(404).json({ code: 404, message: '接口不存在' }) })

if (process.env.NODE_ENV == 'development') module.exports = app
