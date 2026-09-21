let currentWords = [];
let userEmail = null;
let userDays = 0;
let intervalId = null;
let mutationObserver = null;
let highlightTimer = null;
let isFetching = false;
let isHighlighting = false;
let pendingHighlight = false;
let pendingForceRefresh = false;

const HIGHLIGHT_DEBOUNCE_MS = 400;
const EMAIL_UI_ID = "highlight-extension-email-ui";

function cleanup() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  currentWords = [];
  pendingHighlight = false;
  pendingForceRefresh = false;
}

function createEmailInput() {
  if (document.getElementById(EMAIL_UI_ID)) return;

  const wrapper = document.createElement("div");
  wrapper.id = EMAIL_UI_ID;
  wrapper.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 1px solid #ddd;
    padding: 15px;
    z-index: 99999;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    padding: 8px 16px;
    background: red;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  closeBtn.onclick = () => {
    cleanup();
    removeHighlights();
    wrapper.remove();
  };

  const input = document.createElement("input");
  input.type = "email";
  input.placeholder = "your@email.com";
  input.style.cssText = `
    padding: 8px;
    width: 200px;
    margin-right: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  `;

  const dayInput = document.createElement("input");
  dayInput.type = "number";
  dayInput.placeholder = "i.e. 15";
  dayInput.style.cssText = `
    padding: 8px;
    width: 80px;
    margin-right: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  `;

  const button = document.createElement("button");
  button.textContent = "Start";
  button.style.cssText = `
    padding: 8px 16px;
    background: #4285f4;
    color: white;
    border: none;
    margin-right: 8px;
    border-radius: 4px;
    cursor: pointer;
  `;

  button.onclick = () => {
    const email = input.value.trim();
    const days = parseInt(dayInput.value.trim(), 10);

    if (isNaN(days) || days <= 0) {
      alert("Please enter a valid number of days");
      return;
    }

    if (email.includes("@")) {
      userEmail = email;
      userDays = days;
      localStorage.setItem("highlight_user_email", email);
      localStorage.setItem("highlight_user_days", days);
      wrapper.remove();
      startFetchingWords();
    } else {
      alert("Please enter a valid email");
    }
  };

  wrapper.appendChild(input);
  wrapper.appendChild(dayInput);
  wrapper.appendChild(button);
  wrapper.appendChild(closeBtn);

  document.body.appendChild(wrapper);
}

function startFetchingWords() {
  cleanup();
  startMutationObserver();
  hookSpaNavigation();
  fetchAndHighlight();
  intervalId = setInterval(fetchAndHighlight, 20000);
}

function startMutationObserver() {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver(() => {
    if (!currentWords.length) return;
    scheduleHighlight(false);
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function hookSpaNavigation() {
  if (window.__highlightExtensionNavHooked) return;
  window.__highlightExtensionNavHooked = true;

  const scheduleAfterNav = () => scheduleHighlight(false);

  window.addEventListener("popstate", scheduleAfterNav);
  window.addEventListener("hashchange", scheduleAfterNav);

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    scheduleAfterNav();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleAfterNav();
    return result;
  };
}

function scheduleHighlight(forceRefresh) {
  if (forceRefresh) pendingForceRefresh = true;
  if (!currentWords.length && !pendingForceRefresh) return;

  if (isHighlighting) {
    pendingHighlight = true;
    return;
  }

  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightTimer = null;
    const force = pendingForceRefresh;
    pendingForceRefresh = false;
    performHighlighting(force);
  }, HIGHLIGHT_DEBOUNCE_MS);
}

async function fetchAndHighlight() {
  if (!userEmail || isFetching || Number(userDays) <= 0) return;

  isFetching = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "fetchData",
      url: `https://api.lovapextech.com/api/bids/get-companies-by-days?email=${encodeURIComponent(
        userEmail,
      )}&days=${encodeURIComponent(userDays)}`,
    });

    if (response?.data) {
      const newWords = processWords(response.data);
      const wordsChanged = !arraysEqual(newWords, currentWords);
      currentWords = newWords;

      if (wordsChanged) {
        await performHighlighting(true);
      }
    }
  } catch (error) {
    console.error("Highlight error:", error);
  } finally {
    isFetching = false;
  }
}

function processWords(data) {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => typeof item === "string")
    .map((item) =>
      item.replace(/_/g, " ").replace(/\.$/, "").trim().toLowerCase(),
    )
    .filter((item, index, self) => item && self.indexOf(item) === index)
    .sort((a, b) => b.length - a.length);
}

function removeHighlights() {
  document.querySelectorAll("mark.highlight-extension").forEach((el) => {
    const parent = el.parentNode;
    el.replaceWith(document.createTextNode(el.textContent));
    parent?.normalize?.();
  });
}

function buildHighlightRegex() {
  if (!currentWords.length) return null;
  return new RegExp(
    `\\b(${currentWords.map(escapeRegExp).join("|")})\\b`,
    "gi",
  );
}

function shouldSkipTextNode(node) {
  if (!node?.nodeValue?.trim()) return true;

  let parent = node.parentNode;
  while (parent && parent.nodeType === Node.ELEMENT_NODE) {
    const tag = parent.nodeName;
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "TEXTAREA" ||
      tag === "INPUT" ||
      tag === "SELECT" ||
      tag === "OPTION"
    ) {
      return true;
    }
    if (parent.isContentEditable) return true;
    if (parent.classList?.contains("highlight-extension")) return true;
    if (parent.id === EMAIL_UI_ID) return true;
    parent = parent.parentNode;
  }

  return false;
}

function collectMatches(text, regex) {
  regex.lastIndex = 0;
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!match[0]) {
      regex.lastIndex += 1;
      continue;
    }
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }

  return matches;
}

function wrapMatches(node, matches) {
  const text = node.nodeValue;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  for (const match of matches) {
    if (match.start > lastIndex) {
      fragment.appendChild(
        document.createTextNode(text.slice(lastIndex, match.start)),
      );
    }

    const mark = document.createElement("mark");
    mark.className = "highlight-extension";
    mark.textContent = match.text;
    fragment.appendChild(mark);
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  node.replaceWith(fragment);
}

async function performHighlighting(forceRefresh = false) {
  if (isHighlighting) {
    pendingHighlight = true;
    if (forceRefresh) pendingForceRefresh = true;
    return;
  }

  isHighlighting = true;

  try {
    do {
      pendingHighlight = false;
      const force = forceRefresh || pendingForceRefresh;
      pendingForceRefresh = false;
      forceRefresh = false;

      if (force) removeHighlights();
      if (!currentWords.length) break;

      const regex = buildHighlightRegex();
      if (!regex) break;

      const root = document.body;
      if (!root) break;

      const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          shouldSkipTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });

      const nodes = [];
      while (treeWalker.nextNode()) {
        regex.lastIndex = 0;
        if (regex.test(treeWalker.currentNode.nodeValue)) {
          nodes.push(treeWalker.currentNode);
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        if (i % 100 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const node = nodes[i];
        if (!node.isConnected) continue;

        const matches = collectMatches(node.nodeValue, regex);
        if (matches.length) wrapMatches(node, matches);
      }
    } while (pendingHighlight);
  } catch (error) {
    console.error("Highlight error:", error);
  } finally {
    isHighlighting = false;

    if (pendingHighlight || pendingForceRefresh) {
      scheduleHighlight(pendingForceRefresh);
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((val, index) => val === b[index]);
}

userEmail = localStorage.getItem("highlight_user_email");
userDays = parseInt(localStorage.getItem("highlight_user_days"), 10) || 0;
if (userEmail && Number(userDays) > 0) {
  startFetchingWords();
} else {
  createEmailInput();
}

window.addEventListener("unload", cleanup);
