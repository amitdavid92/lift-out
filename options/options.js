const input = document.getElementById("key");
const status = document.getElementById("status");
const say = (text) => (status.textContent = text);

chrome.storage.local.get("apiKey").then(({ apiKey }) => {
  if (apiKey) input.value = apiKey;
});

document.getElementById("save").addEventListener("click", async () => {
  const apiKey = input.value.trim();
  if (!apiKey) return say("Paste a key first.");
  await chrome.storage.local.set({ apiKey });
  say("Saved.");
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("apiKey");
  input.value = "";
  say("Key removed.");
});

document.getElementById("test").addEventListener("click", async () => {
  const apiKey = input.value.trim();
  if (!apiKey) return say("Paste a key first.");
  say("Testing…");
  const result = await chrome.runtime.sendMessage({ type: "test-key", apiKey });
  say(result?.ok ? "The key works." : result?.message || "The test failed.");
});
