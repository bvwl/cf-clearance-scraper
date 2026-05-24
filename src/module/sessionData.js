const readAllCookies = require("./readAllCookies");

function cleanReusableHeaders(headers, acceptLanguage) {
  const reusableHeaders = { ...(headers || {}) };

  delete reusableHeaders["content-type"];
  delete reusableHeaders["accept-encoding"];
  delete reusableHeaders["accept"];
  delete reusableHeaders["content-length"];

  if (acceptLanguage) reusableHeaders["accept-language"] = acceptLanguage;
  return reusableHeaders;
}

async function readSessionData(page, headers = null, acceptLanguage = null, cookieUrls = []) {
  return {
    cookies: await readAllCookies(page, cookieUrls),
    headers: cleanReusableHeaders(headers, acceptLanguage),
  };
}

module.exports = {
  cleanReusableHeaders,
  readSessionData,
};
