// Escape closes this tab, which returns to the tab it was opened from.
addEventListener("keydown", async (e) => {
  if (e.key !== "Escape") return;
  const tab = await chrome.tabs.getCurrent();
  if (tab) chrome.tabs.remove(tab.id);
});
