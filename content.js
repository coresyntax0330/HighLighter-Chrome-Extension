let currentWords = [];
let userEmail = null;
let userDays = 0;
let intervalId = null;
let isHighlighting = false; // Flag to prevent overlapping highlights

// 1. Cleanup all intervals and observers
function cleanup() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  currentWords = [];
}

// 2. Email Input UI
function createEmailInput() {
  const wrapper = document.createElement("div");
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
  document.body.appendChild(wrapper);
}

// 3. Controlled fetching with single interval
function startFetchingWords() {
  cleanup(); // Clear any existing intervals

  // Initial fetch
  fetchAndHighlight();

  // Set up refresh (every 20 seconds)
  intervalId = setInterval(fetchAndHighlight, 20000);
}

// 4. Safe fetching and highlighting
async function fetchAndHighlight() {
  if (!userEmail || isHighlighting || Number(userDays) <= 0) return;

  isHighlighting = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "fetchData",
      url: `http://45.15.160.247:5000/api/bids/get-companies-by-days?email=${encodeURIComponent(
        userEmail
      )}&days=${encodeURIComponent(userDays)}`,
    });

    if (response?.data) {
      const newWords = processWords(response.data);
      if (!arraysEqual(newWords, currentWords)) {
        currentWords = newWords;
        await performHighlighting();
      }
    }
  } catch (error) {
    console.error("Highlight error:", error);
  } finally {
    isHighlighting = false;
  }
}

// 5. Safe word processing
function processWords(data) {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => typeof item === "string")
    .map((item) =>
      item.replace(/_/g, " ").replace(/\.$/, "").trim().toLowerCase()
    )
    .filter((item, index, self) => item && self.indexOf(item) === index);
}

// 6. Highlighting with DOM safety
async function performHighlighting() {
  // Remove old highlights
  document.querySelectorAll("mark.highlight-extension").forEach((el) => {
    el.replaceWith(el.textContent);
  });

  if (!currentWords.length) return;

  const regex = new RegExp(
    `\\b(${currentWords.map(escapeRegExp).join("|")})\\b`,
    "gi"
  );
  const treeWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentNode;
        if (parent.nodeName === "SCRIPT" || parent.nodeName === "STYLE")
          return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodes = [];
  while (treeWalker.nextNode()) {
    if (regex.test(treeWalker.currentNode.nodeValue)) {
      nodes.push(treeWalker.currentNode);
    }
  }

  // Process in chunks to avoid freezing
  for (let i = 0; i < nodes.length; i++) {
    if (i % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const node = nodes[i];
    const span = document.createElement("span");
    span.innerHTML = node.nodeValue.replace(
      regex,
      '<mark class="highlight-extension">$&</mark>'
    );
    node.replaceWith(span);
  }
}

// Helpers
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((val, index) => val === b[index]);
}

// Initialization

userEmail = localStorage.getItem("highlight_user_email");
userDays = parseInt(localStorage.getItem("highlight_user_days"), 10) || 0;
if (userEmail && Number(userDays) > 0) {
  startFetchingWords();
} else {
  createEmailInput();
}

// Cleanup when page unloads
window.addEventListener("unload", cleanup);
