/*
 * Oxxy "Chat on WhatsApp" button for the website (client, 17 Nov 2026).
 * Add ONE line before </body> on any page:
 *
 *   <script src="https://YOUR-CONSOLE-DOMAIN/oxxy-whatsapp-button.js" data-number="91XXXXXXXXXX" defer></script>
 *
 * data-number : the WhatsApp business number, country code first, digits only (required)
 * data-text   : the first message typed for the customer (default "Hi"); the bot answers with the welcome card
 * data-label  : the button text (default "Chat with Oxxy")
 * data-side   : "right" (default) or "left"
 * No cookies, no tracking, no other requests: it only opens https://wa.me/<number>.
 */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var number = String(me.getAttribute("data-number") || "").replace(/\D/g, "");
  if (!number) {
    console.warn("Oxxy WhatsApp button: data-number is missing");
    return;
  }
  var text = me.getAttribute("data-text") || "Hi";
  var label = me.getAttribute("data-label") || "Chat with Oxxy";
  var side = me.getAttribute("data-side") === "left" ? "left" : "right";

  var a = document.createElement("a");
  a.href = "https://wa.me/" + number + "?text=" + encodeURIComponent(text);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", label + " on WhatsApp");
  a.style.cssText =
    "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "padding:12px 18px;border-radius:999px;background:#25D366;color:#fff;font:600 15px/1 Arial,sans-serif;" +
    "text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)";
  a.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path fill="#fff" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.5.7 4.8 2 6.9L3 29l6.7-2.2c2 1.1 4.1 1.6 6.3 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23c-2 0-4-.6-5.7-1.6l-.4-.2-4 1.3 1.3-3.9-.3-.4a10.3 10.3 0 0 1-1.6-5.6C5.3 9.8 10.1 5.2 16 5.2s10.7 4.6 10.7 10.4S21.9 26 16 26zm5.9-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 .8.4 1.4.6 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.3z"/></svg>' +
    "<span></span>";
  a.querySelector("span").textContent = label;
  document.body.appendChild(a);
})();
