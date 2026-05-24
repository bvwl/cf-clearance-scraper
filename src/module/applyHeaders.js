function normalizeHeaders(headers) {
  // 调用方传入普通对象即可，例如 { "user-agent": "...", "accept-language": "..." }。
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};

  // Cookie 由 cookies 字段和浏览器 cookie jar 管理；Host/Content-Length 由底层协议自动生成。
  const blockedHeaders = new Set(["cookie", "host", "content-length"]);

  return Object.entries(headers)
    .filter(([name, value]) => name && value !== undefined && value !== null)
    .filter(([name]) => !blockedHeaders.has(String(name).toLowerCase()))
    .reduce((result, [name, value]) => {
      result[name.toLowerCase()] = String(value);
      return result;
    }, {});
}

async function applyHeaders(page, headers) {
  const normalizedHeaders = normalizeHeaders(headers);
  if (Object.keys(normalizedHeaders).length === 0) return;

  const userAgent = normalizedHeaders["user-agent"];
  delete normalizedHeaders["user-agent"];

  // Puppeteer 对 User-Agent 有专门 API，单独设置比放进 extra headers 更稳定。
  if (userAgent) await page.setUserAgent(userAgent);

  if (Object.keys(normalizedHeaders).length > 0) {
    await page.setExtraHTTPHeaders(normalizedHeaders);
  }
}

module.exports = applyHeaders;
module.exports.normalizeHeaders = normalizeHeaders;
