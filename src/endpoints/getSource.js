function getSource({ url, proxy }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("缺少 url 参数");

    // 每个任务创建独立 browser context，隔离 cookie、缓存、代理等状态。
    // 这样多个请求可以共用同一个浏览器进程，但互相不污染会话。
    const context = await global.browser
      .createBrowserContext({
        proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined, // https://pptr.dev/api/puppeteer.browsercontextoptions
      })
      .catch(() => null);
    if (!context) return reject("创建浏览器上下文失败");

    let isResolved = false;

    // endpoint 级别超时保护。Cloudflare 挑战或页面加载卡住时，关闭 context 并返回错误。
    var cl = setTimeout(async () => {
      if (!isResolved) {
        await context.close();
        reject("处理超时");
      }
    }, global.timeOut || 60000);

    try {
      const page = await context.newPage();

      // 如果代理带账号密码，必须在发起页面请求前完成认证。
      if (proxy?.username && proxy?.password)
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

      await page.setRequestInterception(true);
      page.on("request", async (request) => request.continue());
      page.on("response", async (res) => {
        try {
          // 只处理目标 URL 的主响应，避免 CSS/JS/图片等子资源响应提前触发 resolve。
          if (
            [200, 302].includes(res.status()) &&
            [url, url + "/"].includes(res.url())
          ) {
            // 有些站点在 challenge 通过后会继续跳转，等待一次 load 能提高拿到最终 HTML 的概率。
            await page
              .waitForNavigation({ waitUntil: "load", timeout: 5000 })
              .catch(() => {});
            const html = await page.content();
            await context.close();
            isResolved = true;
            clearInterval(cl);
            resolve(html);
          }
        } catch (e) {}
      });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
      });
    } catch (e) {
      if (!isResolved) {
        await context.close();
        clearInterval(cl);
        reject(e.message);
      }
    }
  });
}
module.exports = getSource;
