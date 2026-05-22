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

function cleanReusableHeaders(headers, acceptLanguage) {
  // 这些头通常由 HTTP 客户端或底层传输层自动生成，直接复用反而容易不一致。
  delete headers["content-type"];
  delete headers["accept-encoding"];
  delete headers["accept"];
  delete headers["content-length"];

  if (acceptLanguage) headers["accept-language"] = acceptLanguage;
  return headers;
}

function turnstileSession({ url, proxy }) {
  return new Promise(async (resolve, reject) => {
    // 组合模式需要真实打开目标页面，所以只需要 url；token 由页面自己的 Turnstile 组件产生。
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

      // 在目标页面脚本执行前注入 token 采集逻辑。
      // 页面 Turnstile 完成后，getResponse() 会返回 token，再把 token 写入隐藏 input。
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

      // 完整加载目标页面。和 turnstile-min 不同，这里不替换页面内容，因为 cookies 通常来自真实页面流程。
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
      });

      if (!mainRequestHeaders && response) {
        mainRequestHeaders = await response.request().headers();
      }

      await page.waitForSelector('[name="cf-response"]', {
        timeout: 60000,
      });

      const token = await page.evaluate(() => {
        try {
          return document.querySelector('[name="cf-response"]').value;
        } catch (e) {
          return null;
        }
      });

      if (!token || token.length < 10) {
        await context.close();
        clearInterval(cl);
        return reject("获取 token 失败");
      }

      // token 出现后再读取 cookies，确保拿到的是挑战流程完成后的同一上下文状态。
      const cookies = await page.cookies();
      const headers = cleanReusableHeaders(mainRequestHeaders || {}, acceptLanguage);

      isResolved = true;
      clearInterval(cl);
      await context.close();
      return resolve({ token, cookies, headers });
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
