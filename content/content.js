// Lift Out content script.
// Alt+click (or pick mode) lifts a block out of the page into a clean reading
// panel, streams a plain-language description beside it, and fans out related
// blocks from the same page underneath.
(() => {
  if (window.__liftOutLoaded) return;
  window.__liftOutLoaded = true;

  const SPRING = "cubic-bezier(0.22, 1.25, 0.36, 1)";
  const EASE_BACK = "cubic-bezier(0.5, 0, 0.2, 1)";
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      --bg: #fffdf7; --ink: #15151c; --muted: #4a4a5a; --accent: #4338ca;
      --card: #ffffff; --line: #d6d2c4; --focus: #f59e0b;
      font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
    }
    @media (prefers-color-scheme: dark) {
      .root { --bg: #17171d; --ink: #f3f1ea; --muted: #b9b7c6; --accent: #a5b4fc; --card: #20202a; --line: #3d3d4e; }
    }
    :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

    .outline {
      position: fixed; left: 0; top: 0; pointer-events: none; border-radius: 8px; opacity: 0;
      box-shadow: 0 0 0 3px #4338ca, 0 0 0 6px rgba(255,255,255,.92), 0 0 30px 8px rgba(99,102,241,.55);
      transition: transform .14s ease-out, width .14s ease-out, height .14s ease-out, opacity .14s;
    }
    .outline.on { opacity: 1; }
    .hint {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); pointer-events: none;
      background: #15151c; color: #fffdf7; padding: 10px 18px; border-radius: 999px; font-size: 16px;
      box-shadow: 0 6px 24px rgba(0,0,0,.35); border: 2px solid #fffdf7; max-width: 92vw;
    }

    .backdrop {
      position: fixed; inset: 0; pointer-events: auto;
      background: rgba(12,12,24,.6); backdrop-filter: blur(7px) saturate(.8); -webkit-backdrop-filter: blur(7px) saturate(.8);
    }
    .ghost {
      position: fixed; left: 0; top: 0; pointer-events: none; border-radius: 8px;
      border: 2px dashed rgba(255,255,255,.9); background: rgba(255,255,255,.07);
    }
    .stage {
      position: fixed; inset: 0; overflow: auto; pointer-events: auto;
      display: grid; place-items: center; padding: 32px;
    }
    .layout {
      width: min(1180px, 100%); display: grid; gap: 20px; align-items: start;
      grid-template-columns: minmax(0, 1.55fr) minmax(270px, 1fr);
    }
    @media (max-width: 860px) { .layout { grid-template-columns: minmax(0, 1fr); } .stage { padding: 14px; place-items: start center; } }

    .panel {
      position: relative; z-index: 2; background: var(--bg); border-radius: 16px; padding: 26px 32px 30px;
      max-height: 62vh; overflow: auto; transform-origin: 0 0;
      box-shadow: 0 30px 80px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08);
      font-size: 20px; line-height: 1.7; overflow-wrap: anywhere;
    }
    .close {
      position: sticky; top: 0; float: right; margin: -8px -14px 8px 14px; width: 44px; height: 44px;
      border-radius: 50%; border: 2px solid var(--line); background: var(--card); color: var(--ink);
      font: 600 22px/1 system-ui, sans-serif; cursor: pointer;
    }
    .close:hover { border-color: var(--accent); }
    .content > :first-child { margin-top: 0; }
    .content > :last-child { margin-bottom: 0; }
    .content p, .content ul, .content ol, .content blockquote, .content pre, .content table, .content figure, .content dl { margin: 0 0 .9em; }
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 { line-height: 1.25; margin: 0 0 .5em; font-size: 1.3em; }
    .content img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: .3em 0; }
    .content a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; padding: 4px 0; }
    .content blockquote { border-left: 4px solid var(--accent); padding-left: 16px; }
    .content pre { overflow: auto; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: .8em; }
    .content table { border-collapse: collapse; width: 100%; font-size: .9em; }
    .content th, .content td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
    .content figcaption { color: var(--muted); font-size: .85em; }
    .content.media img { max-height: 52vh; width: auto; margin: 0 auto .5em; }
    [hidden] { display: none !important; }

    .desc, .related-wrap { z-index: 1; }
    .desc {
      background: var(--card); border-radius: 16px; padding: 20px 22px 22px; max-height: 62vh; overflow: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.35); border: 1px solid var(--line);
    }
    .desc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
    .desc-head .label { margin: 0; }
    .toggle {
      min-height: 36px; padding: 4px 14px; border-radius: 999px; border: 2px solid var(--line); background: transparent;
      color: var(--accent); font: 600 14px system-ui, sans-serif; cursor: pointer; white-space: nowrap;
    }
    .toggle:hover { border-color: var(--accent); }
    .desc-text { cursor: pointer; }
    .desc-text.short .rest { display: none; }
    .desc-text.short .lead { font-size: 20px; }
    .label { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
    .desc-text { white-space: pre-wrap; font-size: 18px; line-height: 1.65; }
    .desc-text.streaming::after {
      content: ""; display: inline-block; width: .45em; height: 1.05em; margin-left: 2px;
      background: var(--accent); vertical-align: text-bottom; animation: blink 1s steps(2) infinite;
    }
    .note { color: var(--muted); font-size: 15px; margin: 12px 0 0; }
    .btn {
      margin-top: 14px; min-height: 44px; padding: 8px 18px; border-radius: 10px; border: 2px solid var(--accent);
      background: var(--accent); color: var(--bg); font: 600 16px system-ui, sans-serif; cursor: pointer;
    }
    .skeleton { display: grid; gap: 10px; }
    .skeleton i {
      display: block; height: 14px; border-radius: 7px;
      background: linear-gradient(90deg, var(--line) 25%, color-mix(in srgb, var(--line) 40%, transparent) 50%, var(--line) 75%);
      background-size: 200% 100%; animation: shimmer 1.3s linear infinite;
    }
    .skeleton i:nth-child(2) { width: 92%; } .skeleton i:nth-child(3) { width: 64%; }

    .related-wrap { grid-column: 1 / -1; }
    .related-wrap .label { color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
    .cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card {
      display: block; width: 100%; text-align: left; min-height: 104px; padding: 14px 16px; border-radius: 14px;
      background: var(--card); color: var(--ink); border: 1px solid var(--line); cursor: pointer;
      font: inherit; box-shadow: 0 12px 34px rgba(0,0,0,.3); transition: transform .18s ease-out, border-color .18s;
    }
    .card:hover, .card:focus-visible { transform: translateY(-4px); border-color: var(--accent); }
    .card.placeholder { cursor: default; }
    .card .why { display: block; font-weight: 650; font-size: 16px; line-height: 1.35; }
    .card .snip {
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
      color: var(--muted); font-size: 14px; line-height: 1.45; margin-top: 6px;
    }
    .group + .group { margin-top: 18px; }
    .thumbs { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
    .card.thumb { padding: 0; overflow: hidden; min-height: 0; }
    .card.thumb img { display: block; width: 100%; height: 124px; object-fit: cover; background: var(--line); }
    .card.thumb .why { padding: 10px 12px 12px; font-size: 15px; }
    .card.thumb.placeholder { height: 170px; padding: 14px 16px; }
    .quiet { color: #fff; opacity: .85; font-size: 15px; margin: 0; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    @keyframes blink { 50% { opacity: 0; } }
    @keyframes shimmer { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) {
      .outline, .card { transition: none; }
      .card:hover, .card:focus-visible { transform: none; }
      .skeleton i, .desc-text.streaming::after { animation: none; }
    }
  `;

  // ---------- small helpers ----------

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids);
    return el;
  };

  // Entrance animation; collapses to a short fade under reduced motion.
  const animIn = (el, frames, opts) =>
    reducedMotion()
      ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 })
      : el.animate(frames, { fill: "backwards", ...opts });

  const animOut = (el, frames, opts) =>
    reducedMotion()
      ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" })
      : el.animate(frames, { fill: "forwards", ...opts });

  const flipFrames = (from, to) => {
    const sx = Math.max(from.width / to.width, 0.05);
    const sy = Math.max(from.height / to.height, 0.05);
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
  };

  // ---------- shadow host ----------

  let host, shadow, root, outlineEl, hintEl;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.setAttribute("data-lift-out", "");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.append(h("style", { text: CSS }));
    root = h("div", { class: "root" });
    outlineEl = h("div", { class: "outline", "aria-hidden": "true" });
    root.append(outlineEl);
    shadow.append(root);
    document.documentElement.append(host);
  }

  // ---------- choosing a block ----------

  const MEDIA = "img, picture, figure, video, canvas, svg, table";

  function blockFrom(node) {
    let n = node?.nodeType === 1 ? node : node?.parentElement;
    if (!n || host?.contains(n)) return null;
    while (n && n !== document.body && n !== document.documentElement) {
      const r = n.getBoundingClientRect();
      const isMedia = n.matches(MEDIA_EL);
      const cs = getComputedStyle(n);
      const inline = !isMedia && cs.display.startsWith("inline");
      const picture = r.height >= 90 && BG_URL.test(cs.backgroundImage);
      const substantial = isMedia || picture || n.matches(MEDIA) || (n.innerText || "").trim().length >= 40;
      if (!inline && substantial && r.width >= 120 && r.height >= 24) return (isMedia && n.closest("figure")) || n;
      n = n.parentElement;
    }
    return null;
  }

  // ---------- images, charts and graphics ----------

  const MEDIA_EL = "img, canvas, svg";
  const BG_URL = /url\(["']?(https?:[^"')]+)["']?\)/;
  const MAX_EDGE = 1568;

  const bgUrl = (el) => BG_URL.exec(getComputedStyle(el).backgroundImage)?.[1] || null;
  const textLength = (el) => (el.innerText || "").trim().length;
  const altOf = (m) => (m.alt || m.getAttribute("aria-label") || m.querySelector?.("title")?.textContent || m.getAttribute("title") || "").trim().slice(0, 300);

  // The pictures inside a block (or the block itself), ignoring icons.
  function mediaIn(el) {
    const all = el.matches(MEDIA_EL) ? [el] : [...el.querySelectorAll(MEDIA_EL)].filter((m) => !m.parentElement.closest("svg"));
    const big = all.filter((m) => {
      const r = m.getBoundingClientRect();
      return r.width >= 100 && r.height >= 80;
    });
    if (!big.length && bgUrl(el)) return [el];
    return big;
  }

  // A block counts as an image when it is a picture with at most a caption.
  const isImageBlock = (el) => mediaIn(el).length > 0 && textLength(el) < 200;

  function backdropColor(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/, 0\)$/.test(c)) return c;
    }
    return "#fff";
  }

  // Draws an image source onto a canvas and returns a JPEG data URL. Throws
  // when the source is cross-origin (a "tainted" canvas).
  function rasterize(source, w, h, background) {
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  const SVG_STYLE = "fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity font-family font-size font-weight font-style text-anchor dominant-baseline visibility display color".split(" ");

  // Inline SVG (most web charts) is styled by the page's CSS, so copy the
  // computed styles onto a clone before turning it into a picture.
  async function svgSnapshot(svg) {
    const r = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll("*")];
    const dst = [clone, ...clone.querySelectorAll("*")];
    if (src.length > 4000) throw new Error("svg too complex");
    src.forEach((node, i) => {
      const cs = getComputedStyle(node);
      for (const prop of SVG_STYLE) dst[i].style.setProperty(prop, cs.getPropertyValue(prop));
    });
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", r.width);
    clone.setAttribute("height", r.height);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await img.decode();
    return rasterize(img, r.width * 2, r.height * 2, backdropColor(svg));
  }

  async function makeRef(el) {
    const tag = el.tagName.toUpperCase();
    if (tag === "IMG") {
      const src = el.currentSrc || el.src;
      if (/^https?:/.test(src)) return { url: src };
      if (/^(data:image\/|blob:)/.test(src)) return { dataUrl: rasterize(el, el.naturalWidth, el.naturalHeight, "#fff") };
      return null;
    }
    if (tag === "CANVAS") return { dataUrl: rasterize(el, el.width, el.height, backdropColor(el)) };
    if (tag === "SVG") return { dataUrl: await svgSnapshot(el) };
    const bg = bgUrl(el);
    return bg ? { url: bg } : null;
  }

  // Where the model can get this picture: {url} for the extension to download,
  // or {dataUrl} for graphics that only exist in this page. Null if neither.
  const refs = new WeakMap();
  function imageRef(el) {
    if (!refs.has(el)) refs.set(el, makeRef(el).catch(() => null));
    return refs.get(el);
  }

  function nearbyText(el) {
    const grab = (dir) => {
      let n = el;
      for (let depth = 0; depth < 3 && n && n !== document.body; depth++, n = n.parentElement) {
        for (let s = n[dir]; s; s = s[dir]) {
          const t = (s.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length >= 60 && !s.matches(CHROME)) return t;
        }
      }
      return "";
    };
    return { before: grab("previousElementSibling").slice(-500), after: grab("nextElementSibling").slice(0, 500) };
  }

  // Other sizeable images on the page, largest first, as related-image candidates.
  function collectImages(target, limit = 8) {
    const own = new Set(target ? mediaIn(target).map((m) => m.currentSrc || m.src) : []);
    const seen = new Set();
    const found = [];
    for (const img of document.images) {
      if (host?.contains(img) || img.closest(CHROME)) continue;
      const el = img.closest("figure") || img;
      if (target && (el === target || el.contains(target) || target.contains(el))) continue;
      const src = img.currentSrc || img.src;
      if (!/^https?:/.test(src) || seen.has(src) || own.has(src)) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 120 || r.height < 90 || img.naturalWidth < 100) continue;
      seen.add(src);
      found.push({
        el,
        src,
        area: r.width * r.height,
        alt: altOf(img),
        caption: (img.closest("figure")?.querySelector("figcaption")?.innerText || "").trim().slice(0, 300),
        heading: headingFor(el),
      });
    }
    const keep = new Set([...found].sort((a, b) => b.area - a.area).slice(0, limit));
    return found.filter((f) => keep.has(f));
  }

  function headingFor(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
        if (/^H[1-6]$/.test(s.tagName)) return s.innerText.trim().slice(0, 140);
        const inner = s.querySelectorAll?.("h1, h2, h3, h4, h5, h6");
        if (inner?.length) return inner[inner.length - 1].innerText.trim().slice(0, 140);
      }
    }
    return "";
  }

  const BLOCKS = "p, figure, blockquote, pre, table, ul, ol, dl";
  const CHROME = "nav, footer, [role=navigation], [role=contentinfo], [aria-hidden=true]";

  // Other readable blocks on the page. `target` (optional) is excluded along
  // with anything inside or around it.
  function collectBlocks(target, limit = 80, withPictures = false) {
    const out = [];
    for (const el of document.querySelectorAll(BLOCKS)) {
      if (out.length >= limit) break;
      // Picture figures are offered as related images instead.
      if (!withPictures && el.tagName === "FIGURE" && el.querySelector("img") && isImageBlock(el)) continue;
      if (host?.contains(el) || el.parentElement?.closest(BLOCKS) || el.closest(CHROME)) continue;
      if (target && (el === target || el.contains(target) || target.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 16) continue;
      let text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (text.length < 60) {
        const alt = el.querySelector("img[alt]")?.alt;
        if (!alt) continue;
        text = `[Image: ${alt}] ${text}`;
      }
      out.push({ el, text: text.slice(0, 280), heading: headingFor(el) });
    }
    return out;
  }

  async function extract(el) {
    const MAX = 12000;
    let text = (el.innerText || "").trim();
    const truncated = text.length > MAX;
    if (truncated) text = text.slice(0, MAX);
    const media = mediaIn(el).slice(0, 3);
    const found = await Promise.all(media.map(imageRef));
    const images = media.map((m, i) => found[i] && { ...found[i], alt: altOf(m) }).filter(Boolean);
    const kind = isImageBlock(el) ? "image" : "text";
    const figure = el.closest("figure");
    return {
      kind,
      text,
      truncated,
      images,
      imageCount: media.length,
      alt: media[0] ? altOf(media[0]) : "",
      caption: (figure?.querySelector("figcaption")?.innerText || "").trim().slice(0, 600),
      link: kind === "image" ? el.closest("a[href]")?.href || "" : "",
      nearby: kind === "image" ? nearbyText(el) : null,
      title: document.title,
      url: location.origin + location.pathname,
      heading: headingFor(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
    };
  }

  // ---------- clean reading copy ----------

  const KEEP = new Set(
    "P H1 H2 H3 H4 H5 H6 UL OL LI A STRONG B EM I U MARK BLOCKQUOTE CODE PRE TABLE CAPTION THEAD TBODY TFOOT TR TD TH FIGURE FIGCAPTION BR HR DL DT DD SUB SUP ABBR Q CITE SMALL".split(" ")
  );
  const DROP = new Set(
    "SCRIPT STYLE NOSCRIPT IFRAME TEMPLATE SVG CANVAS VIDEO AUDIO OBJECT EMBED FORM INPUT BUTTON SELECT TEXTAREA DIALOG LINK META".split(" ")
  );

  function cleanImage(img) {
    const src = img.currentSrc || img.src;
    if (!/^(https?:|data:image\/|blob:)/.test(src)) return null;
    return h("img", { src, alt: img.alt || "" });
  }

  // A canvas or inline SVG cannot be restyled inside the panel, so show a
  // picture of it instead.
  function snapshotImage(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 80) return null;
    const img = h("img", { alt: altOf(el) || "Graphic from the page" });
    imageRef(el).then((ref) => {
      if (ref?.dataUrl) img.src = ref.dataUrl;
      else img.replaceWith(h("p", { text: "This graphic could not be copied into the panel." }));
    });
    return img;
  }

  function cleanInto(src, out) {
    for (const child of src.childNodes) {
      if (child.nodeType === 3) {
        out.append(child.textContent);
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toUpperCase();
      if (tag === "SVG" || tag === "CANVAS") {
        const img = snapshotImage(child);
        if (img) out.append(img);
        continue;
      }
      if (DROP.has(tag)) continue;
      const cs = getComputedStyle(child);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (tag === "IMG") {
        const img = cleanImage(child);
        if (img) out.append(img);
        continue;
      }
      let el = null;
      if (KEEP.has(tag)) el = document.createElement(tag.toLowerCase());
      else if (!cs.display.startsWith("inline") && cs.display !== "contents") el = document.createElement("div");
      if (!el) {
        cleanInto(child, out);
        continue;
      }
      if (tag === "A" && /^(https?:|mailto:)/.test(child.href)) {
        el.href = child.href;
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }
      if (tag === "TD" || tag === "TH") {
        if (child.colSpan > 1) el.colSpan = child.colSpan;
        if (child.rowSpan > 1) el.rowSpan = child.rowSpan;
      }
      cleanInto(child, el);
      if (el.childNodes.length || tag === "BR" || tag === "HR") out.append(el);
    }
  }

  // A copy of the block rebuilt from a whitelist of plain elements, so it can
  // be restyled for reading and carries no scripts, styles or handlers.
  function renderClean(el) {
    if (el.tagName === "IMG") return cleanImage(el) || h("p", { text: el.alt || "Image" });
    const tag = el.tagName.toUpperCase();
    if (tag === "SVG" || tag === "CANVAS") return snapshotImage(el) || h("p", { text: "This graphic is too small to lift." });
    const wrapper = document.createElement(KEEP.has(tag) && tag !== "A" ? tag.toLowerCase() : "div");
    cleanInto(el, wrapper);
    const bg = bgUrl(el);
    if (bg && !wrapper.querySelector("img")) wrapper.prepend(h("img", { src: bg, alt: altOf(el) }));
    if (!wrapper.childNodes.length) wrapper.append(h("p", { text: (el.innerText || "").trim() || "Nothing readable in this block." }));
    return wrapper;
  }

  // ---------- hover outline and pick mode ----------

  let hovered = null;
  let pickMode = false;
  let pickList = [];
  let pickIndex = -1;

  function showOutline(el) {
    hovered = el;
    if (!el) return hideOutline();
    ensureHost();
    const r = el.getBoundingClientRect();
    outlineEl.style.width = `${r.width + 8}px`;
    outlineEl.style.height = `${r.height + 8}px`;
    outlineEl.style.transform = `translate(${r.left - 4}px, ${r.top - 4}px)`;
    outlineEl.classList.add("on");
  }

  function hideOutline() {
    hovered = null;
    outlineEl?.classList.remove("on");
  }

  function setPick(on) {
    if (on === pickMode) return;
    pickMode = on;
    hintEl?.remove();
    hintEl = null;
    if (!on) return hideOutline();
    ensureHost();
    pickList = collectBlocks(null, 400, true).map((b) => b.el);
    for (const m of document.querySelectorAll(MEDIA_EL)) {
      const r = m.getBoundingClientRect();
      if (r.width < 120 || r.height < 90 || host.contains(m) || m.closest(CHROME)) continue;
      if (!pickList.some((el) => el.contains(m))) pickList.push(m);
    }
    pickList.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    pickIndex = -1;
    hintEl = h("div", { class: "hint", role: "status", text: "Pick a block: click one, or press ↑ ↓ then Enter. Esc cancels." });
    root.append(hintEl);
  }

  function pickStep(delta) {
    if (!pickList.length) return;
    if (pickIndex === -1) {
      // Start from the first block at or below the top of the viewport.
      const first = pickList.findIndex((el) => el.getBoundingClientRect().bottom > 0);
      pickIndex = Math.max(first, 0);
    } else {
      pickIndex = (pickIndex + delta + pickList.length) % pickList.length;
    }
    const el = pickList[pickIndex];
    el.scrollIntoView({ block: "center", behavior: "instant" });
    showOutline(el);
  }

  // ---------- the lifted view ----------

  let ui = null; // overlay nodes while open
  let current = null; // { el, port, candidates }
  let closing = false;
  let restoreFocusTo = null;
  let bodyWasInert = false;

  function buildOverlay() {
    const backdrop = h("div", { class: "backdrop" });
    const ghost = h("div", { class: "ghost", "aria-hidden": "true" });
    const content = h("div", { class: "content" });
    const closeBtn = h("button", { class: "close", type: "button", "aria-label": "Put back (Escape)", text: "×" });
    const panel = h("article", { class: "panel", tabindex: "0", "aria-label": "Lifted content" }, closeBtn, content);
    // The model's first paragraph is a one-sentence summary; `lead` holds it
    // and `rest` holds everything after, so "short" is just hiding `rest`.
    const descLead = h("span", { class: "lead" });
    const descRest = h("span", { class: "rest" });
    const descText = h("div", { class: "desc-text", id: "lift-desc", title: "Click to switch between one sentence and the full description" }, descLead, descRest);
    const descBody = h("div", { "aria-live": "polite" }, descText);
    const descLabel = h("h2", { class: "label", text: "What this is" });
    const descToggle = h("button", { class: "toggle", type: "button", "aria-controls": "lift-desc" });
    const desc = h("aside", { class: "desc", "aria-label": "Description" }, h("div", { class: "desc-head" }, descLabel, descToggle), descBody);
    descToggle.addEventListener("click", () => setShort(!shortDesc));
    descText.addEventListener("click", () => {
      if (!shadow.getSelection?.()?.toString() && !getSelection().toString()) setShort(!shortDesc);
    });
    const cards = h("div", { class: "cards" });
    const thumbs = h("div", { class: "thumbs" });
    const textGroup = h("div", { class: "group" }, h("h2", { class: "label", text: "Related on this page" }), cards);
    const imageGroup = h("div", { class: "group" }, h("h2", { class: "label", text: "Related images" }), thumbs);
    const relatedWrap = h("section", { class: "related-wrap", "aria-label": "Related on this page" }, textGroup, imageGroup);
    const layout = h("div", { class: "layout" }, panel, desc, relatedWrap);
    const stage = h("div", { class: "stage", role: "dialog", "aria-modal": "true", "aria-label": "Lift Out" }, layout);

    closeBtn.addEventListener("click", close);
    stage.addEventListener("click", (e) => {
      if (e.target === stage) close();
    });
    backdrop.addEventListener("click", close);

    root.append(backdrop, ghost, stage);
    ui = { backdrop, ghost, stage, layout, panel, content, desc, descLabel, descBody, descText, descLead, descRest, descToggle, relatedWrap, cards, thumbs, textGroup, imageGroup };

    restoreFocusTo = document.activeElement;
    bodyWasInert = document.body.inert;
    document.body.inert = true; // page behind is unreachable to keyboard and screen readers

    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 120 : 320, easing: "ease-out" });
    animIn(ghost, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200 });
  }

  function placeGhost() {
    if (!ui || !current?.el?.isConnected) return;
    const r = current.el.getBoundingClientRect();
    Object.assign(ui.ghost.style, { width: `${r.width}px`, height: `${r.height}px`, transform: `translate(${r.left}px, ${r.top}px)` });
  }

  function open(el) {
    if (!el || closing) return;
    setPick(false);
    hideOutline();
    ensureHost();
    const from = el.getBoundingClientRect();
    if (!ui) buildOverlay();
    load(el, from);
  }

  // Show `el` in the panel, animating the panel out of `from` (the block's own
  // rectangle on first open, or a related card's rectangle on a swap).
  function load(el, from) {
    current?.port?.disconnect();
    const isImage = isImageBlock(el);
    current = { el, port: null, candidates: collectBlocks(el), imageCandidates: collectImages(el) };

    ui.content.replaceChildren(renderClean(el));
    ui.content.classList.toggle("media", isImage);
    ui.descLabel.textContent = isImage ? "What this shows" : "What this is";
    ui.panel.scrollTop = 0;
    placeGhost();

    ui.descBody.replaceChildren(ui.descText);
    ui.descLead.textContent = "";
    ui.descRest.textContent = "";
    ui.descText.classList.remove("streaming");
    setShort(shortDesc);
    ui.descText.before(h("div", { class: "skeleton", "aria-hidden": "true" }, h("i"), h("i"), h("i")));
    ui.descBody.setAttribute("aria-busy", "true");

    const placeholders = (n, cls) => Array.from({ length: n }, () => h("div", { class: `card placeholder ${cls}`, "aria-hidden": "true" }, h("div", { class: "skeleton" }, h("i"), h("i"), h("i"))));
    // Images lead when an image was lifted; otherwise related text leads.
    ui.relatedWrap.append(...(isImage ? [ui.imageGroup, ui.textGroup] : [ui.textGroup, ui.imageGroup]));
    ui.textGroup.hidden = false;
    ui.cards.replaceChildren(...placeholders(3, ""));
    const expectImages = isImage && current.imageCandidates.length > 0;
    ui.imageGroup.hidden = !expectImages;
    ui.thumbs.replaceChildren(...(expectImages ? placeholders(Math.min(3, current.imageCandidates.length), "thumb") : []));

    const to = ui.panel.getBoundingClientRect();
    animIn(ui.panel, [{ transform: flipFrames(from, to), opacity: 0.35 }, { transform: "none", opacity: 1 }], { duration: 560, easing: SPRING });
    animIn(ui.desc, [{ transform: "translateX(-56px) scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 460, delay: 240, easing: SPRING });
    animIn(ui.relatedWrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 380 });
    fanIn([...ui.relatedWrap.querySelectorAll(".card")], 420);

    ui.panel.focus({ preventScroll: true });
    request(el).catch(() => ui && descMessage("Something went wrong while reading this block."));
  }

  function fanIn(cards, delay = 0) {
    cards.forEach((card, i) => {
      const tilt = (i - (cards.length - 1) / 2) * 3;
      animIn(card, [{ transform: `translateY(-36px) rotate(${tilt}deg) scale(.9)`, opacity: 0 }, { transform: "none", opacity: 1 }], {
        duration: 480,
        delay: delay + i * 70,
        easing: SPRING,
      });
    });
  }

  // Whether descriptions are collapsed to their first sentence. Kept between
  // lifts so someone who prefers short descriptions only has to ask once.
  let shortDesc = false;

  function setShort(on) {
    shortDesc = on;
    if (!ui) return;
    ui.descText.classList.toggle("short", on);
    ui.descToggle.textContent = on ? "Full description" : "One sentence";
    ui.descToggle.setAttribute("aria-expanded", String(!on));
  }

  function renderDesc(text) {
    const cut = text.indexOf("\n\n");
    ui.descLead.textContent = cut === -1 ? text : text.slice(0, cut);
    ui.descRest.textContent = cut === -1 ? "" : text.slice(cut);
  }

  function descMessage(text, { button } = {}) {
    ui.descBody.querySelector(".skeleton")?.remove();
    ui.descText.classList.remove("streaming");
    ui.descBody.setAttribute("aria-busy", "false");
    const note = h("p", { class: "note", text });
    ui.descBody.append(note);
    if (button) {
      const btn = h("button", { class: "btn", type: "button", text: button.label });
      btn.addEventListener("click", button.onClick);
      ui.descBody.append(btn);
    }
  }

  function showRelated(session, items, images) {
    const cards = items.map(({ id, reason }) => {
      const cand = session.candidates[id];
      const card = h("button", { class: "card", type: "button" }, h("span", { class: "why", text: reason || cand.heading || "Related block" }), h("span", { class: "snip", text: cand.text }));
      card.addEventListener("click", () => swapTo(cand.el, card));
      return card;
    });
    const thumbs = images.map(({ id, reason }) => {
      const cand = session.imageCandidates[id];
      const card = h("button", { class: "card thumb", type: "button" }, h("img", { src: cand.src, alt: cand.alt }), h("span", { class: "why", text: reason || cand.alt || "Related image" }));
      card.addEventListener("click", () => swapTo(cand.el, card));
      return card;
    });

    ui.imageGroup.hidden = !thumbs.length;
    ui.thumbs.replaceChildren(...thumbs);
    ui.textGroup.hidden = !cards.length && thumbs.length > 0;
    if (cards.length) ui.cards.replaceChildren(...cards);
    else ui.cards.replaceChildren(h("p", { class: "quiet", text: "Nothing else on this page is closely related." }));
    fanIn([...ui.relatedWrap.querySelectorAll("button.card")]);
  }

  function swapTo(el, card) {
    if (!el.isConnected) return;
    const from = card.getBoundingClientRect();
    el.scrollIntoView({ block: "center", behavior: "instant" });
    load(el, from);
  }

  async function request(el) {
    const session = current;
    const block = await extract(el);
    if (current !== session || !ui) return; // closed or swapped while snapshotting

    let port;
    try {
      port = chrome.runtime.connect({ name: "lift-out" });
    } catch {
      ui.cards.replaceChildren();
      ui.imageGroup.hidden = true;
      return descMessage("Lift Out was updated or reloaded. Reload this page to get descriptions again.");
    }
    session.port = port;
    let finished = false;

    port.onMessage.addListener((msg) => {
      if (current !== session || !ui) return;
      switch (msg.type) {
        case "delta":
          ui.descBody.querySelector(".skeleton")?.remove();
          ui.descText.classList.add("streaming");
          session.desc = (session.desc || "") + msg.text;
          renderDesc(session.desc);
          break;
        case "desc-done":
          finished = true;
          ui.descText.classList.remove("streaming");
          ui.descBody.setAttribute("aria-busy", "false");
          if (block.truncated) descMessage("This block is very long, so only its first part was described.");
          if (msg.cutOff) descMessage("The description was cut short.");
          break;
        case "desc-error":
          finished = true;
          descMessage(msg.message);
          break;
        case "no-key":
          finished = true;
          descMessage("Add your Anthropic API key to get descriptions and related items.", {
            button: { label: "Open settings", onClick: () => chrome.runtime.sendMessage({ type: "open-options" }) },
          });
          ui.imageGroup.hidden = true;
          ui.cards.replaceChildren(h("p", { class: "quiet", text: "Related items need an API key." }));
          break;
        case "related":
          showRelated(session, msg.items || [], msg.images || []);
          break;
        case "related-error":
          ui.imageGroup.hidden = true;
          ui.cards.replaceChildren(h("p", { class: "quiet", text: "Could not look for related items." }));
          break;
      }
    });
    port.onDisconnect.addListener(() => {
      if (current !== session || !ui || finished) return;
      descMessage("The connection to the extension was lost. Close this and try again.");
    });

    port.postMessage({
      type: "start",
      block,
      candidates: session.candidates.map((c, id) => ({ id, heading: c.heading, text: c.text })),
      imageCandidates: session.imageCandidates.map((c, id) => ({ id, url: c.src, alt: c.alt, caption: c.caption, heading: c.heading })),
    });
  }

  async function close() {
    if (!ui || closing) return;
    closing = true;
    current?.port?.disconnect();
    const { backdrop, ghost, stage, panel, desc, relatedWrap } = ui;
    const el = current?.el;

    const anims = [
      animOut(desc, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-40px) scale(.96)" }], { duration: 200, easing: "ease-in" }),
      animOut(relatedWrap, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-20px)" }], { duration: 200, easing: "ease-in" }),
      animOut(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 80, easing: "ease-in" }),
      animOut(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 280 }),
    ];
    if (el?.isConnected) {
      const home = el.getBoundingClientRect();
      const here = panel.getBoundingClientRect();
      anims.push(animOut(panel, [{ transform: "none", opacity: 1 }, { transform: flipFrames(home, here), opacity: 0.2 }], { duration: 380, delay: 60, easing: EASE_BACK }));
    } else {
      anims.push(animOut(panel, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }));
    }
    await Promise.allSettled(anims.map((a) => a.finished));

    backdrop.remove();
    ghost.remove();
    stage.remove();
    ui = null;
    current = null;
    closing = false;
    document.body.inert = bodyWasInert;
    if (restoreFocusTo?.isConnected) restoreFocusTo.focus?.({ preventScroll: true });
    restoreFocusTo = null;
  }

  function trapTab(e) {
    const items = [...ui.stage.querySelectorAll('button, a[href], [tabindex="0"]')];
    if (!items.length) return;
    const index = items.indexOf(shadow.activeElement);
    const goingBack = e.shiftKey;
    if (goingBack && index <= 0) {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (!goingBack && (index === -1 || index === items.length - 1)) {
      e.preventDefault();
      items[0].focus();
    }
  }

  // ---------- events ----------

  window.addEventListener(
    "mousemove",
    (e) => {
      if (ui) return;
      if (e.altKey || pickMode) showOutline(blockFrom(e.target));
      else if (hovered) hideOutline();
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    "click",
    (e) => {
      if (ui || !(e.altKey || pickMode) || e.button !== 0) return;
      if (host?.contains(e.target)) return;
      const el = blockFrom(e.target);
      if (!el) return;
      // Alt+click on a link would otherwise download it.
      e.preventDefault();
      e.stopImmediatePropagation();
      open(el);
    },
    true
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (ui) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        } else if (e.key === "Tab") {
          trapTab(e);
        }
        return;
      }
      if (!pickMode) return;
      if (e.key === "Escape") setPick(false);
      else if (e.key === "ArrowDown" || e.key === "j") pickStep(1);
      else if (e.key === "ArrowUp" || e.key === "k") pickStep(-1);
      else if (e.key === "Enter" && hovered) open(hovered);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true
  );

  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && !pickMode && !ui) hideOutline();
  }, true);
  window.addEventListener("blur", () => {
    if (!pickMode) hideOutline();
  });

  const reposition = () => {
    if (ui) placeGhost();
    else if (hovered) showOutline(hovered);
  };
  window.addEventListener("scroll", reposition, { capture: true, passive: true });
  window.addEventListener("resize", reposition, { passive: true });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle-pick" && !ui) setPick(!pickMode);
  });
})();
