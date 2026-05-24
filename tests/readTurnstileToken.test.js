const readTurnstileToken = require("../src/module/readTurnstileToken");
const { isTransientFrameError } = require("../src/module/readTurnstileToken");

test("识别挑战页面 frame 重建产生的临时错误", () => {
  expect(
    isTransientFrameError(
      new Error(
        'Waiting for selector `[name="cf-response"]` failed: waitForFunction failed: frame got detached.'
      )
    )
  ).toBe(true);

  expect(
    isTransientFrameError(new Error("Execution context was destroyed"))
  ).toBe(true);

  expect(isTransientFrameError(new Error("普通业务错误"))).toBe(false);
});

test("读取 token 时遇到临时 frame 错误会重试", async () => {
  const page = {
    waitForSelector: jest
      .fn()
      .mockRejectedValueOnce(new Error("frame got detached"))
      .mockResolvedValueOnce(null),
    evaluate: jest.fn(async () => "token-1234567890"),
  };

  const token = await readTurnstileToken(page, 2000);

  expect(token).toBe("token-1234567890");
  expect(page.waitForSelector).toHaveBeenCalledTimes(2);
  expect(page.evaluate).toHaveBeenCalledTimes(1);
});

test("非临时错误会直接抛出", async () => {
  const page = {
    waitForSelector: jest.fn(async () => {
      throw new Error("selector failed");
    }),
    evaluate: jest.fn(),
  };

  await expect(readTurnstileToken(page, 1000)).rejects.toThrow(
    "selector failed"
  );
  expect(page.evaluate).not.toHaveBeenCalled();
});
