const Ajv = require("ajv")
const addFormats = require("ajv-formats")

const ajv = new Ajv()
addFormats(ajv)

// API 请求体结构定义。这里限制 additionalProperties=false，
// 目的是尽早拦截拼写错误或调用方误传的字段，避免进入浏览器执行阶段才失败。
const schema = {
    "type": "object",
    "properties": {
        // mode 决定后续走哪个 endpoint，必须是下面这些固定值之一。
        "mode": {
            "type": "string",
            "enum": ["source", "turnstile-min", "turnstile-max", "turnstile-session", "waf-session"],
        },
        // 代理配置会传给 Puppeteer browser context；用户名密码是可选字段。
        "proxy": {
            "type": "object",
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer" },
                "username": { "type": "string" },
                "password": { "type": "string" }
            },
            "additionalProperties": false
        },
        // url 使用 ajv-formats 的 uri 校验，要求调用方传完整 URL。
        "url": {
            "type": "string",
            "format": "uri",
        },
        // 当服务端配置了 process.env.authToken 时，请求体必须带相同 authToken。
        "authToken": {
            "type": "string"
        },
        // turnstile-min 模式需要显式传入站点的 siteKey。
        "siteKey": {
            "type": "string"
        }
    },
    "required": ["mode", "url"],
    "additionalProperties": false
}

// const data = {
//     mode: "source",
//     url: "https://example.com",
//     proxy: {
//         host: "localhost",
//         port: 8080,
//         username: "test",
//         password: "test"
//     },
//     authToken: "123456"
// }


function validate(data) {
    // 校验成功返回 true；失败时返回 ajv.errors，入口层会把它放进响应 schema 字段。
    const valid = ajv.validate(schema, data)
    if (!valid) return ajv.errors
    else return true
}

module.exports = validate
