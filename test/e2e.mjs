// End to end: loads the real unpacked extension in headless Chrome, stores
// ANTHROPIC_API_KEY in its storage, lifts a block on the demo page and waits
// for the live description and related cards.
import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(here, "..");
const server = http.createServer((_, res) => res.setHeader("content-type", "text/html").end(readFileSync(path.join(here, "demo.html")))).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, pipe: true, enableExtensions: [ext], args: ["--no-sandbox"] });
try {
  const target = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().includes("background.js"), { timeout: 15000 });
  const worker = await target.worker();
  await worker.evaluate((apiKey) => chrome.storage.local.set({ apiKey }), process.env.ANTHROPIC_API_KEY);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${port}/`);
  await new Promise((r) => setTimeout(r, 500));
  const box = await (await page.$("#lede")).boundingBox();
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.click(box.x + 40, box.y + 20);
  await page.keyboard.up("Alt");
  await page.waitForFunction(() => {
    const s = document.querySelector("[data-lift-out]")?.shadowRoot;
    return s?.querySelector("[aria-live]")?.getAttribute("aria-busy") === "false" && !s.querySelector(".card.placeholder");
  }, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(here, "shots", "e2e.png") });
  console.log(await page.evaluate(() => {
    const s = document.querySelector("[data-lift-out]").shadowRoot;
    return { desc: s.querySelector("[aria-live]").innerText, cards: [...s.querySelectorAll("button.card .why")].map((c) => c.textContent), quiet: s.querySelector(".quiet")?.textContent };
  }));
} finally {
  await browser.close();
  server.close();
}
