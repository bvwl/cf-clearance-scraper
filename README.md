> [!WARNING]
> 这个仓库已不再接收维护更新。感谢所有曾经支持这个项目的人。

# CF Clearance Scraper 中文说明

CF Clearance Scraper 是一个基于 Node.js、Express 和 `puppeteer-real-browser` 的实验性服务。它通过真实 Chromium 浏览器打开目标页面，用于测试和训练场景中的以下能力：

- 获取受 Cloudflare WAF 保护页面的最终 HTML 源码。
- 创建 Cloudflare Turnstile token。
- 创建一次可复用的 Cloudflare WAF 会话信息，也就是 cookies 与浏览器请求头。

本项目只应在你拥有授权的测试环境、训练环境或自有站点上使用。Cloudflare 保护通常不会只检查 cookie，也会同时检查请求头、浏览器指纹、TLS 指纹和页面行为，因此 README 中的示例会尽量复用浏览器真实产生的 headers 与 cookies。

Cloudflare 相关 cookie 通常带有 `cf` 前缀。你可以通过 [Cloudflare Cookies 官方文档](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/) 了解这些 cookie 的用途和有效期。

## 项目结构

```text
src/index.js                         # Express 入口，负责参数校验、鉴权、限流和模式分发
src/module/createBrowser.js          # 创建并维护全局 Chromium 浏览器实例
src/module/reqValidate.js            # 使用 AJV 校验 API 请求体
src/endpoints/getSource.js           # source 模式：获取目标页面 HTML
src/endpoints/wafSession.js          # waf-session 模式：获取 cookies 和可复用 headers
src/endpoints/solveTurnstile.min.js  # turnstile-min 模式：用最小页面生成 Turnstile token
src/endpoints/solveTurnstile.max.js  # turnstile-max 模式：完整加载目标页面并等待 Turnstile token
src/endpoints/turnstileSession.js    # turnstile-session 模式：同一会话返回 token、cookies、headers
src/data/fakePage.html               # turnstile-min 模式替换目标文档请求时使用的本地 HTML
tests/                               # Jest + Supertest 测试
Dockerfile                           # Docker 运行环境
```

## 工作流程

1. 服务启动后，`src/module/createBrowser.js` 会创建一个全局浏览器实例。
2. 每个 API 请求进入 `POST /cf-clearance-scraper`。
3. `src/module/reqValidate.js` 先校验请求体字段、URL 格式和模式名称。
4. 入口层检查 `authToken`、浏览器并发数和浏览器是否已准备好。
5. 根据 `mode` 分发到不同 endpoint。
6. endpoint 为每个任务创建独立 browser context，任务完成或超时后关闭 context。

这种设计避免每个请求都重新启动浏览器进程，但又能通过独立 context 隔离 cookie、缓存、代理和页面状态。

## 安装与运行

推荐优先使用 Docker，因为项目依赖 Chromium、Chromium Driver 和 Xvfb 等系统组件。

### Docker

请确保使用最新镜像。如果本地旧镜像运行异常，可以先手动更新镜像后再启动。

```bash
docker run -d -p 3000:3000 \
-e PORT=3000 \
-e browserLimit=20 \
-e timeOut=60000 \
zfcsoftware/cf-clearance-scraper:latest
```

### Docker Compose

如果你使用当前仓库里的代码，推荐用 Docker Compose 本地构建镜像。这样新增或修改过的接口会被包含进去。

```bash
docker compose up -d --build
```

默认会把容器内的 `3000` 端口映射到宿主机 `30000`：

```text
http://localhost:30000/cf-clearance-scraper
```

### 从 GitHub 源码运行

```bash
git clone https://github.com/zfcsoftware/cf-clearance-scraper
cd cf-clearance-scraper
npm install
npm run start
```

## 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 服务监听端口。 |
| `browserLimit` | `20` | 同时运行的 browser context 最大数量，超过后返回 429。 |
| `timeOut` | `60000` | 请求处理超时时间，单位是毫秒。 |
| `tokenTimeOut` | 同 `timeOut` | 等待 Turnstile token 的独立超时时间，单位是毫秒。目标站点迟迟不返回 token 时可调低以减少 CPU 占用。 |
| `authToken` | 空 | 如果配置了该值，请求体必须传入相同的 `authToken`，否则返回 401。 |
| `SKIP_LAUNCH` | 空 | 测试时可设为 `true`，跳过真实浏览器启动。 |
| `NODE_ENV` | 空 | 设为 `development` 时会导出 Express app，方便测试使用。 |

## API 概览

所有功能都通过同一个接口调用：

```text
POST /cf-clearance-scraper
Content-Type: application/json
```

通用请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | string | 是 | 目标页面完整 URL，必须符合 URI 格式。 |
| `mode` | string | 是 | 可选值：`source`、`turnstile-min`、`turnstile-max`、`turnstile-session`、`waf-session`。 |
| `authToken` | string | 否 | 服务端配置 `authToken` 时必须传入。 |
| `siteKey` | string | 视模式而定 | `turnstile-min` 模式必填。 |
| `proxy` | object | 否 | 代理配置，会传给 browser context。 |
| `cookies` | object/array | 否 | 预置 cookies，会在页面导航前写入浏览器。支持 `{ "cookieName": "cookieValue" }`，也支持直接复用接口返回的 cookies 数组。 |
| `headers` | object | 否 | 预置请求头，会在页面导航前设置。`user-agent` 会作为浏览器 User-Agent 单独设置。 |

代理字段：

```json
{
  "proxy": {
    "host": "127.0.0.1",
    "port": 3000,
    "username": "username",
    "password": "password"
  }
}
```

所有成功响应都会尽量返回 `cookies` 和 `headers`，方便后续请求复用：

```json
{
  "code": 200,
  "cookies": [],
  "headers": {}
}
```

不同模式会在这个基础上额外返回 `source` 或 `token`。

预置 cookies 对象格式：

```json
{
  "cookies": {
    "cf_clearance": "your_cf_clearance_value",
    "ph_phc_xxx_posthog": "your_posthog_cookie_value"
  }
}
```

也可以直接传本服务返回的 cookies 数组：

```json
{
  "cookies": [
    {
      "name": "cf_clearance",
      "value": "your_cf_clearance_value",
      "domain": ".example.com",
      "path": "/"
    }
  ]
}
```

预置请求头格式：

```json
{
  "headers": {
    "user-agent": "Mozilla/5.0 ...",
    "accept-language": "zh-CN,zh;q=0.9",
    "referer": "https://example.com/"
  }
}
```

`cookie`、`host`、`content-length` 会被自动过滤：Cookie 请通过 `cookies` 字段传入，`host` 和 `content-length` 交给浏览器和底层协议自动生成。

## 创建 Cloudflare WAF Session

`waf-session` 模式会用真实浏览器访问目标页面，并返回本次会话的 cookies 与 headers。cookies 会优先通过 CDP `Network.getAllCookies` 读取，尽量包含当前 browser context 内的完整 cookies；如果 CDP 不可用，会退回 `page.cookies()`。

如果目标站点有 TLS 指纹相关保护，建议参考示例使用能自定义 JA3、User-Agent 和 headers 的请求库。

```js
const initCycleTLS = require('cycletls');

async function test() {
    const session = await fetch('http://localhost:3000/cf-clearance-scraper', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "waf-session",
            // proxy:{
            //     host: '127.0.0.1',
            //     port: 3000,
            //     username: 'username',
            //     password: 'password'
            // }
        })
    }).then(res => res.json()).catch(err => { console.error(err); return null });

    if (!session || session.code != 200) return console.error(session);

    const cycleTLS = await initCycleTLS();
    const response = await cycleTLS('https://nopecha.com/demo/cloudflare', {
        body: '',
        ja3: '772,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,23-27-65037-43-51-45-16-11-13-17513-5-18-65281-0-10-35,25497-29-23-24,0',
        userAgent: session.headers["user-agent"],
        // proxy: 'http://username:password@hostname.com:443',
        headers: {
            ...session.headers,
            cookie: session.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
        }
    }, 'get');

    console.log(response.status);
    cycleTLS.exit().catch(err => {});
}

test();
```

## 创建 Turnstile Token：最小资源模式

`turnstile-min` 模式适合你已经知道目标站点 `siteKey` 的情况。它会拦截目标页面的主文档请求，把页面替换成一个只渲染 Turnstile 的本地 HTML，从而减少 CSS、JS、图片等额外资源加载。

这种模式资源消耗较低，但必须传入 `siteKey`。如果这种方式不能生成 token，可以改用下一节的完整页面加载模式。

```js
fetch('http://localhost:3000/cf-clearance-scraper', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        url: 'https://turnstile.zeroclover.io/',
        siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0",
        mode: "turnstile-min",
        // proxy:{
        //     host: '127.0.0.1',
        //     port: 3000,
        //     username: 'username',
        //     password: 'password'
        // }
    })
})
    .then(res => res.json())
    .then(console.log)
    .catch(console.log);
```

## 创建 Turnstile Token：完整页面加载模式

`turnstile-max` 模式会用真实浏览器完整访问传入的 `url`，然后在页面中等待 Turnstile 返回 token。它更接近真实访问流程，但资源消耗也更高。

```js
fetch('http://localhost:3000/cf-clearance-scraper', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        url: 'https://turnstile.zeroclover.io/',
        mode: "turnstile-max",
        // proxy:{
        //     host: '127.0.0.1',
        //     port: 3000,
        //     username: 'username',
        //     password: 'password'
        // }
    })
})
    .then(res => res.json())
    .then(console.log)
    .catch(console.log);
```

## 同时获取 Turnstile Token、Cookies 和 Headers

`turnstile-session` 模式适合目标站点提交接口同时要求 Turnstile token 和浏览器会话 cookies 的情况。它会在同一个 browser context 中先完整打开目标页面获取 cookies 和主文档请求 headers，再生成 Turnstile token。

这个模式和分别调用 `turnstile-max`、`waf-session` 不同：它返回的数据来自同一次浏览器访问，token、cookies、headers 的一致性更好。如果后续请求需要走代理，获取这些数据时也应该使用同一个 HTTP 代理。

建议传入 `siteKey`。传入后会复用 `turnstile-min` 的方式，在同一个 browser context 里渲染最小 Turnstile 页面生成 token；不传 `siteKey` 时才会尝试从目标页面自己的 Turnstile 组件读取 token。

返回结构示例：

```json
{
  "code": 200,
  "token": "0.xxxxx",
  "cookies": [
    {
      "name": "cf_clearance",
      "value": "xxxxx",
      "domain": ".example.com"
    }
  ],
  "headers": {
    "user-agent": "Mozilla/5.0 ...",
    "accept-language": "zh-CN,zh;q=0.9"
  }
}
```

调用示例：

```js
fetch('http://localhost:3000/cf-clearance-scraper', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        url: 'https://turnstile.zeroclover.io/',
        siteKey: "0x4AAAAAAAEwzhD6pyKkgXC0",
        mode: "turnstile-session",
        cookies: {
            cf_clearance: "your_cf_clearance_value",
            ph_phc_tk2o4SiS2sDMPP3NP20jAzFAdHk24GhgB9qNv5DvGEj_posthog: "your_posthog_cookie_value"
        },
        headers: {
            "user-agent": "Mozilla/5.0 ...",
            "accept-language": "zh-CN,zh;q=0.9"
        },
        proxy: {
            host: '127.0.0.1',
            port: 7890
            // username: 'username',
            // password: 'password'
        }
    })
})
    .then(res => res.json())
    .then(console.log)
    .catch(console.log);
```

## 获取 Cloudflare WAF 页面源码

`source` 模式会打开目标页面，等待主响应和一次可能的导航完成后，返回当前页面 HTML。

```js
fetch('http://localhost:3000/cf-clearance-scraper', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        url: 'https://nopecha.com/demo/cloudflare',
        mode: "source"
        // proxy:{
        //     host: '127.0.0.1',
        //     port: 3000,
        //     username: 'username',
        //     password: 'password'
        // }
    })
})
    .then(res => res.json())
    .then(console.log)
    .catch(console.log);
```

## 常见问题

### 每个请求都会打开一个新浏览器吗？

不会。服务启动时只维护一个全局浏览器实例。每个请求会创建独立 browser context，任务结束后关闭 context。这样能隔离会话，又避免频繁启动浏览器进程。

### 如何限制同时打开的浏览器上下文数量？

通过环境变量 `browserLimit` 控制，默认值是 `20`。达到上限时接口返回 429。

### 如何给 API 增加鉴权？

启动服务时设置环境变量 `authToken`。设置后，请求体中的 `authToken` 必须与服务端配置一致，否则返回 401。

### 如何调整超时时间？

通过环境变量 `timeOut` 设置，单位是毫秒，默认值是 `60000`。

### 为什么请求失败时会返回 500？

多数 endpoint 都依赖真实浏览器、目标站点响应、代理可用性和 Cloudflare 挑战状态。浏览器上下文创建失败、页面加载超时、Turnstile token 未产生等情况都会转换成 500 响应。

## 责任声明

本仓库仅用于测试、训练和研究目的。使用者必须确保自己拥有访问和测试目标站点的授权，并遵守目标站点条款、当地法律法规和 Cloudflare 相关服务条款。

项目作者不鼓励也不承担任何未授权使用、滥用、绕过访问控制或对第三方站点造成影响所产生的责任。使用本仓库即表示你理解并接受上述声明。
