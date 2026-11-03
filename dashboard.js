/*
  UPI dashboard — vanilla JS, no build step. Reads data/processed/upi_monthly_enriched.csv.

  Dataviz rules applied: one y-axis per chart (value vs count is compared by indexing to a
  common base), validated series colours from CSS tokens, 2px lines, ≥8px end markers,
  bars ≤24px with 4px rounded data-ends and a 2px gap, a validated single-hue heatmap ramp,
  selective direct labels, one tooltip listing every series, keyboard access on every chart,
  one filter row scoping every KPI/chart/table, refresh that keeps the frame, and a table view.
*/
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const CSV_URL = "data/processed/upi_monthly_enriched.csv";
  // Same data as a script (written by analysis/enrich_upi_monthly.mjs). Browsers block fetch() of
  // local files when the page is opened from disk (file://), but still run <script src>.
  const CSV_SCRIPT_URL = "data/processed/upi_monthly_enriched.js";

  async function readCsv(fresh) {
    if (location.protocol !== "file:") {
      try {
        const r = await fetch(CSV_URL, { cache: fresh ? "reload" : "default" });
        if (r.ok) return await r.text();
      } catch (e) {
        /* fall through to the script copy */
      }
    }
    return new Promise((resolve, reject) => {
      delete window.UPI_MONTHLY_CSV;
      const tag = document.createElement("script");
      tag.src = `${CSV_SCRIPT_URL}?t=${Date.now()}`; // cache-buster so Refresh re-reads the file
      tag.onload = () => {
        tag.remove();
        window.UPI_MONTHLY_CSV ? resolve(window.UPI_MONTHLY_CSV) : reject(new Error("data script empty"));
      };
      tag.onerror = () => {
        tag.remove();
        reject(new Error("data script missing"));
      };
      document.head.append(tag);
    });
  }

  /* ---------------- Formatting ---------------- */
  const MINUS = "−";
  const toDate = (m) => new Date(`${m}-01T00:00:00`);
  const monthLabel = (m) =>
    toDate(m).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const monthShort = (m) =>
    toDate(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  const monthName = (m) => toDate(m).toLocaleDateString("en-IN", { month: "short" });
  const inr = (v, d = 0) =>
    v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (v, d = 1, unit = "%") => `${v >= 0 ? "+" : MINUS}${inr(Math.abs(v), d)}${unit}`;
  const fmt = {
    bn: (mn) => `${inr(mn / 1000, 1)}bn`,
    lakhCr: (cr) => `₹${inr(cr / 1e5, 1)} lakh cr`,
    rupee: (v) => `₹${inr(v)}`,
    index: (v) => inr(v),
    pct: (v) => signed(v),
    count: (v) => inr(v),
    delta: (v) => `${v >= 0 ? "+" : MINUS}${inr(Math.abs(v))}`,
    mn: (v) => `${inr(v, v < 100 ? 1 : 0)}mn`,
  };
  const UNIT = { month: "month", quarter: "quarter", fy: "financial year" };

  /* ---------------- Periods: month / quarter / financial year (April–March) ---------------- */
  const fyStartOf = (m) => {
    const y = +m.slice(0, 4),
      mo = +m.slice(5, 7);
    return mo >= 4 ? y : y - 1;
  };
  const fyShort = (y) => `FY${String(y + 1).slice(2)}`;
  const fyLong = (y) => `FY ${y}–${String(y + 1).slice(2)}`;
  const quarterOf = (m) => Math.floor(((+m.slice(5, 7) - 4 + 12) % 12) / 3) + 1;

  function aggregate(rows, gran) {
    const groups = [];
    const keyOf = (m) =>
      gran === "month"
        ? m
        : gran === "quarter"
          ? `${fyStartOf(m)}-Q${quarterOf(m)}`
          : `${fyStartOf(m)}`;
    rows.forEach((r, i) => {
      const k = keyOf(r.month);
      const g = groups.at(-1);
      if (g && g.key === k) g.end = i;
      else groups.push({ key: k, start: i, end: i });
    });
    const expected = { month: 1, quarter: 3, fy: 12 }[gran];
    const lag = { month: 12, quarter: 4, fy: 1 }[gran];
    const periods = groups.map((g) => {
      const slice = rows.slice(g.start, g.end + 1);
      const first = slice[0].month,
        last = slice.at(-1).month;
      const fy = fyStartOf(first);
      const sum = (k) => slice.reduce((a, r) => a + r[k], 0);
      const volume = sum("volume_million"),
        value = sum("value_crore"),
        days = sum("calendar_days");
      const banks = slice.at(-1).banks_live;
      const prevBanks = g.start > 0 ? rows[g.start - 1].banks_live : null;
      let label, short;
      if (gran === "month") {
        label = monthLabel(first);
        short = monthShort(first);
      } else if (gran === "quarter") {
        const q = quarterOf(first);
        short = `Q${q} ${fyShort(fy)}`;
        label = `Q${q} ${fyLong(fy)} (${first === last ? monthLabel(first) : `${monthName(first)}–${monthLabel(last)}`})`;
      } else {
        short = fyShort(fy);
        label = `${fyLong(fy)} (${monthLabel(first)} – ${monthLabel(last)})`;
      }
      return {
        key: g.key,
        start: g.start,
        end: g.end,
        first,
        last,
        label,
        short,
        months: slice.length,
        complete: slice.length === expected,
        volume,
        value,
        days,
        banks,
        avg: (value * 10) / volume, // ₹ crore × 1e7 ÷ (million × 1e6)
        perDay: volume / days,
        perBank: volume / banks,
        added: prevBanks == null ? null : banks - prevBanks,
      };
    });
    periods.forEach((p, i) => {
      const prev = periods[i - lag];
      const ok = prev && prev.complete && p.complete;
      p.volumeYoy = ok ? (p.volume / prev.volume - 1) * 100 : null;
      p.valueYoy = ok ? (p.value / prev.value - 1) * 100 : null;
    });
    return periods;
  }

  /* ---------------- Elements & state ---------------- */
  const tooltip = $("#tooltip");
  tooltip.setAttribute("aria-hidden", "true"); // visual only; keyboard readouts go to srLive
  const srLive = document.createElement("div");
  srLive.className = "sr-only";
  srLive.setAttribute("aria-live", "polite");
  document.body.append(srLive);

  let rows = [];
  const state = { from: 0, to: 0, gran: "month", compare: "start" };
  let periods = []; // complete periods fully inside the current range
  const monthsInRange = () => rows.slice(state.from, state.to + 1);

  /* ---------------- Theme toggle ---------------- */
  const themeBtn = $("#themeToggle");
  function syncThemeButton() {
    const dark = document.documentElement.classList.contains("dark");
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("upi-dashboard-theme", dark ? "dark" : "light");
    } catch (e) {
      /* storage unavailable */
    }
    syncThemeButton();
  });
  syncThemeButton();

  /* ---------------- Tabs (roving tabindex, arrow keys) ---------------- */
  const tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    renderVisible();
    try {
      history.replaceState(null, "", `#${tab.id.replace("tab-", "")}`);
    } catch (e) {
      /* file:// */
    }
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      const next = {
        ArrowRight: tabs[(i + 1) % tabs.length],
        ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs.at(-1),
      }[e.key];
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });

  /* ---------------- Tooltip ---------------- */
  $$(".info").forEach((el) => {
    const show = () => showTooltip([{ title: el.dataset.tip }], el.getBoundingClientRect());
    el.addEventListener("pointerenter", show);
    el.addEventListener("focus", show);
    el.addEventListener("pointerleave", hideTooltip);
    el.addEventListener("blur", hideTooltip);
    el.setAttribute("aria-description", el.dataset.tip);
  });
  function showTooltip(content, anchor) {
    tooltip.replaceChildren();
    content.forEach((item) => {
      if (item.title) {
        const t = document.createElement("div");
        t.className = "tooltip-title";
        t.textContent = item.title;
        tooltip.append(t);
      }
      if (item.value != null) {
        const row = document.createElement("div");
        row.className = "tooltip-row";
        const key = document.createElement("span");
        key.className = item.swatch ? "tooltip-swatch" : "tooltip-key";
        key.style.background = item.color;
        const val = document.createElement("strong");
        val.textContent = item.value;
        const lab = document.createElement("span");
        lab.textContent = item.label || "";
        row.append(key, val, lab);
        tooltip.append(row);
      }
    });
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth,
      th = tooltip.offsetHeight;
    let x = anchor.left + anchor.width / 2 - tw / 2;
    let y = anchor.top - th - 10;
    if (y < 64) y = anchor.bottom + 10;
    x = Math.max(8, Math.min(innerWidth - tw - 8, x));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    tooltip.hidden = true;
  }

  /* ---------------- SVG helpers ---------------- */
  function svgEl(tag, attrs = {}, parent) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  }
  function niceTicks(min, max, count = 4) {
    if (min === max) max = min + 1;
    const span = max - min;
    const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const ticks = [];
    for (
      let v = Math.floor(min / step) * step;
      v <= Math.ceil(max / step) * step + step / 2;
      v += step
    )
      ticks.push(+v.toFixed(10));
    return ticks;
  }
  // X ticks: years on long monthly series, otherwise ~7 evenly spaced period labels.
  function xTicks(points, gran = state.gran) {
    const n = points.length;
    if (gran === "month" && n > 30)
      return points
        .map((p, i) => (p.first.endsWith("-01") ? [i, p.first.slice(0, 4)] : null))
        .filter(Boolean);
    const k = Math.max(1, Math.ceil(n / 7));
    return points.map((p, i) => (i % k === 0 ? [i, p.short] : null)).filter(Boolean);
  }
  function emptyState(el, msg) {
    const p = document.createElement("p");
    p.className = "chart-empty nuclios-type-body-small-regular muted";
    p.textContent = msg;
    el.replaceChildren(p);
    clearers.delete(el);
  }
  const noPeriodsMsg = () =>
    `No complete ${UNIT[state.gran]} falls inside the selected period. Widen the period or view by month.`;

  const clearers = new Map(); // one hover-clear per chart; scrolling drops stale hover states
  addEventListener("scroll", () => clearers.forEach((c) => c()), { passive: true });
  const drawn = new WeakSet(); // first render animates; later renders keep the frame

  // Shared keyboard reading for any chart with an index-based "active" position.
  function keyNav(svg, n, show, clear) {
    let active = -1;
    svg.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) {
        e.preventDefault();
        active = active < 0 ? (step > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, active + step));
        show(active, true);
      }
      if (e.key === "Home") {
        e.preventDefault();
        show((active = 0), true);
      }
      if (e.key === "End") {
        e.preventDefault();
        show((active = n - 1), true);
      }
      if (e.key === "Escape") clear();
    });
    svg.addEventListener("blur", clear);
    return (i) => (active = i);
  }
  const readout = (point, series, i, yFmt) =>
    `${point.label}: ${series.map((s) => `${s.label} ${s.values[i] == null ? "no data" : yFmt(s.values[i])}`).join(", ")}`;

  /* ---------------- Line chart ---------------- */
  function lineChart(
    el,
    { points, series, yFmt, axisFmt = yFmt, zero = true, area = false, ref = null, label }
  ) {
    if (!points.length) return emptyState(el, noPeriodsMsg());
    const all = series.flatMap((s) => s.values.filter((v) => v != null));
    if (!all.length) return emptyState(el, "No values in the selected period.");
    const W = Math.max(280, el.clientWidth);
    const H = +el.dataset.height || 260;
    const n = points.length;
    let lo = Math.min(...all),
      hi = Math.max(...all);
    if (ref) {
      lo = Math.min(lo, ref.value);
      hi = Math.max(hi, ref.value);
    }
    if (zero) lo = Math.min(0, lo);
    else {
      const pad = (hi - lo) * 0.08 || 1;
      lo -= pad;
      hi += pad;
    }
    const ticks = niceTicks(lo, hi, H < 260 ? 4 : 5);
    const y0 = ticks[0],
      y1 = ticks.at(-1);
    const tickText = (t) => (t === 0 ? "0" : axisFmt(t));
    const labelW = Math.max(...ticks.map((t) => tickText(t).length)) * 7 + 10;
    const endW =
      Math.max(
        ...series.map((s) => {
          const v = s.values.filter((x) => x != null).at(-1);
          return v == null ? 0 : yFmt(v).length;
        })
      ) *
        7 +
      18;
    const m = { l: labelW, r: Math.max(48, endW), t: 10, b: 28 };
    const pw = W - m.l - m.r,
      ph = H - m.t - m.b;
    const x = (i) => m.l + (n > 1 ? (i * pw) / (n - 1) : pw / 2);
    const y = (v) => m.t + ((y1 - v) / (y1 - y0)) * ph;

    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      tabindex: "0",
      "aria-label": `${label}. Use left and right arrow keys to read each period.`,
    });
    ticks.forEach((t) => {
      svgEl(
        "line",
        { class: t === 0 ? "baseline" : "grid-line", x1: m.l, x2: W - m.r + 8, y1: y(t), y2: y(t) },
        svg
      );
      svgEl(
        "text",
        { class: "axis-text", x: m.l - 8, y: y(t) + 4, "text-anchor": "end" },
        svg
      ).textContent = tickText(t);
    });
    xTicks(points).forEach(([i, t]) => {
      const anchor = n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      svgEl(
        "text",
        { class: "axis-text", x: x(i), y: H - 8, "text-anchor": anchor },
        svg
      ).textContent = t;
    });
    if (ref) {
      svgEl(
        "line",
        { class: "ref-line", x1: m.l, x2: W - m.r + 8, y1: y(ref.value), y2: y(ref.value) },
        svg
      );
      svgEl(
        "text",
        { class: "ref-label", x: W - m.r + 8, y: y(ref.value) - 6, "text-anchor": "end" },
        svg
      ).textContent = ref.label;
    }

    const ends = [];
    series.forEach((s) => {
      const segs = [];
      let cur = [];
      s.values.forEach((v, i) => {
        if (v != null) cur.push([x(i), y(v)]);
        else if (cur.length) {
          segs.push(cur);
          cur = [];
        }
      });
      if (cur.length) segs.push(cur);
      segs.forEach((seg) => {
        const base = y(Math.max(0, y0));
        if (area && zero)
          svgEl(
            "path",
            {
              class: "series-area",
              fill: s.color,
              d: `M${seg[0][0]},${base} L${seg.map((p) => p.join(",")).join(" L")} L${seg.at(-1)[0]},${base} Z`,
            },
            svg
          );
        if (seg.length > 1)
          svgEl(
            "path",
            {
              class: "series-line",
              stroke: s.color,
              d: `M${seg.map((p) => p.join(",")).join(" L")}`,
            },
            svg
          );
      });
      const lastI = s.values
        .map((v, i) => (v == null ? -1 : i))
        .filter((i) => i >= 0)
        .at(-1);
      if (lastI != null) ends.push({ s, i: lastI, px: x(lastI), py: y(s.values[lastI]) });
    });
    // Direct labels on the last point only; nudge apart when two series end close together.
    ends.sort((a, b) => a.py - b.py);
    for (let k = 1; k < ends.length; k++) {
      const prevY = ends[k - 1].ly || ends[k - 1].py;
      if (ends[k].py - prevY < 16) ends[k].ly = prevY + 16;
    }
    ends.forEach((e) => {
      svgEl("circle", { class: "end-dot", cx: e.px, cy: e.py, r: 4, fill: e.s.color }, svg);
      svgEl("text", { class: "end-label", x: e.px + 8, y: (e.ly || e.py) + 4 }, svg).textContent =
        yFmt(e.s.values[e.i]);
    });

    // Hover layer: crosshair snaps to the nearest period; one tooltip lists every series.
    const hover = svgEl("g", { visibility: "hidden" }, svg);
    const cross = svgEl("line", { class: "crosshair", y1: m.t, y2: m.t + ph }, hover);
    const dots = series.map((s) =>
      svgEl("circle", { class: "hover-dot", r: 4, fill: s.color }, hover)
    );
    const hit = svgEl(
      "rect",
      { class: "plot-hit", x: m.l - 8, y: m.t, width: pw + 16, height: ph },
      svg
    );
    function show(i, fromKeyboard) {
      const cx = x(i);
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      series.forEach((s, k) => {
        const v = s.values[i];
        dots[k].setAttribute("visibility", v == null ? "hidden" : "visible");
        if (v != null) {
          dots[k].setAttribute("cx", cx);
          dots[k].setAttribute("cy", y(v));
        }
      });
      hover.setAttribute("visibility", "visible");
      const r = svg.getBoundingClientRect(),
        sc = r.width / W;
      showTooltip(
        [
          { title: points[i].label },
          ...series.map((s) => ({
            value: s.values[i] == null ? "—" : yFmt(s.values[i]),
            label: s.label,
            color: s.color,
          })),
        ],
        {
          left: r.left + cx * sc - 1,
          width: 2,
          top: r.top + m.t * sc,
          bottom: r.top + (m.t + ph) * sc,
        }
      );
      if (fromKeyboard) srLive.textContent = readout(points[i], series, i, yFmt);
    }
    function clear() {
      hover.setAttribute("visibility", "hidden");
      hideTooltip();
    }
    const setActive = keyNav(svg, n, show, clear);
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1))));
      setActive(i);
      show(i);
    });
    hit.addEventListener("pointerleave", clear);
    clearers.set(el, clear);
    mount(el, svg);
  }

  /* ---------------- Bar chart: single or grouped columns, zero baseline, negatives allowed ---------------- */
  function barChart(
    el,
    { points, series, yFmt, axisFmt = yFmt, label, empty, directLabels = "ends", tickGran }
  ) {
    if (!points.length) return emptyState(el, empty || noPeriodsMsg());
    const W = Math.max(280, el.clientWidth);
    const H = +el.dataset.height || 240;
    const n = points.length,
      k = series.length;
    const all = series.flatMap((s) => s.values.filter((v) => v != null));
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
    const y0 = ticks[0],
      y1 = ticks.at(-1);
    const tickText = (t) => (t === 0 ? "0" : axisFmt(t));
    const labelW = Math.max(...ticks.map((t) => tickText(t).length)) * 7 + 10;
    const m = { l: labelW, r: 8, t: 22, b: 28 };
    const pw = W - m.l - m.r,
      ph = H - m.t - m.b;
    const band = pw / n;
    const gap = 2; // 2px surface gap between adjacent bars
    const bw = Math.max(1, Math.min(24, (band * 0.72 - gap * (k - 1)) / k));
    const groupW = bw * k + gap * (k - 1);
    const y = (v) => m.t + ((y1 - v) / (y1 - y0)) * ph;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      tabindex: "0",
      "aria-label": `${label}. Use left and right arrow keys to read each bar.`,
    });
    ticks.forEach((t) => {
      svgEl(
        "line",
        { class: t === 0 ? "baseline" : "grid-line", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) },
        svg
      );
      svgEl(
        "text",
        { class: "axis-text", x: m.l - 8, y: y(t) + 4, "text-anchor": "end" },
        svg
      ).textContent = tickText(t);
    });
    const groups = points.map((p, i) => {
      const cx = m.l + band * i + band / 2;
      const g = svgEl("g", { class: "bar-group" }, svg);
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null) return;
        const x0 = cx - groupW / 2 + j * (bw + gap);
        const top = y(Math.max(0, v)),
          bot = y(Math.min(0, v));
        const r = Math.min(4, (bot - top) / 2, bw / 2);
        // 4px rounded data-end (top when positive, bottom when negative), square at the baseline
        const d =
          v >= 0
            ? `M${x0},${bot} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bot} Z`
            : `M${x0},${top} V${bot - r} Q${x0},${bot} ${x0 + r},${bot} H${x0 + bw - r} Q${x0 + bw},${bot} ${x0 + bw},${bot - r} V${top} Z`;
        svgEl("path", { class: "bar", style: `--i:${Math.min(i, 30)}`, fill: s.color, d }, g);
        if (directLabels === "ends" && k === 1 && (i === 0 || i === n - 1)) {
          svgEl(
            "text",
            {
              class: "bar-label",
              x: x0 + bw / 2,
              y: v >= 0 ? top - 6 : bot + 14,
              "text-anchor": "middle",
            },
            svg
          ).textContent = yFmt(v);
        }
      });
      return { g, cx };
    });
    xTicks(points, tickGran).forEach(([i, t]) => {
      svgEl(
        "text",
        { class: "axis-text", x: groups[i].cx, y: H - 8, "text-anchor": "middle" },
        svg
      ).textContent = t;
    });
    // The whole band is the hit target, never just the painted pixels.
    const hit = svgEl("rect", { class: "plot-hit", x: m.l, y: m.t, width: pw, height: ph }, svg);
    function show(i, fromKeyboard) {
      svg.classList.add("has-active");
      groups.forEach((gr, j) => gr.g.classList.toggle("is-active", j === i));
      const r = svg.getBoundingClientRect(),
        sc = r.width / W;
      showTooltip(
        [
          { title: points[i].label },
          ...series.map((s) => ({
            value: s.values[i] == null ? "—" : yFmt(s.values[i]),
            label: s.label,
            color: s.color,
            swatch: true,
          })),
        ],
        {
          left: r.left + groups[i].cx * sc - 1,
          width: 2,
          top: r.top + m.t * sc,
          bottom: r.top + (m.t + ph) * sc,
        }
      );
      if (fromKeyboard) srLive.textContent = readout(points[i], series, i, yFmt);
    }
    function clear() {
      svg.classList.remove("has-active");
      groups.forEach((gr) => gr.g.classList.remove("is-active"));
      hideTooltip();
    }
    const setActive = keyNav(svg, n, show, clear);
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / band)));
      setActive(i);
      show(i);
    });
    hit.addEventListener("pointerleave", clear);
    clearers.set(el, clear);
    mount(el, svg);
  }

  /* ---------------- Heatmap: financial year × month, sequential single hue ---------------- */
  const FY_MONTHS = [
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar",
  ];
  function heatmap(el, monthly) {
    if (!monthly.length) return emptyState(el, "No months in the selected period.");
    const vals = monthly.map((r) => r.avg_transaction_value_inr);
    const lo = Math.min(...vals),
      hi = Math.max(...vals);
    const bins = 5;
    const binOf = (v) =>
      hi === lo ? 0 : Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins));
    const edges = Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins);
    // Legend: 5 swatches with their ranges (rect keys mirror the cell marks)
    $("#legend-heat").replaceChildren(
      ...edges.slice(0, -1).map((e, i) => {
        const it = document.createElement("span");
        it.className = "legend-item nuclios-type-body-small-regular";
        const sw = document.createElement("span");
        sw.className = "legend-swatch";
        sw.style.background = `var(--seq-${i + 1})`;
        it.append(sw, document.createTextNode(`₹${inr(e)}–${inr(edges[i + 1])}`));
        return it;
      })
    );

    const fys = [...new Set(monthly.map((r) => fyStartOf(r.month)))];
    const W = Math.max(280, el.clientWidth);
    const labelW = 52,
      top = 22,
      gap = 2;
    const cw = (W - labelW) / 12;
    const ch = Math.max(20, Math.min(34, cw * 0.6));
    const H = top + fys.length * ch + 4;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      tabindex: "0",
      "aria-label":
        "Average payment value by month and financial year. Use arrow keys to move between cells.",
    });
    FY_MONTHS.forEach((mn, c) => {
      svgEl(
        "text",
        { class: "axis-text", x: labelW + c * cw + cw / 2, y: 14, "text-anchor": "middle" },
        svg
      ).textContent = cw < 34 ? mn[0] : mn;
    });
    const cells = [];
    fys.forEach((fy, r) => {
      svgEl(
        "text",
        { class: "axis-text", x: labelW - 8, y: top + r * ch + ch / 2 + 4, "text-anchor": "end" },
        svg
      ).textContent = fyShort(fy);
      FY_MONTHS.forEach((_, c) => {
        const calMonth = ((c + 3) % 12) + 1;
        const year = calMonth >= 4 ? fy : fy + 1;
        const key = `${year}-${String(calMonth).padStart(2, "0")}`;
        const row = monthly.find((x) => x.month === key);
        const rect = svgEl(
          "rect",
          {
            x: labelW + c * cw + gap / 2,
            y: top + r * ch + gap / 2,
            width: cw - gap,
            height: ch - gap,
            rx: 3,
            class: row ? "heat-cell" : "heat-empty",
          },
          svg
        );
        if (row) {
          rect.style.fill = `var(--seq-${binOf(row.avg_transaction_value_inr) + 1})`;
          cells.push({ r, c, row, rect });
        }
      });
    });
    let active = -1;
    function show(idx, fromKeyboard) {
      active = idx;
      const cell = cells[idx];
      cells.forEach((x) => x.rect.classList.toggle("is-active", x === cell));
      showTooltip(
        [
          { title: monthLabel(cell.row.month) },
          {
            value: fmt.rupee(cell.row.avg_transaction_value_inr),
            label: "Average payment",
            color: cell.rect.style.fill,
            swatch: true,
          },
        ],
        cell.rect.getBoundingClientRect()
      );
      if (fromKeyboard)
        srLive.textContent = `${monthLabel(cell.row.month)}: average payment ${fmt.rupee(cell.row.avg_transaction_value_inr)}`;
    }
    function clear() {
      cells.forEach((x) => x.rect.classList.remove("is-active"));
      hideTooltip();
    }
    cells.forEach((cell, idx) => {
      cell.rect.addEventListener("pointerenter", () => show(idx));
      cell.rect.addEventListener("pointerleave", clear);
    });
    svg.addEventListener("keydown", (e) => {
      if (e.key === "Escape") return clear();
      const move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[
        e.key
      ];
      if (!move) return;
      e.preventDefault();
      if (active < 0) return show(0, true);
      const cur = cells[active];
      // Walk in the arrow's direction to the next existing cell (rows can be partial).
      let r = cur.r + move[0],
        c = cur.c + move[1];
      while (r >= 0 && r < fys.length && c >= 0 && c < 12) {
        const nxt = cells.findIndex((x) => x.r === r && x.c === c);
        if (nxt >= 0) return show(nxt, true);
        r += move[0];
        c += move[1];
      }
    });
    svg.addEventListener("blur", clear);
    clearers.set(el, clear);
    mount(el, svg);
  }

  function mount(el, svg) {
    const first = !drawn.has(el);
    el.classList.toggle("animate", first && !reduceMotion);
    el.replaceChildren(svg);
    if (first && !reduceMotion)
      $$(".series-line", svg).forEach((p) =>
        p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1)
      );
    drawn.add(el);
  }

  /* ---------------- Chart registry: render when visible ---------------- */
  const S1 = "var(--series-1)",
    S2 = "var(--series-2)";
  const charts = {
    "chart-index": (el, P) => {
      if (!P.length) return emptyState(el, noPeriodsMsg());
      lineChart(el, {
        points: P,
        zero: true,
        yFmt: fmt.index,
        label: "Transactions and value indexed to the first period shown",
        series: [
          {
            label: "Transactions",
            color: S1,
            values: P.map((p) => (p.volume / P[0].volume) * 100),
          },
          { label: "Value", color: S2, values: P.map((p) => (p.value / P[0].value) * 100) },
        ],
      });
    },
    "chart-volume": (el, P) =>
      lineChart(el, {
        points: P,
        area: true,
        yFmt: fmt.bn,
        axisFmt: (v) => `${+(v / 1000).toFixed(1)}bn`,
        label: "Transactions in billions",
        series: [{ label: "Transactions", color: S1, values: P.map((p) => p.volume) }],
      }),
    "chart-value": (el, P) =>
      lineChart(el, {
        points: P,
        area: true,
        yFmt: fmt.lakhCr,
        axisFmt: (v) => `₹${+(v / 1e5).toFixed(1)}L cr`,
        label: "Value in lakh crore rupees",
        series: [{ label: "Value", color: S1, values: P.map((p) => p.value) }],
      }),
    "chart-fygrowth": (el) => {
      // Complete FYs inside the range whose previous FY is also complete.
      const fy = aggregate(rows, "fy").filter(
        (p) => p.start >= state.from && p.end <= state.to && p.volumeYoy != null
      );
      barChart(el, {
        points: fy,
        tickGran: "fy",
        label: "Transaction and value growth by financial year",
        yFmt: fmt.pct,
        axisFmt: (v) => `${inr(v)}%`,
        empty:
          "Needs at least one complete financial year, and the year before it, inside the selected period.",
        series: [
          { label: "Transactions", color: S1, values: fy.map((p) => p.volumeYoy) },
          { label: "Value", color: S2, values: fy.map((p) => p.valueYoy) },
        ],
      });
    },
    "chart-avg": (el, P) => {
      if (!P.length) return emptyState(el, noPeriodsMsg());
      lineChart(el, {
        points: P,
        zero: false,
        yFmt: fmt.rupee,
        label: "Average payment value in rupees",
        ref: { value: P[0].avg, label: `${P[0].short}: ${fmt.rupee(P[0].avg)}` },
        series: [{ label: "Average payment", color: S1, values: P.map((p) => p.avg) }],
      });
    },
    "chart-heat": (el) => heatmap(el, monthsInRange()),
    "chart-oct": (el) => {
      const oct = monthsInRange()
        .filter((r) => r.month.endsWith("-10"))
        .map((r) => ({
          label: monthLabel(r.month),
          short: r.month.slice(0, 4),
          first: r.month,
          avg: r.avg_transaction_value_inr,
        }));
      barChart(el, {
        points: oct,
        tickGran: "fy",
        label: "Average payment value in each October",
        yFmt: fmt.rupee,
        empty: "The selected period contains no October.",
        series: [{ label: "Average payment", color: S1, values: oct.map((p) => p.avg) }],
      });
    },
    "chart-yoy": (el, P) => {
      const withYoy = P.filter((p) => p.volumeYoy != null);
      if (!withYoy.length)
        return emptyState(
          el,
          "Year-over-year growth needs the same period a year earlier. Widen the period to include it."
        );
      lineChart(el, {
        points: withYoy,
        zero: true,
        yFmt: fmt.pct,
        axisFmt: (v) => `${inr(v)}%`,
        label: "Year-over-year growth of transactions and value",
        series: [
          { label: "Transactions", color: S1, values: withYoy.map((p) => p.volumeYoy) },
          { label: "Value", color: S2, values: withYoy.map((p) => p.valueYoy) },
        ],
      });
    },
    "chart-banks": (el, P) =>
      lineChart(el, {
        points: P,
        area: true,
        yFmt: fmt.count,
        label: "Banks live on UPI",
        series: [{ label: "Banks live", color: S1, values: P.map((p) => p.banks) }],
      }),
    "chart-added": (el, P) =>
      barChart(el, {
        points: P,
        label: "Net banks added per period",
        yFmt: fmt.delta,
        axisFmt: fmt.count,
        directLabels: P.length <= 12 ? "ends" : "none",
        series: [{ label: "Banks added", color: S1, values: P.map((p) => p.added) }],
      }),
    "chart-daily": (el, P) =>
      lineChart(el, {
        points: P,
        area: true,
        yFmt: fmt.mn,
        axisFmt: (v) => `${inr(v)}mn`,
        label: "Transactions per calendar day in millions",
        series: [{ label: "Per day", color: S1, values: P.map((p) => p.perDay) }],
      }),
    "chart-perbank": (el, P) =>
      lineChart(el, {
        points: P,
        area: true,
        yFmt: fmt.mn,
        axisFmt: (v) => `${inr(v)}mn`,
        label: "Transactions per live bank in millions (derived)",
        series: [{ label: "Per bank", color: S1, values: P.map((p) => p.perBank) }],
      }),
  };
  function renderVisible() {
    if (!rows.length) return;
    Object.entries(charts).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null && el.clientWidth > 0) fn(el, periods);
    });
  }
  let resizeFrame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderVisible);
  });
  $$(".chart").forEach((c) => ro.observe(c));

  // Legends mirror the mark: line keys for line charts, rect keys for bars.
  function legend(id, items, shape = "line") {
    $(`#${id}`).replaceChildren(
      ...items.map(([label, color]) => {
        const it = document.createElement("span");
        it.className = "legend-item nuclios-type-body-small-regular";
        const key = document.createElement("span");
        key.className = shape === "bar" ? "legend-swatch" : "legend-key";
        key.style.background = color;
        it.append(key, document.createTextNode(label));
        return it;
      })
    );
  }

  /* ---------------- KPIs (always monthly) + chart-card metrics ---------------- */
  const arrowUp =
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11l4-4 3 3 5-5M10 5h4v4"/></svg>';
  const arrowDown =
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l4 4 3-3 5 5M10 11h4V7"/></svg>';
  function kpi({ label, value, delta, dir, tone, caption }) {
    const card = document.createElement("article");
    card.className = "kpi";
    const l = document.createElement("p");
    l.className = "kpi-label nuclios-type-body-default-regular";
    l.textContent = label;
    const row = document.createElement("div");
    row.className = "kpi-row";
    const v = document.createElement("span");
    v.className = "kpi-value nuclios-type-heading-h3-medium";
    v.textContent = value;
    row.append(v);
    if (delta) {
      const chip = document.createElement("span");
      chip.className = `delta delta-${tone} nuclios-type-body-small-medium`;
      chip.innerHTML = dir === "up" ? arrowUp : arrowDown; // static icon markup only
      chip.append(document.createTextNode(delta));
      chip.setAttribute("aria-label", `${dir === "up" ? "Up" : "Down"} ${delta}`);
      row.append(chip);
    }
    const c = document.createElement("p");
    c.className = "nuclios-type-body-small-regular muted";
    c.textContent = caption;
    card.append(l, row, c);
    return card;
  }
  function renderKpis() {
    const b = rows[state.to];
    const baseIdx = state.compare === "yoy" ? state.to - 12 : state.from;
    const a = baseIdx >= 0 && baseIdx !== state.to ? rows[baseIdx] : null;
    const caption = a
      ? `${monthLabel(b.month)} · vs ${monthLabel(a.month)}`
      : state.compare === "yoy"
        ? `${monthLabel(b.month)} · no data a year earlier`
        : monthLabel(b.month);
    const pct = (k) => (b[k] / a[k] - 1) * 100;
    const dir = (v) => (v >= 0 ? "up" : "down");
    // [label, value, % change, decimals, judged] — a falling average payment is never "bad": neutral chip.
    const specs = [
      ["Monthly transactions", fmt.bn(b.volume_million), a ? pct("volume_million") : 0, true],
      ["Monthly value", fmt.lakhCr(b.value_crore), a ? pct("value_crore") : 0, true],
      [
        "Average payment value",
        fmt.rupee(b.avg_transaction_value_inr),
        a ? pct("avg_transaction_value_inr") : 0,
        false,
      ],
    ];
    const cards = specs.map(([label, value, d, judged]) =>
      kpi({
        label,
        value,
        delta: a ? signed(d, Math.abs(d) < 100 ? 1 : 0) : null,
        dir: dir(d),
        tone: judged && d >= 0 ? "up" : "neutral",
        caption,
      })
    );
    const bd = a ? b.banks_live - a.banks_live : 0;
    cards.push(
      kpi({
        label: "Banks live",
        value: fmt.count(b.banks_live),
        delta: a ? fmt.delta(bd) : null,
        dir: dir(bd),
        tone: bd >= 0 ? "up" : "neutral",
        caption,
      })
    );
    $("#kpis").replaceChildren(...cards);
  }
  function renderMetrics() {
    const p = periods.at(-1);
    const set = (id, val) => {
      $(`#${id}`).textContent = p && val != null ? val : "—";
      $(`#${id}-cap`).textContent = p ? p.short : "";
    };
    set("m-volume", p && fmt.bn(p.volume));
    set("m-value", p && fmt.lakhCr(p.value));
    set("m-avg", p && fmt.rupee(p.avg));
    set("m-banks", p && fmt.count(p.banks));
    set("m-added", p && p.added != null ? fmt.delta(p.added) : null);
    set("m-daily", p && fmt.mn(p.perDay));
    set("m-perbank", p && fmt.mn(p.perBank));
  }

  /* ---------------- Data table ---------------- */
  const columns = [
    { key: "start", label: "Period", fmt: (v, p) => p.label, csv: (p) => p.short },
    {
      key: "volume",
      label: "Transactions (mn)",
      fmt: (v) => inr(v, 1),
      csv: (p) => p.volume.toFixed(2),
    },
    { key: "value", label: "Value (₹ crore)", fmt: (v) => inr(v), csv: (p) => p.value.toFixed(2) },
    { key: "avg", label: "Avg payment (₹)", fmt: (v) => inr(v, 2), csv: (p) => p.avg.toFixed(2) },
    { key: "banks", label: "Banks live (end)", fmt: (v) => inr(v), csv: (p) => p.banks },
    {
      key: "added",
      label: "Banks added",
      fmt: (v) => (v == null ? "—" : fmt.delta(v)),
      csv: (p) => (p.added == null ? "" : p.added),
    },
    {
      key: "perDay",
      label: "Per day (mn)",
      fmt: (v) => inr(v, 1),
      csv: (p) => p.perDay.toFixed(3),
    },
    {
      key: "volumeYoy",
      label: "Transactions YoY",
      fmt: (v) => (v == null ? "—" : signed(v)),
      csv: (p) => (p.volumeYoy == null ? "" : p.volumeYoy.toFixed(2)),
    },
    {
      key: "valueYoy",
      label: "Value YoY",
      fmt: (v) => (v == null ? "—" : signed(v)),
      csv: (p) => (p.valueYoy == null ? "" : p.valueYoy.toFixed(2)),
    },
  ];
  const table = { sortKey: "start", dir: -1, page: 0, size: 24, pages: 1 };
  const sortSvg =
    '<svg class="icon sort-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 1.5l3 3M6 1.5v9"/></svg>';
  function buildHead() {
    $("#dataTable thead tr").replaceChildren(
      ...columns.map((c) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.dataset.key = c.key;
        const b = document.createElement("button");
        b.type = "button";
        b.append(document.createTextNode(c.label));
        b.insertAdjacentHTML("beforeend", sortSvg);
        b.addEventListener("click", () => {
          table.dir = table.sortKey === c.key ? -table.dir : -1;
          table.sortKey = c.key;
          table.page = 0;
          renderTable();
        });
        th.append(b);
        return th;
      })
    );
  }
  function renderTable() {
    const d = periods.slice().sort((a, b) => {
      const x = a[table.sortKey],
        y = b[table.sortKey];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * table.dir;
    });
    $$("#dataTable thead th").forEach((th) =>
      th.dataset.key === table.sortKey
        ? th.setAttribute("aria-sort", table.dir > 0 ? "ascending" : "descending")
        : th.removeAttribute("aria-sort")
    );
    const size = table.size === "all" ? Math.max(1, d.length) : table.size;
    table.pages = Math.max(1, Math.ceil(d.length / size));
    table.page = Math.min(table.page, table.pages - 1);
    const start = table.page * size;
    const slice = d.slice(start, start + size);
    $("#dataTable tbody").replaceChildren(
      ...slice.map((p) => {
        const tr = document.createElement("tr");
        columns.forEach((c, i) => {
          const cell = document.createElement(i === 0 ? "th" : "td");
          if (i === 0) cell.scope = "row";
          cell.textContent = c.fmt(p[c.key], p);
          tr.append(cell);
        });
        return tr;
      })
    );
    $("#pageInfo").textContent = d.length
      ? `${start + 1}–${start + slice.length} of ${d.length}`
      : "0 of 0";
    $("#firstPage").disabled = $("#prevPage").disabled = table.page === 0;
    $("#nextPage").disabled = $("#lastPage").disabled = table.page >= table.pages - 1;
  }
  $("#rowsPerPage").addEventListener("change", (e) => {
    table.size = e.target.value === "all" ? "all" : +e.target.value;
    table.page = 0;
    renderTable();
  });
  $("#firstPage").addEventListener("click", () => {
    table.page = 0;
    renderTable();
  });
  $("#prevPage").addEventListener("click", () => {
    table.page--;
    renderTable();
  });
  $("#nextPage").addEventListener("click", () => {
    table.page++;
    renderTable();
  });
  $("#lastPage").addEventListener("click", () => {
    table.page = table.pages - 1;
    renderTable();
  });
  $("#downloadCsv").addEventListener("click", () => {
    if (!periods.length) return;
    const head = [
      "period",
      "transactions_million",
      "value_crore",
      "avg_payment_inr",
      "banks_live_end",
      "banks_added",
      "transactions_per_day_million",
      "transactions_yoy_pct",
      "value_yoy_pct",
    ];
    const body = periods.map((p) => columns.map((c) => c.csv(p)).join(","));
    const blob = new Blob([`${head.join(",")}\n${body.join("\n")}\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `upi_${state.gran}_${rows[state.from].month}_to_${rows[state.to].month}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------------- Filters ---------------- */
  const periodSel = $("#period"),
    fromSel = $("#fromMonth"),
    toSel = $("#toMonth"),
    granSel = $("#granularity"),
    compareSel = $("#compare");
  let presetList = [];
  function presets() {
    const n = rows.length;
    const list = [
      { id: "all", label: "All time", range: [0, n - 1] },
      { id: "36", label: "Last 36 months", range: [Math.max(0, n - 36), n - 1] },
      { id: "24", label: "Last 24 months", range: [Math.max(0, n - 24), n - 1] },
      { id: "12", label: "Last 12 months", range: [Math.max(0, n - 12), n - 1] },
    ];
    rows.forEach((r, i) => {
      if (!r.month.endsWith("-04")) return;
      const y = +r.month.slice(0, 4);
      const end = Math.min(n - 1, i + 11);
      list.push({
        id: `fy${y}`,
        label: `${fyLong(y)}${end - i < 11 ? " (to date)" : ""}`,
        range: [i, end],
      });
    });
    list.push({ id: "custom", label: "Custom range", range: null });
    return list;
  }
  const setSelects = (from, to) => {
    fromSel.value = String(from);
    toSel.value = String(to);
  };
  periodSel.addEventListener("change", () => {
    const p = presetList.find((x) => x.id === periodSel.value);
    if (p && p.range) setSelects(...p.range);
  });
  [fromSel, toSel].forEach((s) =>
    s.addEventListener("change", () => {
      const f = +fromSel.value,
        t = +toSel.value;
      const match = presetList.find((p) => p.range && p.range[0] === f && p.range[1] === t);
      periodSel.value = match ? match.id : "custom";
    })
  );
  function populateFilters() {
    presetList = presets();
    periodSel.replaceChildren(...presetList.map((p) => new Option(p.label, p.id)));
    const opts = (sel) =>
      sel.replaceChildren(...rows.map((r, i) => new Option(monthLabel(r.month), String(i))));
    opts(fromSel);
    opts(toSel);
  }
  function apply() {
    let f = +fromSel.value,
      t = +toSel.value;
    if (f > t) [f, t] = [t, f];
    setSelects(f, t);
    Object.assign(state, { from: f, to: t, gran: granSel.value, compare: compareSel.value });
    const overlapping = aggregate(rows, state.gran).filter((p) => p.end >= f && p.start <= t);
    periods = overlapping.filter((p) => p.complete && p.start >= f && p.end <= t);
    const left = overlapping.filter((p) => !periods.includes(p));
    const note = $("#granularityNote");
    note.hidden = !left.length;
    if (left.length) {
      const one = left.length === 1;
      note.textContent = `Complete ${UNIT[state.gran]}s only: ${left.map((p) => p.label).join("; ")} ${one ? "is" : "are"} partly outside the period or not yet finished, so ${one ? "it is" : "they are"} left out of the trend charts and table. Headline cards, the heatmap and the October chart always use months.`;
    }
    const months = t - f + 1;
    $("#rangeStatus").textContent =
      `${monthLabel(rows[f].month)} – ${monthLabel(rows[t].month)} · ${months} month${months === 1 ? "" : "s"}`;
    $$("[data-unit]").forEach((s) => (s.textContent = UNIT[state.gran]));
    table.page = 0;
    renderKpis();
    renderMetrics();
    renderTable();
    renderVisible();
  }
  $("#filters").addEventListener("submit", (e) => {
    e.preventDefault();
    apply();
  });
  $("#resetFilters").addEventListener("click", () => {
    periodSel.value = "all";
    granSel.value = "month";
    compareSel.value = "start";
    setSelects(0, rows.length - 1);
    apply();
  });

  /* ---------------- Load & refresh (refresh keeps the frame: no skeleton, no layout jump) ---------------- */
  const refreshBtn = $("#refreshData");
  const refreshLabel = $("span", refreshBtn);
  const timeNow = () =>
    new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  function parse(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    return lines.map((line) =>
      Object.fromEntries(
        line.split(",").map((v, i) => [headers[i], i === 0 ? v : v === "" ? null : Number(v)])
      )
    );
  }
  async function load(isRefresh) {
    if (isRefresh) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add("is-busy");
      refreshLabel.textContent = "Refreshing…";
      $$(".chart, .kpi-grid, .table-card").forEach((c) => c.classList.add("is-refreshing"));
    }
    try {
      const next = parse(await readCsv(isRefresh));
      if (!next.length) throw new Error("empty CSV");
      // Keep the reader's selection across a refresh, matched by month (a preset re-resolves).
      const keep = rows.length
        ? {
            from: rows[state.from].month,
            to: rows[state.to].month,
            wasLatest: state.to === rows.length - 1,
            preset: periodSel.value,
          }
        : null;
      const added = rows.length ? next.length - rows.length : 0;
      rows = next;
      $("#coverage").textContent =
        `${monthLabel(rows[0].month)} – ${monthLabel(rows.at(-1).month)} (${rows.length} months)`;
      populateFilters();
      if (keep) {
        const preset = presetList.find((p) => p.id === keep.preset && p.range);
        if (preset) {
          periodSel.value = preset.id;
          setSelects(...preset.range);
        } else {
          const fi = Math.max(
            0,
            rows.findIndex((x) => x.month === keep.from)
          );
          let ti = rows.findIndex((x) => x.month === keep.to);
          if (keep.wasLatest || ti < 0) ti = rows.length - 1;
          periodSel.value = "custom";
          setSelects(fi, ti);
        }
      } else {
        periodSel.value = "all";
        setSelects(0, rows.length - 1);
      }
      $("#loadError").hidden = true;
      $$("#filters select, #filters button").forEach((c) => (c.disabled = false));
      apply();
      const extra = isRefresh
        ? added > 0
          ? ` · ${added} new month${added === 1 ? "" : "s"}`
          : " · no new months"
        : "";
      $("#updatedAt").textContent = `Updated ${timeNow()} · ${rows.length} months${extra}`;
    } catch (err) {
      if (!rows.length) {
        $("#loadError").hidden = false;
        $$("#filters select, #filters button").forEach((c) => (c.disabled = true));
      } else {
        $("#updatedAt").textContent =
          `Refresh failed at ${timeNow()} — still showing the last loaded data`;
      }
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("is-busy");
      refreshLabel.textContent = "Refresh data";
      $$(".is-refreshing").forEach((c) => c.classList.remove("is-refreshing"));
    }
  }
  refreshBtn.addEventListener("click", () => load(true));

  legend("legend-index", [
    ["Transactions", S1],
    ["Value", S2],
  ]);
  legend("legend-yoy", [
    ["Transactions", S1],
    ["Value", S2],
  ]);
  legend(
    "legend-fygrowth",
    [
      ["Transactions", S1],
      ["Value", S2],
    ],
    "bar"
  );
  buildHead();
  const initial = tabs.find((t) => `#${t.id.replace("tab-", "")}` === location.hash);
  if (initial) selectTab(initial);
  load(false);
})();
