async function readAllCookies(page, fallbackUrls = []) {
  // CDP 的 Network.getAllCookies 能拿到当前 browser context 内更完整的 cookies。
  // 如果当前环境不支持 CDP，再退回 Puppeteer 的 page.cookies(...urls)。
  try {
    const client = await page.target().createCDPSession();
    const result = await client.send("Network.getAllCookies");
    await client.detach().catch(() => {});
    return result.cookies || [];
  } catch (e) {
    const urls = fallbackUrls.filter(Boolean);
    return await page.cookies(...urls);
  }
}

module.exports = readAllCookies;
