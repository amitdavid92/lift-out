// Opens and closes the boss-key page through the real extension.
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ext = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, pipe: true, enableExtensions: [ext], args: ["--no-sandbox"] });
const target = await browser.waitForTarget((t) => t.type() === "service_worker");
const worker = await target.worker();
const count = async () => (await browser.pages()).filter((p) => p.url().includes("about/about.html")).length;
const press = () => worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await self.liftOutTest.toggleAbout(tab); });
const hasFn = await worker.evaluate(() => typeof self.liftOutTest?.toggleAbout);
console.log("toggleAbout reachable:", hasFn);
if (hasFn === "function") {
  await press(); await new Promise((r) => setTimeout(r, 800)); console.log("open after first press:", await count());
  const page = (await browser.pages()).find((p) => p.url().includes("about/about.html"));
  await page.setViewport({ width: 1280, height: 860 }); await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(ext, "test", "shots", "about.png") });
  await press(); await new Promise((r) => setTimeout(r, 800)); console.log("open after second press:", await count());
}
await browser.close();
