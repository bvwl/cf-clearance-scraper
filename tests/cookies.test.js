const { normalizeCookies } = require('../src/module/applyCookies')

test('对象格式 cookies 会转换为 Puppeteer cookies', () => {
    const cookies = normalizeCookies('https://example.com/path', {
        cf_clearance: 'clearance-value',
        empty_cookie: '',
    })

    expect(cookies).toEqual([
        {
            name: 'cf_clearance',
            value: 'clearance-value',
            url: 'https://example.com/path',
        },
        {
            name: 'empty_cookie',
            value: '',
            url: 'https://example.com/path',
        },
    ])
})

test('数组格式 cookies 可以直接复用并保留 domain', () => {
    const cookies = normalizeCookies('https://example.com/path', [
        {
            name: 'cf_clearance',
            value: 'clearance-value',
            domain: '.example.com',
            path: '/',
            httpOnly: true,
            secure: true,
        },
    ])

    expect(cookies).toEqual([
        {
            name: 'cf_clearance',
            value: 'clearance-value',
            domain: '.example.com',
            path: '/',
            httpOnly: true,
            secure: true,
            url: undefined,
        },
    ])
})
