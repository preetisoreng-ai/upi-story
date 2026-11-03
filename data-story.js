/*
  UPI data story — step playback (oil-motion "segment-play", one gesture = one step).
  The text column snaps one insight per swipe. When an insight becomes active, the previous
  visual dissolves out, the new one dissolves in and its animation plays on its own, over time,
  to the final number — scrolling down or back up. A newer step cancels the running animation
  (latest target wins). Reduced motion: final states, no dissolve.
*/
(() => {
  "use strict";
  const SVG = "http://www.w3.org/2000/svg";
  const motion = document.documentElement.classList.contains("motion");
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (p, a, b) => clamp((p - a) / (b - a)); // progress of p within [a, b]
  const lerp = (a, b, t) => a + (b - a) * t;
  const inr = (v, d = 0) =>
    v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const MINUS = "−";
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.append(n);
    return n;
  }

  /* ---------------- Data (same CSV as the dashboard, loaded as a script) ---------------- */
  const csv = window.UPI_MONTHLY_CSV;
  if (!csv) return; // the text column stays fully readable
  const lines = csv.trim().split(/\r?\n/);
  const head = lines.shift().split(",");
  const rows = lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [head[i], i === 0 ? v : v === "" ? null : +v]))
  );
  const first = rows[0],
    last = rows.at(-1);
  const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
  const totalVol = sum(rows, "volume_million");
  const octs = rows.filter((r) => r.month.endsWith("-10"));
  const facts = {
    growth: last.volume_million / first.volume_million,
    banksShare: Math.round(((last.banks_live - first.banks_live) / last.banks_live) * 100),
    shareFirst: (sum(rows.slice(0, 12), "volume_million") / totalVol) * 100,
    shareLast: (sum(rows.slice(-12), "volume_million") / totalVol) * 100,
    dailyNow: last.avg_daily_volume_million,
    avgChange:
      (octs.at(-1).avg_transaction_value_inr / octs[0].avg_transaction_value_inr - 1) * 100,
  };
  const bind = {
    months: rows.length,
    totalBn: inr(totalVol / 1000, 1),
    banksNow: inr(last.banks_live),
    banksStart: inr(first.banks_live),
    dailyStart: inr(first.avg_daily_volume_million),
  };
  $$("[data-bind]").forEach((s) => {
    if (bind[s.dataset.bind] != null) s.textContent = bind[s.dataset.bind];
  });
  const setNum = (node, v, d = 0) => {
    const t = inr(Math.abs(v), d);
    node.textContent = v < 0 ? `${MINUS}${t}` : t;
  };

  /* ---------------- Colour: lavender → lime blend ---------------- */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const LAV = hex("#8c7cff"),
    LIME = hex("#c6e48b");
  const mix = (t) => `rgb(${LAV.map((c, i) => Math.round(lerp(c, LIME[i], t))).join(",")})`;

  /* ---------------- Radial "countdown": one spoke per month ---------------- */
  function radial(svg, values) {
    const n = values.length,
      max = Math.max(...values);
    const r0 = 58,
      R = 290,
      step = (Math.PI * 2) / n,
      gap = step * 0.14;
    el("circle", { r: R, fill: "none", stroke: "#1d1d1d", "stroke-width": 1 }, svg);
    el("circle", { r: r0 - 8, fill: "none", stroke: "#1d1d1d", "stroke-width": 1 }, svg);
    const g = el("g", {}, svg);
    const pol = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    const spokes = values.map((v, i) => ({
      len: (R - r0) * Math.sqrt(v / max),
      a0: -Math.PI / 2 + i * step + gap / 2,
      a1: -Math.PI / 2 + (i + 1) * step - gap / 2,
      path: el("path", { fill: mix(i / (n - 1)) }, g),
      last: -1,
    }));
    return (f, spin = 0) => {
      g.setAttribute("transform", `rotate(${spin.toFixed(2)})`);
      const reach = f * (n + 6); // a soft wave: each spoke grows over ~6 neighbours
      spokes.forEach((s, i) => {
        const t = easeOut(clamp((reach - i) / 6));
        if (Math.abs(t - s.last) < 0.002) return;
        s.last = t;
        const r = r0 + s.len * t;
        s.path.setAttribute(
          "d",
          t <= 0
            ? ""
            : `M${pol(r0, s.a0)} L${pol(r, s.a0)} A${r},${r} 0 0 1 ${pol(r, s.a1)} L${pol(r0, s.a1)} A${r0},${r0} 0 0 0 ${pol(r0, s.a0)} Z`
        );
      });
    };
  }

  /* ---------------- Mini line chart that draws point by point ---------------- */
  function miniLine(svg, pts) {
    const W = 320,
      H = 150,
      m = { l: 14, r: 14, t: 30, b: 24 };
    const vals = pts.map((p) => p.v),
      lo = Math.min(...vals),
      hi = Math.max(...vals);
    const x = (i) => m.l + (i * (W - m.l - m.r)) / (pts.length - 1);
    const y = (v) => m.t + ((hi - v) / (hi - lo || 1)) * (H - m.t - m.b);
    const P = pts.map((p, i) => [x(i), y(p.v)]);
    const path = el("path", { class: "ln" }, svg);
    const marks = pts.map((p, i) => {
      const gg = el("g", { opacity: 0 }, svg);
      el("circle", { class: "pt", cx: P[i][0], cy: P[i][1], r: 4.5 }, gg);
      el("text", { class: "val", x: P[i][0], y: P[i][1] - 10 }, gg).textContent = p.t;
      el("text", { class: "yr", x: P[i][0], y: H - 4 }, gg).textContent = p.x;
      return gg;
    });
    return (f) => {
      const reach = f * (pts.length - 1);
      const k = Math.floor(reach),
        frac = reach - k;
      const drawn = P.slice(0, k + 1);
      if (k < P.length - 1 && frac > 0)
        drawn.push([lerp(P[k][0], P[k + 1][0], frac), lerp(P[k][1], P[k + 1][1], frac)]);
      path.setAttribute("d", f <= 0 ? "" : `M${drawn.map((q) => q.join(",")).join(" L")}`);
      marks.forEach((gg, i) =>
        gg.setAttribute("opacity", f <= 0 ? 0 : clamp((reach - i) * 3 + 1).toFixed(2))
      );
    };
  }

  /* ---------------- Unit dot grid: scattered dots settle into a 10×10 grid ---------------- */
  function dotGrid(svg, lavCount) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cell = 60,
      R = 25;
    const dots = Array.from({ length: 100 }, (_, i) => {
      const lav = i < lavCount;
      const sx = 20 + rnd() * 560,
        sy = lav ? 20 + rnd() * 380 : 420 + rnd() * 160;
      return {
        gx: (i % 10) * cell + cell / 2,
        gy: Math.floor(i / 10) * cell + cell / 2,
        sx,
        sy,
        size: 0.25 + rnd() * 0.75,
        t: 0.02 + rnd() * 0.38,
        c: el("circle", { r: 0, cx: sx, cy: sy, fill: lav ? "var(--lav)" : "var(--lime)" }, svg),
      };
    });
    return (p) => {
      const settle = easeInOut(seg(p, 0.5, 0.86));
      dots.forEach((d) => {
        const a = easeOut(seg(p, d.t, d.t + 0.12));
        d.c.setAttribute("r", (R * lerp(d.size, 1, settle) * a).toFixed(2));
        d.c.setAttribute("cx", lerp(d.sx, d.gx, settle).toFixed(1));
        d.c.setAttribute("cy", lerp(d.sy, d.gy, settle).toFixed(1));
      });
    };
  }

  /* ---------------- Proportional circles inside the white disc ---------------- */
  function circles(svg, shareA, shareB) {
    const C = 300,
      R = 250;
    const disc = el("circle", { cx: C, cy: C, r: 0, fill: "#fff" }, svg);
    const ra = R * Math.sqrt(shareA / 100),
      rb = R * Math.sqrt(shareB / 100);
    const a = el("circle", { cx: C, cy: C, r: 0, fill: "var(--lime)" }, svg);
    const b = el("circle", { cx: C, cy: C, r: 0, fill: "var(--lav)" }, svg);
    const ax = C - rb - 6,
      bx = ax + ra + rb + 6; // lime and lavender touching, pair centred
    return (p) => {
      disc.setAttribute("r", (R * easeOut(seg(p, 0, 0.16))).toFixed(1));
      a.setAttribute("r", (ra * easeOut(seg(p, 0.12, 0.28))).toFixed(1));
      const t = easeInOut(seg(p, 0.52, 0.8));
      b.setAttribute("r", (rb * t).toFixed(1));
      a.setAttribute("cx", lerp(C, ax, t).toFixed(1));
      b.setAttribute("cx", lerp(C + rb, bx, t).toFixed(1));
    };
  }

  /* ---------------- Word-by-word statement reveal ---------------- */
  function splitWords(node) {
    const words = [];
    const walk = (n) => {
      [...n.childNodes].forEach((c) => {
        if (c.nodeType === 1) {
          if (!c.classList.contains("sr-only")) walk(c);
          return;
        }
        if (c.nodeType !== 3 || !c.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const s = document.createElement("span");
          s.className = "sw";
          s.textContent = part;
          words.push(s);
          frag.append(s);
        });
        c.replaceWith(frag);
      });
    };
    walk(node);
    return words;
  }

  /* ---------------- Insights: each is a render(t) over its own duration ---------------- */
  const heroDraw = radial(
    $("#radial"),
    rows.map((r) => r.volume_million)
  );
  const growthLine = miniLine(
    $("#growthLine"),
    [first, ...octs].map((r, i) => ({
      v: r.volume_million,
      t: inr(r.volume_million / 1000, 1),
      x: i === 0 ? "APR 20" : `OCT ${r.month.slice(2, 4)}`,
    }))
  );
  const growthPanel = $("#growthPanel"),
    growthNum = $("#growthNum");
  const dotsDraw = dotGrid($("#dots"), facts.banksShare);
  const banksNum = $("#banksNum"),
    banksWords = splitWords($("#t-banks"));
  const circlesDraw = circles($("#circles"), facts.shareFirst, facts.shareLast);
  const shareSwap = $("#shareSwap"),
    shareFirst = $("#shareFirst"),
    shareLast = $("#shareLast");
  const avgLine = miniLine(
    $("#avgLine"),
    octs.map((r) => ({
      v: r.avg_transaction_value_inr,
      t: `₹${inr(r.avg_transaction_value_inr)}`,
      x: r.month.slice(0, 4),
    }))
  );
  const avgPanel = $("#avgPanel"),
    avgNum = $("#avgNum");
  const dailyDraw = radial(
    $("#radialDaily"),
    rows.map((r) => r.avg_daily_volume_million)
  );
  const dailyNum = $("#dailyNum");

  const panel = (node, numNode, target, t, from = 0, d = 0) => {
    node.style.setProperty("--reveal", easeOut(seg(t, 0, 0.3)).toFixed(3));
    node.style.setProperty("--glow", easeOut(seg(t, 0.25, 0.85)).toFixed(3));
    setNum(numNode, lerp(from, target, easeOut(seg(t, 0.15, 0.9))), d);
  };
  const insights = [
    { ms: 2200, render: (t) => heroDraw(t, 18 * easeOut(t)) },
    {
      ms: 2200,
      render: (t) => {
        growthLine(easeInOut(seg(t, 0.05, 0.8)));
        panel(growthPanel, growthNum, facts.growth, t, 1, 1);
      },
    },
    {
      ms: 2600,
      render: (t) => {
        dotsDraw(t);
        setNum(banksNum, facts.banksShare * easeOut(seg(t, 0.04, 0.88)));
        const lit = seg(t, 0, 0.6) * banksWords.length;
        banksWords.forEach((w, i) => w.classList.toggle("dim", i >= lit));
      },
    },
    {
      ms: 3200,
      render: (t) => {
        circlesDraw(t);
        shareSwap.classList.toggle("is-b", t >= 0.5);
        setNum(shareFirst, facts.shareFirst * easeOut(seg(t, 0.12, 0.32)), 1);
        setNum(shareLast, facts.shareLast * easeOut(seg(t, 0.52, 0.82)));
      },
    },
    {
      ms: 2200,
      render: (t) => {
        avgLine(easeInOut(seg(t, 0.05, 0.8)));
        panel(avgPanel, avgNum, facts.avgChange, t);
      },
    },
    {
      ms: 2200,
      render: (t) => {
        const f = easeOut(t);
        dailyDraw(f, -14 * f);
        setNum(dailyNum, facts.dailyNow * f);
      },
    },
  ];

  /* ---------------- Step controller ---------------- */
  const steps = $$(".step"),
    items = $$(".viz-item");
  const bar = $("#progress");
  let active = -1,
    raf = 0;
  const resetTimers = new Map();
  insights.forEach((ins) => ins.render(motion ? 0 : 1));

  function play(i) {
    cancelAnimationFrame(raf); // latest target wins
    const ins = insights[i];
    if (!motion) return ins.render(1);
    ins.render(0);
    const t0 = performance.now() + 120; // let the dissolve begin first
    const frame = (now) => {
      const t = clamp((now - t0) / ins.ms);
      ins.render(t);
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function activate(i) {
    if (i === active || i < 0 || i >= insights.length) return;
    const prev = active,
      down = i > prev;
    active = i;
    steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    items.forEach((it, k) => {
      it.classList.remove("leave-up", "leave-down");
      it.classList.toggle("is-active", k === i);
    });
    clearTimeout(resetTimers.get(i));
    if (prev >= 0) {
      const out = items[prev];
      out.classList.add(down ? "leave-up" : "leave-down");
      // Once it has dissolved away, rewind it so it can play again on return.
      clearTimeout(resetTimers.get(prev));
      resetTimers.set(
        prev,
        setTimeout(() => {
          out.classList.remove("leave-up", "leave-down");
          if (active !== prev && motion) insights[prev].render(0);
        }, 950)
      );
    }
    if (bar) bar.style.transform = `scaleX(${((i + 1) / insights.length).toFixed(4)})`;
    play(i);
  }

  /* ---------------- Step gestures: one wheel flick / swipe / key press = one insight ----------------
     Based on oil-motion's step-gesture adapter: a burst of wheel events (trackpad inertia included)
     is coalesced into a single direction; while the glide runs, further input is absorbed, so a
     gesture can never skip an insight. Scrollbar dragging still works and still activates steps. */
  const BAR = 72;
  const targets = () => steps.map((st) => st.getBoundingClientRect().top + scrollY - BAR);
  const footerTop = () => document.documentElement.scrollHeight - innerHeight;
  function currentIndex() {
    const t = targets(), y = scrollY;
    if (y > t.at(-1) + 4) return steps.length; // footer
    let best = 0;
    t.forEach((v, k) => { if (Math.abs(v - y) < Math.abs(t[best] - y)) best = k; });
    return best;
  }
  let locked = false, accum = 0, lastInput = 0, lastScroll = 0;
  addEventListener("scroll", () => (lastScroll = performance.now()), { passive: true });
  function go(dir) {
    const from = currentIndex();
    const to = clamp(from + dir, 0, steps.length); // index steps.length = footer
    if (to === from) return;
    const top = to === steps.length ? footerTop() : targets()[to];
    locked = true;
    lastScroll = performance.now();
    scrollTo({ top, behavior: motion ? "smooth" : "auto" });
    const release = () => {
      const now = performance.now();
      // free again once the glide has stopped and the input burst (inertia) has gone quiet
      if (now - lastScroll > 140 && now - lastInput > 260) locked = false;
      else setTimeout(release, 80);
    };
    setTimeout(release, 200);
  }
  addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.target.closest(".version-menu")) return; // pinch-zoom, open dropdown
      e.preventDefault();
      lastInput = performance.now();
      if (locked) return;
      accum += e.deltaY;
      if (Math.abs(accum) < 24) return;
      const dir = Math.sign(accum);
      accum = 0;
      go(dir);
    },
    { passive: false }
  );
  let touchY = null;
  addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchmove", (e) => { if (touchY != null && !e.target.closest(".version-menu")) e.preventDefault(); }, { passive: false });
  addEventListener("touchend", (e) => {
    if (touchY == null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    lastInput = performance.now();
    if (!locked && Math.abs(dy) > 40) go(Math.sign(dy));
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, summary, [contenteditable]") || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    const dir = k === "ArrowDown" || k === "PageDown" || (k === " " && !e.shiftKey) ? 1 : k === "ArrowUp" || k === "PageUp" || (k === " " && e.shiftKey) ? -1 : 0;
    if (k === "Home" || k === "End") {
      e.preventDefault();
      scrollTo({ top: k === "Home" ? 0 : footerTop(), behavior: motion ? "smooth" : "auto" });
      return;
    }
    if (!dir) return;
    e.preventDefault();
    if (!locked) go(dir);
  });

  // The step whose copy crosses the reading line becomes active.
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) activate(steps.indexOf(e.target));
      }),
    { rootMargin: matchMedia("(max-width: 760px)").matches ? "-62% 0px -30% 0px" : "-45% 0px -45% 0px" } // on phones the text sits below the fixed visual
  );
  steps.forEach((s) => io.observe(s));
  if (active < 0) activate(0);
})();
