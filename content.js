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

  const host = document.createElement("div");
  host.id = EMAIL_UI_ID;
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      }
      * { box-sizing: border-box; }
      .card {
        width: 340px;
        padding: 18px;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 16px;
        box-shadow:
          0 18px 50px rgba(15, 23, 42, 0.16),
          0 2px 6px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        animation: hl-in 0.22s ease-out;
      }
      @keyframes hl-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.98); }
        to { opacity: 1; transform: none; }
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .logo {
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        border-radius: 10px;
        background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
        box-shadow: 0 8px 16px rgba(249, 115, 22, 0.28);
        display: grid;
        place-items: center;
      }
      .logo svg { width: 18px; height: 18px; display: block; }
      .title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
      .subtitle {
        margin: 0 0 16px;
        font-size: 12px;
        color: #64748b;
        line-height: 1.4;
      }
      .close {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: #f1f5f9;
        color: #64748b;
        cursor: pointer;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }
      .close:hover { background: #fee2e2; color: #dc2626; }
      form { display: grid; gap: 10px; }
      label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
      input {
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #f8fafc;
        color: #0f172a;
        font: 13px/1.4 inherit;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
      }
      input::placeholder { color: #94a3b8; }
      input:hover { border-color: #cbd5e1; }
      input:focus {
        background: #fff;
        border-color: #f97316;
        box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.16);
      }
      input[type=number]::-webkit-outer-spin-button,
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; appearance: textfield; }
      .error {
        display: none;
        margin: 0;
        padding: 8px 10px;
        border-radius: 8px;
        background: #fef2f2;
        color: #b91c1c;
        font-size: 12px;
        font-weight: 500;
      }
      .error.show { display: block; }
      .submit {
        height: 42px;
        margin-top: 4px;
        border: 0;
        border-radius: 10px;
        background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
        color: #fff;
        font: 600 13px/1 inherit;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(249, 115, 22, 0.28);
      }
      .submit:hover { filter: brightness(1.05); transform: translateY(-1px); }
      .submit:active { transform: none; filter: brightness(0.98); }
    </style>
    <div class="card">
      <div class="header">
        <div class="brand">
          <div class="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 16.2 16.3 7.6a1.15 1.15 0 0 1 1.7 0l1.4 1.5a1.15 1.15 0 0 1 0 1.6L12.1 19.4H9v-3.2Z" fill="#fff"/>
              <path d="M9 20.4h7.2" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="title">Auto Highlighter</div>
        </div>
        <button class="close" type="button" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <p class="subtitle">Highlight matching companies on this page</p>
      <form>
        <label>
          Email
          <input class="email" type="email" placeholder="you@company.com" autocomplete="email" />
        </label>
        <label>
          Days to look back
          <input class="days" type="number" min="1" step="1" placeholder="15" />
        </label>
        <p class="error"></p>
        <button class="submit" type="submit">Start highlighting</button>
      </form>
    </div>
  `;

  const form = shadow.querySelector("form");
  const emailInput = shadow.querySelector(".email");
  const dayInput = shadow.querySelector(".days");
  const errorEl = shadow.querySelector(".error");
  const savedEmail = localStorage.getItem("highlight_user_email");
  const savedDays = localStorage.getItem("highlight_user_days");
  if (savedEmail) emailInput.value = savedEmail;
  if (savedDays) dayInput.value = savedDays;

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  };

  shadow.querySelector(".close").onclick = () => {
    cleanup();
    removeHighlights();
    host.remove();
  };

  form.onsubmit = (event) => {
    event.preventDefault();
    errorEl.classList.remove("show");

    const email = emailInput.value.trim();
    const days = parseInt(dayInput.value.trim(), 10);

    if (!/.+@.+\..+/.test(email)) {
      showError("Enter a valid email address.");
      emailInput.focus();
      return;
    }
    if (isNaN(days) || days <= 0) {
      showError("Enter a valid number of days.");
      dayInput.focus();
      return;
    }

    userEmail = email;
    userDays = days;
    localStorage.setItem("highlight_user_email", email);
    localStorage.setItem("highlight_user_days", String(days));
    host.remove();
    startFetchingWords();
  };

  document.documentElement.appendChild(host);
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
