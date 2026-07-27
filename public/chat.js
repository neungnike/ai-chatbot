(function () {
  const messagesEl = document.getElementById("messages");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  const storageKey = "it-chatbot-session-id";
  let sessionId = localStorage.getItem(storageKey) || undefined;

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function getOrCreateAnonId() {
    const key = "it-chatbot-anon-id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  async function sendMessage(message) {
    appendMessage("user", message);

    let response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          channel: window.__CHATBOT_CHANNEL__ || "web",
          externalUserId: getOrCreateAnonId(),
        }),
      });
    } catch {
      appendMessage("assistant", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    if (!response.ok) {
      appendMessage("assistant", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    const data = await response.json();
    sessionId = data.sessionId;
    localStorage.setItem(storageKey, sessionId);
    appendMessage("assistant", data.answer);
  }

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = inputEl.value.trim();
    if (!message) return;
    inputEl.value = "";
    sendMessage(message);
  });
})();
