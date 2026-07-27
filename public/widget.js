(function () {
  const currentScript = document.currentScript;
  const origin = new URL(currentScript.src).origin;

  const bubble = document.createElement("button");
  bubble.textContent = "IT Help";
  Object.assign(bubble.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    borderRadius: "999px",
    padding: "12px 20px",
    background: "#2563eb",
    color: "white",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  });

  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/widget-frame.html`;
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "80px",
    right: "20px",
    width: "360px",
    height: "480px",
    border: "none",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    zIndex: "999999",
    display: "none",
  });

  bubble.addEventListener("click", () => {
    iframe.style.display = iframe.style.display === "none" ? "block" : "none";
  });

  document.body.appendChild(iframe);
  document.body.appendChild(bubble);
})();
