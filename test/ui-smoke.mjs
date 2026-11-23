// Drives the content script in headless Chrome against test/demo.html with a
// stubbed chrome.runtime (no extension install, no API calls) and saves
// screenshots to test/shots/.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, "shots");
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.evaluateOnNewDocument(() => {
  const DESC = "This is the opening paragraph of a local news article.\n\nIt says the city council approved the second stage of a tram line by 9 votes to 4. The new section is 6.2 km long. It will be paid for in two ways: the city will borrow money by selling bonds, and businesses in the Eastside area will pay a special charge.";
  window.__posted = [];
  const stub = {
    runtime: {
      onMessage: { addListener: (fn) => (window.__toggle = () => fn({ type: "toggle-pick" })) },
      sendMessage: () => {},
      connect: () => {
        const listeners = [];
        let dead = false;
        const emit = (m) => !dead && listeners.forEach((l) => l(m));
        return {
          onMessage: { addListener: (l) => listeners.push(l) },
          onDisconnect: { addListener: () => {} },
          disconnect: () => (dead = true),
          postMessage: (msg) => {
            window.__posted.push(msg);
            const words = DESC.split(/(?<= )/);
            words.forEach((w, i) => setTimeout(() => emit({ type: "delta", text: w }), 150 + i * 12));
            setTimeout(() => emit({ type: "desc-done" }), 200 + words.length * 12);
            const pick = (re, reason) => {
              const c = msg.candidates.find((c) => re.test(c.text));
              return c ? [{ id: c.id, reason }] : [];
            };
            const items = [...pick(/Estimated cost/, "Shows the cost figures behind the plan"), ...pick(/framework agreement caps/, "Explains the spending cap it mentions"), ...pick(/pay the levy/, "Says who pays the business charge")];
            setTimeout(() => emit({ type: "related", items }), 500);
          },
        };
      },
    },
  };
  Object.defineProperty(window, "chrome", { value: stub, configurable: true });
});

await page.goto("file://" + path.join(here, "demo.html"));
await page.addScriptTag({ path: path.join(here, "..", "content", "content.js") });

const shadowEval = (fn, ...args) => page.evaluate(fn, ...args);
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Alt+hover shows the outline around the paragraph.
const lede = await page.$("#lede");
const box = await lede.boundingBox();
await page.keyboard.down("Alt");
await page.mouse.move(box.x + 40, box.y + 20);
await sleep(250);
check("outline visible on Alt+hover", await shadowEval(() => document.querySelector("[data-lift-out]").shadowRoot.querySelector(".outline").classList.contains("on")));
await page.screenshot({ path: path.join(shots, "1-hover.png") });

// 2. Alt+click lifts it.
await page.mouse.click(box.x + 40, box.y + 20);
await page.keyboard.up("Alt");
await sleep(200);
await page.screenshot({ path: path.join(shots, "2-lifting.png") });
await sleep(2500);
await page.screenshot({ path: path.join(shots, "3-open.png") });
const state = await shadowEval(() => {
  const s = document.querySelector("[data-lift-out]").shadowRoot;
  return {
    dialog: !!s.querySelector('[role="dialog"]'),
    panelText: s.querySelector(".content").innerText.slice(0, 40),
    desc: s.querySelector(".desc-text").textContent.length,
    busy: s.querySelector("[aria-live]").getAttribute("aria-busy"),
    cards: s.querySelectorAll("button.card").length,
    focusInPanel: s.activeElement?.classList.contains("panel"),
    inert: document.body.inert,
    candidates: window.__posted[0].candidates.length,
    hasAd: /TYRES/.test(s.querySelector(".content").innerText),
  };
});
console.log(state);
check("dialog open with clean copy", state.dialog && state.panelText.startsWith("The council voted") && !state.hasAd);
check("description streamed and marked done", state.desc > 100 && state.busy === "false");
check("three related cards", state.cards === 3);
check("focus moved into panel, page inert", state.focusInPanel && state.inert);

// 3. Tab stays inside the dialog.
for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
check("focus trapped in dialog", await shadowEval(() => !!document.querySelector("[data-lift-out]").shadowRoot.activeElement));

// 4. Clicking a related card swaps it in.
await shadowEval(() => document.querySelector("[data-lift-out]").shadowRoot.querySelector("button.card").click());
await sleep(2500);
await page.screenshot({ path: path.join(shots, "4-swapped.png") });
check("swap shows the cost table", await shadowEval(() => !!document.querySelector("[data-lift-out]").shadowRoot.querySelector(".content table, .content caption")));

// 5. Escape puts it back.
await page.keyboard.press("Escape");
await sleep(800);
check("closed and cleaned up", await shadowEval(() => !document.querySelector("[data-lift-out]").shadowRoot.querySelector(".stage") && !document.body.inert));

// 6. Keyboard pick mode.
await page.evaluate(() => window.__toggle());
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await sleep(250);
await page.screenshot({ path: path.join(shots, "5-pick.png") });
await page.keyboard.press("Enter");
await sleep(1200);
check("keyboard pick opens dialog", await shadowEval(() => !!document.querySelector("[data-lift-out]").shadowRoot.querySelector('[role="dialog"]')));
await page.keyboard.press("Escape");
await sleep(800);

// 7. Reduced motion still works.
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.keyboard.down("Alt");
await page.mouse.click(box.x + 40, box.y + 20);
await page.keyboard.up("Alt");
await sleep(600);
check("opens under reduced motion", await shadowEval(() => !!document.querySelector("[data-lift-out]").shadowRoot.querySelector('[role="dialog"]')));

check("no page errors", errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
