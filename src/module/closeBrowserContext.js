function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeBrowserContext(context, reason = "任务结束") {
  if (!context || context.__closeRequested) return;

  context.__closeRequested = true;

  try {
    await Promise.race([
      context.close(),
      wait(5000).then(() => {
        throw new Error("关闭浏览器上下文超时");
      }),
    ]);
  } catch (error) {
    console.log(`${reason}，浏览器上下文关闭失败：${error.message}`);
  }
}

module.exports = closeBrowserContext;
