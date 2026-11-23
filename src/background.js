import Anthropic from "@anthropic-ai/sdk";
import { MODEL, describeRequest, relatedRequest, parseRelated } from "./requests.js";

async function getClient() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) return null;
  // The key is the user's own, stored in this extension's private storage.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function explain(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in the Lift Out settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Your API key is not allowed to use this model.";
  if (err instanceof Anthropic.RateLimitError) return "The API is rate limiting requests. Try again in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API. Check your connection.";
  if (err instanceof Anthropic.APIError) return `The API returned an error (${err.status ?? "unknown"}): ${err.message}`;
  return `Something went wrong: ${err?.message || err}`;
}

// ---------- images ----------

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Turns an image reference from the page ({url} or {dataUrl}) into an API
// image source. The image is downloaded here, scaled so its long edge is at
// most `maxEdge`, and re-encoded as JPEG, which makes any format Chrome can
// decode acceptable to the API and keeps requests small. If that fails, a
// public https address is passed through for the API to fetch itself.
async function toSource(ref, maxEdge, signal) {
  if (!ref) return null;
  try {
    const res = await fetch(ref.dataUrl || ref.url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (blob.size > 25e6) throw new Error("too large");
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent areas would otherwise turn black in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    return { type: "base64", media_type: "image/jpeg", data: await toBase64(jpeg) };
  } catch {
    return ref.url && /^https:/.test(ref.url) ? { type: "url", url: ref.url } : null;
  }
}

const isBadRequest = (err) => err instanceof Anthropic.BadRequestError;
const embedded = (source) => source?.type === "base64";

// ---------- the two requests ----------

async function streamDescription(client, block, blockImages, post, signal) {
  const attempt = async (images) => {
    const stream = client.beta.messages.stream(describeRequest(block, images), { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        post({ type: "delta", text: event.delta.text });
      }
    }
    return stream.finalMessage();
  };

  const images = (await blockImages).filter((img) => img.source);
  let message;
  try {
    message = await attempt(images);
  } catch (err) {
    // An image address the API cannot fetch fails the whole request (before
    // any text is produced), so retry once with only the images we embedded.
    if (!isBadRequest(err) || images.every((img) => embedded(img.source))) throw err;
    message = await attempt(images.filter((img) => embedded(img.source)));
  }

  if (message.stop_reason === "refusal") {
    post({ type: "desc-error", message: "The model declined to describe this block." });
  } else {
    post({ type: "desc-done", cutOff: message.stop_reason === "max_tokens" });
  }
}

async function findRelated(client, block, blockImages, candidates, imageRefs, post, signal) {
  if (!candidates.length && !imageRefs.length) return post({ type: "related", items: [], images: [] });

  const [first, imageCandidates] = await Promise.all([
    blockImages.then((imgs) => imgs.find((img) => img.source)?.source || null),
    Promise.all(imageRefs.map(async (c) => ({ ...c, source: await toSource({ url: c.url }, 512, signal) }))),
  ]);

  const attempt = (allowUrls) => {
    const ok = (source) => (source && (allowUrls || embedded(source)) ? source : null);
    const request = relatedRequest(block, candidates, {
      blockImage: ok(first),
      imageCandidates: imageCandidates.map((c) => ({ ...c, source: ok(c.source) })),
    });
    return client.beta.messages.create(request, { signal });
  };

  let message;
  try {
    message = await attempt(true);
  } catch (err) {
    const usedUrl = [first, ...imageCandidates.map((c) => c.source)].some((s) => s?.type === "url");
    if (!isBadRequest(err) || !usedUrl) throw err;
    message = await attempt(false);
  }
  if (message.stop_reason === "refusal") return post({ type: "related", items: [], images: [] });
  post({ type: "related", ...parseRelated(message, candidates.length, imageCandidates.length) });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lift-out") return;
  const controller = new AbortController();
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
    controller.abort();
  });
  const post = (msg) => {
    if (!open) return;
    try {
      port.postMessage(msg);
    } catch {
      open = false;
    }
  };

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "start") return;
    const client = await getClient();
    if (!client) return post({ type: "no-key" });

    const guard = (work, errorType) =>
      work.catch((err) => {
        if (err instanceof Anthropic.APIUserAbortError || controller.signal.aborted) return;
        post({ type: errorType, message: explain(err) });
      });

    const { block, candidates = [], imageCandidates = [] } = msg;
    const signal = controller.signal;
    // Prepared once and shared by both requests.
    const blockImages = Promise.all((block.images || []).map(async (ref) => ({ alt: ref.alt, source: await toSource(ref, 1568, signal) })));

    await Promise.all([
      guard(streamDescription(client, block, blockImages, post, signal), "desc-error"),
      guard(findRelated(client, block, blockImages, candidates, imageCandidates, post, signal), "related-error"),
    ]);
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg?.type === "test-key") {
    (async () => {
      try {
        const client = new Anthropic({ apiKey: msg.apiKey, dangerouslyAllowBrowser: true });
        await client.models.retrieve(MODEL);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, message: explain(err) });
      }
    })();
    return true; // async response
  }
});

function togglePick(tab) {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "toggle-pick" }).catch(() => {
    // No content script here (chrome:// pages, the Web Store, or a tab opened
    // before the extension was installed).
  });
}

chrome.action.onClicked.addListener(togglePick);
// Boss key: open the page that explains Lift Out next to the current tab, or
// close it if it is already open (Chrome then returns to the tab it came from).
async function toggleAbout(tab) {
  const url = chrome.runtime.getURL("about/about.html");
  const open = (await chrome.runtime.getContexts({ contextTypes: ["TAB"] })).filter((c) => c.documentUrl?.startsWith(url));
  if (open.length) return chrome.tabs.remove(open.map((c) => c.tabId));
  chrome.tabs.create({ url, openerTabId: tab?.id, index: tab ? tab.index + 1 : undefined });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-pick") togglePick(tab);
  if (command === "boss-key") toggleAbout(tab);
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) chrome.runtime.openOptionsPage();
});

// Chrome offers no way to fire a keyboard command from a test, so the
// end-to-end tests call this directly.
self.liftOutTest = { toggleAbout };
