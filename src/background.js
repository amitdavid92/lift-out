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

async function streamDescription(client, block, post, signal) {
  let sent = false;
  const attempt = async (withImages) => {
    const stream = client.beta.messages.stream(describeRequest(block, { withImages }), { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        sent = true;
        post({ type: "delta", text: event.delta.text });
      }
    }
    return stream.finalMessage();
  };

  let message;
  try {
    message = await attempt(true);
  } catch (err) {
    // Image URLs the API cannot fetch (private, unsupported type) fail the
    // whole request, so retry once with text only.
    const canRetry = err instanceof Anthropic.BadRequestError && block.images?.length && !sent;
    if (!canRetry) throw err;
    message = await attempt(false);
  }

  if (message.stop_reason === "refusal") {
    post({ type: "desc-error", message: "The model declined to describe this block." });
  } else {
    post({ type: "desc-done", cutOff: message.stop_reason === "max_tokens" });
  }
}

async function findRelated(client, block, candidates, post, signal) {
  if (!candidates.length) return post({ type: "related", items: [] });
  const message = await client.beta.messages.create(relatedRequest(block, candidates), { signal });
  if (message.stop_reason === "refusal") return post({ type: "related", items: [] });
  post({ type: "related", items: parseRelated(message, candidates.length) });
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

    await Promise.all([
      guard(streamDescription(client, msg.block, post, controller.signal), "desc-error"),
      guard(findRelated(client, msg.block, msg.candidates || [], post, controller.signal), "related-error"),
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
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-pick") togglePick(tab);
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) chrome.runtime.openOptionsPage();
});
