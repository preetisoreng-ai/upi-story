/*
  UPI story motion runtime.

  Applies the oil-motion runtime rules (references/runtime.md) to a data story. The skill's
  generated-video pipeline is not used: every change here is container choreography or UI state,
  which the skill hands to plain front-end code. Its controller rules still apply:

  - scrub      (input position → timeline position, reversible, stops where input stops)
                 scroll progress bar · hero exit · trend-line reveal · ratio bars · figure open
  - event      (enters view → plays once)
                 section reveal · stat count-up
  - segment    (state change → plays, retargets from the current frame if interrupted)
                 metric switch line morph · segmented-control pill
  - Input handlers only record input; all DOM writes happen once per rAF, reads before writes.
  - Offscreen scrub targets are skipped (IntersectionObserver); the loop stops when settled.
  - prefers-reduced-motion: final static state, no autoplay, no continuous scrub.
*/
(() => {
  const root = document.documentElement;
  const animate = root.classList.contains("motion");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------------- Section navigation state ---------------- */
  const navLinks = $$('.topbar nav > a[href^="#"]');
  const navTargets = navLinks.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if ("IntersectionObserver" in window && navTargets.length) {
    const navIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          navLinks.forEach((a) =>
            a.hash === `#${e.target.id}`
              ? a.setAttribute("aria-current", "location")
              : a.removeAttribute("aria-current")
          );
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    navTargets.forEach((t) => navIO.observe(t));
  }

  /* ---------------- Segmented control pill ---------------- */
  const seg = $(".segmented");
  let segPill = null;
  function placePill() {
    const active = seg && $("button.active", seg);
    if (!active || !segPill) return;
    segPill.style.setProperty("--x", `${active.offsetLeft}px`);
    segPill.style.setProperty("--w", `${active.offsetWidth}px`);
  }
  if (seg) {
    segPill = document.createElement("span");
    segPill.className = "seg-indicator";
    segPill.setAttribute("aria-hidden", "true");
    seg.prepend(segPill);
    seg.classList.add("has-indicator");
    placePill();
    requestAnimationFrame(() => segPill.classList.add("is-live"));
    seg.addEventListener("click", () => requestAnimationFrame(placePill));
    if ("ResizeObserver" in window) new ResizeObserver(placePill).observe(seg);
  }

  /* ---------------- Count-up (event: first time a stat is visible) ---------------- */
  let dataReady = false;
  const pendingCounts = new Set();
  function parseNumber(text) {
    const m = text.match(/(\d[\d,]*)(\.\d+)?/);
    if (!m) return null;
    return {
      pre: text.slice(0, m.index),
      post: text.slice(m.index + m[0].length),
      value: parseFloat(m[0].replace(/,/g, "")),
      decimals: m[2] ? m[2].length - 1 : 0,
      grouped: m[1].includes(","),
      final: text,
    };
  }
  function countUp(el) {
    const n = parseNumber(el.textContent.trim());
    if (!n || !animate) return;
    const fmt = (v) =>
      n.grouped
        ? v.toLocaleString("en-IN", {
            minimumFractionDigits: n.decimals,
            maximumFractionDigits: n.decimals,
          })
        : v.toFixed(n.decimals);
    // Screen readers get the final figure only, never the in-between frames.
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = n.final;
    el.after(sr);
    el.setAttribute("aria-hidden", "true");
    const duration = 1100,
      t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / duration);
      el.textContent = t < 1 ? `${n.pre}${fmt(n.value * easeOut(t))}${n.post}` : n.final;
      if (t < 1) requestAnimationFrame(step);
      else {
        el.removeAttribute("aria-hidden");
        sr.remove();
      }
    };
    requestAnimationFrame(step);
  }
  function flushCounts() {
    if (!dataReady) return;
    pendingCounts.forEach(countUp);
    pendingCounts.clear();
  }

  /* ---------------- Masked word headlines (reference: words rise out of a mask) ---------------- */
  // Each word sits in an overflow-hidden slot and rises into place. Text stays real text,
  // nested emphasis (e.g. the hero's highlighted figure) keeps its element.
  function splitWords(heading) {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) return walk(child);
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(document.createTextNode(part));
          const slot = document.createElement("span");
          const word = document.createElement("span");
          slot.className = "w";
          word.textContent = part;
          word.style.setProperty("--i", i++);
          slot.append(word);
          frag.append(slot);
        });
        child.replaceWith(frag);
      });
    };
    walk(heading);
  }
  if (animate) $$(".hero h1, .section-copy h2, .method h2").forEach(splitWords);

  /* ---------------- Reveal on scroll (event) ---------------- */
  // [selector, stagger children, attribute]. data-line = hairline draws in instead of a fade.
  const revealGroups = [
    [".stats article", true],
    [".section-copy", false],
    [".chart-card", false],
    [".ratio-card", false],
    [".delta-grid", false, "data-line"],
    [".delta-grid article", true],
    [".editorial-figure", false],
    [".conclusion-grid", false, "data-line"],
    [".conclusion-grid article", true],
    [".checks-scroll", false],
    [".method", false, "data-line"],
    [".method > div:first-child", false],
    [".method-copy", false],
  ];
  const revealEls = [];
  revealGroups.forEach(([sel, stagger, attr = "data-reveal"]) =>
    $$(sel).forEach((el, i) => {
      el.setAttribute(attr, "");
      if (stagger) el.style.setProperty("--d", i);
      revealEls.push(el);
    })
  );

  /* ---------------- Checks list: row in view lights up (reference: timeline list) ---------------- */
  const checkRows = $$(".checks-table tbody tr");
  if (animate && "IntersectionObserver" in window && checkRows.length) {
    const rowIO = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          checkRows.forEach((r) => r.classList.toggle("is-active", r === e.target));
        }),
      { rootMargin: "-42% 0px -52% 0px" }
    );
    checkRows.forEach((r) => rowIO.observe(r));
  }
  const countSelector = ".stats strong, .delta-grid strong";
  function onRevealed(el) {
    el.classList.add("is-in");
    $$(countSelector, el)
      .concat(el.matches(countSelector) ? [el] : [])
      .forEach((c) => pendingCounts.add(c));
    flushCounts();
  }
  if (animate && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          onRevealed(e.target);
        }),
      { threshold: 0, rootMargin: "0px 0px -10% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------------- Depth planes (decorative, aria-hidden) ---------------- */
  // Fewer/smaller layers of movement on narrow screens, per the cinematic-scroll mobile rule.
  const depthScale = () => (innerWidth < 760 ? 0.45 : 1);
  const heroEl = $(".hero");
  let heroCurve = null;
  if (heroEl) {
    const depth = document.createElement("div");
    depth.className = "hero-depth";
    depth.setAttribute("aria-hidden", "true");
    heroCurve = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heroCurve.setAttribute("class", "hero-curve");
    heroCurve.setAttribute("viewBox", "0 0 1000 430");
    heroCurve.setAttribute("preserveAspectRatio", "none");
    depth.append(heroCurve);
    heroEl.prepend(depth);
  }
  // Ghost of the real monthly series behind the hero, copied from the drawn chart.
  function fillHeroCurve() {
    const line = $("#trendChart .trend-line");
    if (!heroCurve || !line || heroCurve.childNodes.length) return;
    const pts = line.getAttribute("points");
    heroCurve.innerHTML = `<polyline points="${pts}"/>`;
  }

  // Chapters whose evidence cards float as a mid plane.
  $$(".story, .comparison .wrap").forEach((host) => host.classList.add("depth-host"));

  /* ---------------- Scrub controller (scroll → timeline) ---------------- */
  const scrubs = [];
  // read(rect, vh) returns the target progress; write(value) applies it. damping 1 = follow exactly.
  function addScrub(el, read, write, damping = 1) {
    if (!el) return;
    const s = { el, read, write, damping, current: null, target: 0, visible: true };
    scrubs.push(s);
    return s;
  }
  const topbar = $(".topbar");
  if (topbar && animate) {
    const bar = document.createElement("span");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    topbar.append(bar);
    addScrub(
      document.body,
      () => clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)),
      (v) => {
        bar.style.transform = `scaleX(${v.toFixed(4)})`;
      }
    );
  }
  if (animate) {
    // Curtain: the dark "driver" panel opens from an inset card to full bleed (reference: panel wipes).
    const panel = $(".comparison");
    addScrub(
      panel,
      (r, vh) => 1 - clamp((vh - r.top) / (vh * 0.75)),
      (v) => panel.style.setProperty("--wipe", v.toFixed(4)),
      0.2
    );

    // Hero: one progress value drives every plane. --s is px scrolled past the hero top;
    // CSS multiplies it per plane (curve .32 · text .12) so planes separate.
    const hero = $(".hero");
    let heroSpan = 1;
    addScrub(
      hero,
      (r) => {
        heroSpan = r.height * 0.85;
        return clamp(-r.top / heroSpan);
      },
      (v) => {
        hero.style.setProperty("--hp", v.toFixed(4));
        hero.style.setProperty("--s", (v * heroSpan * depthScale()).toFixed(1));
      },
      0.22
    );

    // Chapter planes: evidence cards float slightly against their reading column.
    $$(".depth-host").forEach((host) => {
      const cards = $$(".ratio-card, .chart-card", host);
      addScrub(
        host,
        (r, vh) => clamp((r.top + r.height / 2 - vh / 2) / vh, -1.5, 1.5),
        (v) => {
          const k = depthScale();
          cards.forEach((c) => c.style.setProperty("--depth", `${(v * 36 * k).toFixed(1)}px`));
        },
        0.14
      );
    });

    // The line is drawn left→right (Apr 2020 → Oct 2026) while the chart scrolls from
    // the bottom of the viewport to ~40% height; fully drawn before it is centred.
    const chartWrap = $(".chart-wrap");
    addScrub(
      chartWrap,
      (r, vh) => clamp((vh * 0.95 - r.top) / (vh * 0.55)),
      (v) => chartWrap.style.setProperty("--reveal", v.toFixed(4)),
      0.16
    );

    const ratio = $(".ratio-card");
    const bars = ratio ? $$(".ratio-row i", ratio) : [];
    addScrub(
      ratio,
      (r, vh) => clamp((vh * 0.9 - r.top) / (vh * 0.5)),
      (v) =>
        bars.forEach((b, i) => {
          const local = clamp((v - i * 0.14) / (1 - (bars.length - 1) * 0.14));
          b.style.setProperty("--grow", easeInOut(local).toFixed(4));
        }),
      0.18
    );

    $$(".editorial-figure").forEach((fig) =>
      addScrub(
        fig,
        (r, vh) => clamp((vh - r.top) / (vh * 0.6)),
        (v) => fig.style.setProperty("--open", easeOut(v).toFixed(4)),
        0.2
      )
    );
  } else {
    const chartWrap = $(".chart-wrap");
    if (chartWrap) chartWrap.style.setProperty("--reveal", 1);
  }

  if ("IntersectionObserver" in window) {
    const visIO = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          const s = scrubs.find((x) => x.el === e.target);
          if (s) s.visible = e.isIntersecting;
          if (e.isIntersecting) schedule();
        }),
      { rootMargin: "25% 0px 25% 0px" }
    );
    scrubs.forEach((s) => {
      if (s.el !== document.body) visIO.observe(s.el);
    });
  }

  let frame = 0;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick() {
    frame = 0;
    const vh = innerHeight;
    // Reads first…
    scrubs.forEach((s) => {
      if (s.visible || s.current === null) s.target = s.read(s.el.getBoundingClientRect(), vh);
    });
    // …then writes, once per element, only when the value changes.
    let moving = false;
    scrubs.forEach((s) => {
      const prev = s.current;
      let next = prev === null ? s.target : prev + (s.target - prev) * s.damping;
      if (Math.abs(s.target - next) < 0.0015) next = s.target;
      else moving = true;
      if (next !== prev) {
        s.current = next;
        s.write(next);
      }
    });
    if (moving) schedule();
  }
  if (scrubs.length) {
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    schedule();
  }

  /* ---------------- Metric switch morph (segment-play, retargetable) ---------------- */
  let morph = null; // { ys: current y values, raf }
  const parsePoints = (str) =>
    str
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number));
  function morphChart(prevPoints) {
    const wrap = $(".chart-wrap");
    const line = $("#trendChart .trend-line");
    const area = $("#trendChart .trend-area");
    if (!line || !area) return;
    const target = parsePoints(line.getAttribute("points"));
    // Interrupted mid-morph → start from the frame on screen, not from the old end state.
    const fromYs = morph ? morph.ys : prevPoints ? parsePoints(prevPoints).map((p) => p[1]) : null;
    if (morph) cancelAnimationFrame(morph.raf);
    if (!animate || !fromYs || fromYs.length !== target.length) {
      morph = null;
      return;
    }
    const base = area.getAttribute("d").match(/^M[\d.]+,([\d.]+)/)[1];
    const xs = target.map((p) => p[0]),
      toYs = target.map((p) => p[1]);
    const render = (ys) => {
      const pts = xs.map((x, i) => `${x},${ys[i].toFixed(2)}`);
      line.setAttribute("points", pts.join(" "));
      area.setAttribute("d", `M${xs[0]},${base} L${pts.join(",")} L${xs.at(-1)},${base} Z`);
    };
    wrap.classList.remove("is-morphing");
    void wrap.offsetWidth;
    wrap.classList.add("is-morphing");
    const duration = 680,
      t0 = performance.now();
    morph = { ys: fromYs.slice(), raf: 0 };
    render(fromYs);
    const step = (now) => {
      const t = clamp((now - t0) / duration),
        k = easeInOut(t);
      morph.ys = fromYs.map((y, i) => y + (toYs[i] - y) * k);
      render(morph.ys);
      if (t < 1) morph.raf = requestAnimationFrame(step);
      else {
        line.setAttribute("points", target.map((p) => p.join(",")).join(" "));
        morph = null;
        wrap.classList.remove("is-morphing");
      }
    };
    morph.raf = requestAnimationFrame(step);
  }

  /* ---------------- Public hooks for app.js ---------------- */
  function ready() {
    fillHeroCurve();
    dataReady = true;
    flushCounts();
    placePill();
  }
  setTimeout(ready, 2500); // never let a slow or failed CSV block the stats
  window.upiMotion = { ready, morphChart };
})();
