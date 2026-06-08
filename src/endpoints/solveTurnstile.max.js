const applyCookies = require("../module/applyCookies");
const applyHeaders = require("../module/applyHeaders");
const closeBrowserContext = require("../module/closeBrowserContext");
const readTurnstileToken = require("../module/readTurnstileToken");

function solveTurnstileMax({ url, proxy, cookies, headers }) {
  return new Promise(async (resolve, reject) => {
    // 完整页面加载模式只需要 url。它会真实打开目标页面，并在页面自己的 Turnstile 组件完成后读取 token。
    if (!url) return reject("缺少 url 参数");

    // 每个请求使用独立 context，避免不同调用之间共享 cookie、缓存、代理和页面状态。
    const context = await global.browser
      .createBrowserContext({
        proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined, // https://pptr.dev/api/puppeteer.browsercontextoptions
      })
      .catch(() => null);

    if (!context) return reject("创建浏览器上下文失败");

    let isResolved = false;
    // 全局超时兜底。目标页面加载、挑战脚本或代理长时间无响应时，关闭 context 并返回错误。
    var cl = setTimeout(async () => {
      if (!isResolved) {
        await closeBrowserContext(context, "turnstile-max 模式处理超时");
        reject("处理超时");
      }
    }, global.timeOut || 60000);

    try {
      const page = await context.newPage();

      // 代理用户名密码必须在 page.goto 前设置，否则首次导航可能被代理拒绝。
      if (proxy?.username && proxy?.password)
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

      await applyCookies(page, url, cookies);
      await applyHeaders(page, headers);

      // 在页面任何业务脚本执行前注入轮询逻辑。
      // 页面上的 turnstile 对象可用后，持续调用 getResponse()，直到拿到 token。
      await page.evaluateOnNewDocument(() => {
        let token = null;
        async function waitForToken() {
          while (!token) {
            try {
              token = window.turnstile.getResponse();
            } catch (e) {}
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          // 把 token 写入 DOM，Node 侧可以用 waitForSelector 和 evaluate 稳定读取。
          var c = document.createElement("input");
          c.type = "hidden";
          c.name = "cf-response";
          c.value = token;
          document.body.appendChild(c);
        }
        waitForToken();
      });

      // 完整访问目标页面，由目标页面自己加载 Turnstile 脚本和相关资源。
      await page.goto(url, {
        waitUntil: "domcontentloaded",
      });

      // 注入脚本拿到 token 后会创建隐藏 input；公共读取函数会处理挑战过程中的 frame 重建。
      const token = await readTurnstileToken(page, global.tokenTimeOut || 60000);
      isResolved = true;
      clearTimeout(cl);
      // Cloudflare token 正常情况下长度远大于 10；过短值按无效 token 处理。
      if (!token || token.length < 10) {
        await closeBrowserContext(context, "turnstile-max 模式获取到无效 token");
        return reject("获取 token 失败");
      }
      await closeBrowserContext(context, "turnstile-max 模式处理完成");
      return resolve({ token });
    } catch (e) {
      if (!isResolved) {
        // 出错时也释放 context，防止页面残留影响后续请求和并发计数。
        clearTimeout(cl);
        await closeBrowserContext(context, "turnstile-max 模式处理异常");
        reject(e.message);
      }
    }
  });
}
module.exports = solveTurnstileMax;
