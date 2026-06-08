const TOKEN_SELECTOR = '[name="cf-response"], [name="cf-turnstile-response"]';

function isTransientFrameError(error) {
  const message = error?.message || String(error || "");

  return [
    "frame got detached",
    "Execution context was destroyed",
    "Cannot find context with specified id",
    "Target closed",
  ].some((item) => message.includes(item));
}

function isSelectorTimeoutError(error) {
  const message = error?.message || String(error || "");

  return (
    error?.name === "TimeoutError" ||
    (message.includes("Waiting for selector") &&
      (message.includes("cf-response") ||
        message.includes("cf-turnstile-response")) &&
      message.includes("exceeded"))
  );
}

function isRetriableTokenReadError(error) {
  return isTransientFrameError(error) || isSelectorTimeoutError(error);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readTurnstileToken(page, timeout = 60000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeout) {
    try {
      const remaining = timeout - (Date.now() - startedAt);

      // Cloudflare/目标站点在挑战过程中经常会刷新 iframe 或重建页面 frame。
      // 单次等待时间不要太长，遇到 frame detach 后回到循环重新绑定当前页面上下文。
      await page.waitForSelector(TOKEN_SELECTOR, {
        timeout: Math.min(5000, Math.max(1, remaining)),
      });

      const token = await page.evaluate(() => {
        const input =
          document.querySelector('[name="cf-response"]') ||
          document.querySelector('[name="cf-turnstile-response"]');
        return input ? input.value : null;
      });

      if (token) return token;
    } catch (error) {
      lastError = error;

      if (!isRetriableTokenReadError(error)) throw error;

      await wait(500);
    }
  }

  throw lastError || new Error("等待 Turnstile token 超时");
}

module.exports = readTurnstileToken;
module.exports.isTransientFrameError = isTransientFrameError;
module.exports.isSelectorTimeoutError = isSelectorTimeoutError;
module.exports.isRetriableTokenReadError = isRetriableTokenReadError;
module.exports.TOKEN_SELECTOR = TOKEN_SELECTOR;
