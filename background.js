// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchData") {
    fetch(request.url)
      .then((res) => res.json())
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keeps sendResponse alive
  }
});
