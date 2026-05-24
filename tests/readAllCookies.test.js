const readAllCookies = require('../src/module/readAllCookies')

test('优先通过 CDP 读取全部 cookies', async () => {
    const detach = jest.fn(async () => {})
    const send = jest.fn(async () => ({
        cookies: [{ name: 'cf_clearance', value: 'ok' }]
    }))
    const page = {
        target: () => ({
            createCDPSession: async () => ({ send, detach })
        }),
        cookies: jest.fn()
    }

    const cookies = await readAllCookies(page, ['https://example.com'])

    expect(send).toHaveBeenCalledWith('Network.getAllCookies')
    expect(detach).toHaveBeenCalled()
    expect(page.cookies).not.toHaveBeenCalled()
    expect(cookies).toEqual([{ name: 'cf_clearance', value: 'ok' }])
})

test('CDP 不可用时退回 page.cookies', async () => {
    const page = {
        target: () => ({
            createCDPSession: async () => {
                throw new Error('cdp failed')
            }
        }),
        cookies: jest.fn(async () => [{ name: 'fallback', value: 'ok' }])
    }

    const cookies = await readAllCookies(page, ['https://example.com'])

    expect(page.cookies).toHaveBeenCalledWith('https://example.com')
    expect(cookies).toEqual([{ name: 'fallback', value: 'ok' }])
})
