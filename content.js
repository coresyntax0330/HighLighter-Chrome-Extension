let currentWords = [];
let userEmail = null;
let intervalId = null;

const API_URL = "http://85.208.108.238:5000/api/bids/get-companies"; // Example: expects ?email=xyz

// 1. Create email input UI
function createEmailInput() {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "20px";
  wrapper.style.right = "20px";
  wrapper.style.background = "#fff";
  wrapper.style.border = "1px solid #ccc";
  wrapper.style.padding = "10px";
  wrapper.style.zIndex = "99999";
  wrapper.style.boxShadow = "0 0 10px rgba(0,0,0,0.1)";
  wrapper.style.borderRadius = "8px";

  const input = document.createElement("input");
  input.type = "email";
  input.placeholder = "Enter your email";
  input.style.marginRight = "8px";
  input.style.padding = "4px";
  input.style.color = "#000";

  const button = document.createElement("button");
  button.textContent = "Start";
  button.style.padding = "4px 8px";
  button.style.background = "blue";
  button.style.color = "#fff";

  button.onclick = () => {
    const email = input.value.trim();
    if (email) {
      userEmail = email;
      wrapper.remove();
      localStorage.setItem("highlight_user_email", email);
      startFetchingWords();
    } else {
      alert("Please enter a valid email.");
    }
  };

  wrapper.appendChild(input);
  wrapper.appendChild(button);
  document.body.appendChild(wrapper);
}

// 2. Start polling the backend every 10 seconds
function startFetchingWords() {
  fetchAndHighlight(); // Run immediately
  intervalId = setInterval(fetchAndHighlight, 10000); // Every 10s
}

// 3. Fetch from backend and highlight
function fetchAndHighlight() {
  chrome.runtime.sendMessage(
    {
      action: "fetchData",
      url: `http://85.208.108.238:5000/api/bids/get-companies?email=${encodeURIComponent(
        userEmail
      )}`,
    },
    (response) => {
      if (response.data) {
        currentWords = response.data;
        // clearHighlights();
        highlightWords(currentWords);
      } else {
        console.error("Error:", response.error);
      }
    }
  );
}

// 4. Clear previous highlights
function clearHighlights() {
  document.querySelectorAll("mark.highlighted-extention").forEach((el) => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

// 5. Highlight function
function highlightWords(words) {
  const regex = new RegExp(`\\b(${words.join("|")})\\b`, "gi");

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const matches = node.nodeValue.match(regex);
      if (matches) {
        const span = document.createElement("span");
        span.innerHTML = node.nodeValue.replace(regex, (match) => {
          return `<mark class="highlighted-extention">${match}</mark>`;
        });
        node.replaceWith(span);
      }
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.childNodes &&
      !["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(node.tagName)
    ) {
      Array.from(node.childNodes).forEach(walk);
    }
  }

  walk(document.body);
}

// Load email from localStorage (if available)
userEmail = localStorage.getItem("highlight_user_email");

if (userEmail) {
  startFetchingWords();
} else {
  createEmailInput();
}
