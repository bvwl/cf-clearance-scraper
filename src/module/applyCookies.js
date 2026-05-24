function normalizeCookies(url, cookies) {
  // 支持两种输入：
  // 1. { cookieName: cookieValue }，适合手动传入。
  // 2. [{ name, value, ... }]，适合直接复用本服务返回的 cookies 数组。
  if (!cookies || typeof cookies !== "object") return [];

  if (Array.isArray(cookies)) {
    return cookies
      .filter((cookie) => cookie?.name && cookie?.value !== undefined && cookie?.value !== null)
      .map((cookie) => ({
        ...cookie,
        value: String(cookie.value),
        url: cookie.url || (!cookie.domain ? url : undefined),
      }));
  }

  return Object.entries(cookies)
    .filter(([name, value]) => name && value !== undefined && value !== null)
    .map(([name, value]) => ({
      name,
      value: String(value),
      url,
    }));
}

async function applyCookies(page, url, cookies) {
  const normalizedCookies = normalizeCookies(url, cookies);
  if (normalizedCookies.length === 0) return;

  await page.setCookie(...normalizedCookies);
}

module.exports = applyCookies;
module.exports.normalizeCookies = normalizeCookies;
