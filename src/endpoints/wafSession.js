const applyCookies = require("../module/applyCookies");
const applyHeaders = require("../module/applyHeaders");
const closeBrowserContext = require("../module/closeBrowserContext");
const readAllCookies = require("../module/readAllCookies");
const { cleanReusableHeaders } = require("../module/sessionData");

async function findAcceptLanguage(page) {
  // 在浏览器页面里发一个轻量请求，读取真实浏览器环境发出的 Accept-Language。
  // 后续调用方复用 headers 时，这个值比手写固定值更接近当前 Chromium 指纹。
  return await page.evaluate(async () => {
    const result = await fetch("https://httpbin.org/get")
      .then((res) => res.json())
      .then(
        (res) =>
          res.headers["Accept-Language"] || res.headers["accept-language"]
      )
      .catch(() => null);
    return result;
  });
}

function getSource({ url, proxy, cookies, headers }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("缺少 url 参数");

    // WAF 会话模式和 source 模式一样使用独立 context，确保 cookies 只属于本次任务。
    const context = await global.browser
      .createBrowserContext({
        proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined, // https://pptr.dev/api/puppeteer.browsercontextoptions
      })
      .catch(() => null);
    if (!context) return reject("创建浏览器上下文失败");

    let isResolved = false;

    // 超时后关闭整个 context，防止页面、网络连接和 cookie 状态残留在浏览器里。
    var cl = setTimeout(async () => {
      if (!isResolved) {
        await closeBrowserContext(context, "waf-session 模式处理超时");
        reject("处理超时");
      }
    }, global.timeOut || 60000);

    try {
      const page = await context.newPage();

      // 代理认证必须在页面导航前完成，否则首个请求可能直接被代理拒绝。
      if (proxy?.username && proxy?.password)
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

      await applyCookies(page, url, cookies);
      await applyHeaders(page, headers);

      let acceptLanguage = await findAcceptLanguage(page);
      page.on("response", async (res) => {
        try {
          // 等目标主文档返回 200/302 后，再读取 cookies 和发出该请求时使用的 headers。
          if (
            [200, 302].includes(res.status()) &&
            [url, url + "/"].includes(res.url())
          ) {
            await page
              .waitForNavigation({ waitUntil: "load", timeout: 5000 })
              .catch(() => {});
            const responseCookies = await readAllCookies(page, [url, page.url()]);
            let responseHeaders = cleanReusableHeaders(await res.request().headers(), acceptLanguage);
            isResolved = true;
            clearTimeout(cl);
            await closeBrowserContext(context, "waf-session 模式处理完成");
            resolve({ cookies: responseCookies, headers: responseHeaders });
          }
        } catch (e) {}
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
      });
    } catch (e) {
      if (!isResolved) {
        clearTimeout(cl);
        await closeBrowserContext(context, "waf-session 模式处理异常");
        reject(e.message);
      }
    }
  });
}
module.exports = getSource;
