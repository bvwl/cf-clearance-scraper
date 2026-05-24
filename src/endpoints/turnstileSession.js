const fs = require("fs");
const applyCookies = require("../module/applyCookies");
const applyHeaders = require("../module/applyHeaders");
const readAllCookies = require("../module/readAllCookies");
const readTurnstileToken = require("../module/readTurnstileToken");
const { cleanReusableHeaders } = require("../module/sessionData");

async function findAcceptLanguage(page) {
  // 复用真实浏览器发出的 Accept-Language，避免后续请求里使用固定手写值。
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

function mergeCookies(...cookieGroups) {
  // 同一个 cookie 用 name/domain/path 唯一标识；后读取到的值覆盖旧值。
  const cookieMap = new Map();

  for (const cookies of cookieGroups) {
    for (const cookie of cookies || []) {
      cookieMap.set(`${cookie.name}|${cookie.domain}|${cookie.path}`, cookie);
    }
  }

  return Array.from(cookieMap.values());
}

async function injectTurnstileResponseCollector(page) {
  // 完整页面模式使用：在目标页面脚本执行前注入轮询逻辑，从页面已有 Turnstile 组件读取 token。
  await page.evaluateOnNewDocument(() => {
    let token = null;

    function appendToken(tokenValue) {
      var c = document.createElement("input");
      c.type = "hidden";
      c.name = "cf-response";
      c.value = tokenValue;

      if (document.body) {
        document.body.appendChild(c);
      } else {
        document.documentElement.appendChild(c);
      }
    }

    async function waitForToken() {
      while (!token) {
        try {
          token = window.turnstile.getResponse();
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      appendToken(token);
    }

    waitForToken();
  });
}

async function renderTurnstileWithSiteKey(page, url, siteKey) {
  // siteKey 模式使用：保持同一个 context，但把第二次主文档请求替换成最小 Turnstile 页面。
  await page.setRequestInterception(true);

  page.on("request", async (request) => {
    if (
      [url, url + "/"].includes(request.url()) &&
      request.resourceType() === "document"
    ) {
      await request.respond({
        status: 200,
        contentType: "text/html",
        body: String(fs.readFileSync("./src/data/fakePage.html")).replace(
          /<site-key>/g,
          siteKey
        ),
      });
    } else {
      await request.continue();
    }
  });

  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
}

function turnstileSession({ url, proxy, siteKey, cookies: inputCookies, headers: inputHeaders }) {
  return new Promise(async (resolve, reject) => {
    // 组合模式会返回 token、cookies 和 headers。传 siteKey 时会用更稳定的最小 Turnstile 页面生成 token。
    if (!url) return reject("缺少 url 参数");

    // token、cookies、headers 必须来自同一个 browser context，后续复用时才更一致。
    const context = await global.browser
      .createBrowserContext({
        proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined, // https://pptr.dev/api/puppeteer.browsercontextoptions
      })
      .catch(() => null);

    if (!context) return reject("创建浏览器上下文失败");

    let isResolved = false;
    let mainRequestHeaders = null;

    // 超时兜底：目标页面、挑战脚本或代理卡住时关闭 context，避免页面残留。
    var cl = setTimeout(async () => {
      if (!isResolved) {
        await context.close();
        reject("处理超时");
      }
    }, global.timeOut || 60000);

    try {
      const page = await context.newPage();

      // 代理认证必须在第一次导航前设置。
      if (proxy?.username && proxy?.password)
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

      await applyCookies(page, url, inputCookies);
      await applyHeaders(page, inputHeaders);

      const acceptLanguage = await findAcceptLanguage(page);

      // 监听主文档响应，用它对应的 request headers 作为后续复用 headers 的基础。
      page.on("response", async (res) => {
        try {
          if (
            !mainRequestHeaders &&
            [200, 302].includes(res.status()) &&
            res.request().resourceType() === "document"
          ) {
            mainRequestHeaders = await res.request().headers();
          }
        } catch (e) {}
      });

      if (!siteKey) await injectTurnstileResponseCollector(page);

      // 先真实加载目标页面，用这个流程产生目标站点 cookies，并记录主文档请求 headers。
      const response = await page.goto(url, { waitUntil: "load" });

      if (!mainRequestHeaders && response) {
        mainRequestHeaders = await response.request().headers();
      }

      // Cloudflare 可能在 load 后通过跳转或异步流程写入 cookie，短暂等待能减少过早读取。
      await page
        .waitForNetworkIdle({ idleTime: 1000, timeout: 5000 })
        .catch(() => {});

      const realPageCookies = await readAllCookies(page, [url, page.url()]);

      if (siteKey) {
        // 有些站点无法通过页面上的 window.turnstile.getResponse() 拿 token。
        // 这时复用 turnstile-min 的思路，在同一 context 里用 siteKey 渲染最小页面生成 token。
        await renderTurnstileWithSiteKey(page, url, siteKey);
      }

      const token = await readTurnstileToken(page, 60000);

      if (!token || token.length < 10) {
        await context.close();
        clearInterval(cl);
        return reject("获取 token 失败");
      }

      // token 出现后再读取一次 cookies，并与真实页面阶段的 cookies 合并。
      // 这样不会因为后续最小页面渲染流程覆盖当前页面状态而丢掉真实页面阶段产生的 cf_clearance。
      const tokenPageCookies = await readAllCookies(page, [url, page.url()]);
      const sessionCookies = mergeCookies(realPageCookies, tokenPageCookies);
      const reusableHeaders = cleanReusableHeaders(mainRequestHeaders || {}, acceptLanguage);

      isResolved = true;
      clearInterval(cl);
      await context.close();
      return resolve({ token, cookies: sessionCookies, headers: reusableHeaders });
    } catch (e) {
      if (!isResolved) {
        await context.close();
        clearInterval(cl);
        reject(e.message);
      }
    }
  });
}

module.exports = turnstileSession;
