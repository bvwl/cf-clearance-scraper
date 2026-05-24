const { normalizeHeaders } = require('../src/module/applyHeaders')

test('请求头会归一化为小写字符串值', () => {
    const headers = normalizeHeaders({
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'X-Number': 123,
    })

    expect(headers).toEqual({
        'user-agent': 'Mozilla/5.0',
        'accept-language': 'zh-CN,zh;q=0.9',
        'x-number': '123',
    })
})

test('非法 headers 输入会返回空对象', () => {
    expect(normalizeHeaders(null)).toEqual({})
    expect(normalizeHeaders([])).toEqual({})
})

test('容易和浏览器内部状态冲突的 headers 会被过滤', () => {
    const headers = normalizeHeaders({
        cookie: 'cf_clearance=abc',
        Host: 'example.com',
        'Content-Length': '100',
        referer: 'https://example.com/',
    })

    expect(headers).toEqual({
        referer: 'https://example.com/',
    })
})
