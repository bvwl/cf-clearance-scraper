const { connect } = require("puppeteer-real-browser")

// 创建并维护一个全局浏览器实例。每个请求只创建独立 context，不重复启动浏览器进程。
async function createBrowser() {
    try {
        // 测试或进程退出阶段会设置 finished，避免断线重连逻辑继续拉起新浏览器。
        if (global.finished == true) return

        global.browser = null

        // puppeteer-real-browser 会启动更接近真实用户环境的 Chromium，用于通过 Cloudflare 检测。
        // turnstile: true 是该库提供的辅助能力，用来处理 Turnstile 相关页面行为。

        const { browser } = await connect({
            headless: false,
            turnstile: true,
            connectOption: { defaultViewport: null },
            disableXvfb: false,
        })

        // console.log('Browser launched');

        global.browser = browser;

        // 浏览器异常断开时自动重启，保证服务长时间运行时能自恢复。
        browser.on('disconnected', async () => {
            if (global.finished == true) return
            console.log('浏览器连接已断开，准备重新启动');
            await new Promise(resolve => setTimeout(resolve, 3000));
            await createBrowser();
        })

    } catch (e) {
        // 启动失败通常是 Chromium/Xvfb/系统依赖问题；这里延迟重试，避免快速死循环。
        console.log(e.message);
        if (global.finished == true) return
        await new Promise(resolve => setTimeout(resolve, 3000));
        await createBrowser();
    }
}

createBrowser()
