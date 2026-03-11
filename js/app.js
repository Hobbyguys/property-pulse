/* ============================================================
   app.js — Property Pulse Dashboard
   Renders cards, calls fetchers, draws SVG sparklines
   ============================================================ */

(function () {
  "use strict";

  /* ── Colour helpers ── */
  const COLOR = {
    green:  { dot: "#3dd68c", text: "#3dd68c", dim: "rgba(61,214,140,0.55)" },
    amber:  { dot: "#f5a623", text: "#f5a623", dim: "rgba(245,166,35,0.55)" },
    red:    { dot: "#f06878", text: "#f06878", dim: "rgba(240,104,120,0.55)" },
    locked: { dot: "#4a5a6e", text: "#4a5a6e", dim: "rgba(74,90,110,0.4)" },
  };

  /* ── Sparkline SVG ── */
  function sparklineSVG(data, colorKey) {
    const W = 82, H = 30;
    const col = (COLOR[colorKey] || COLOR.locked);
    if (!data || data.length < 2) {
      return `<svg width="${W}" height="${H}"></svg>`;
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - 4 - ((v - min) / range) * (H - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const lastX = W;
    const lastY = H - 4 - ((data[data.length - 1] - min) / range) * (H - 8);
    // Build area fill path
    const firstX = 0;
    const baseY  = H;
    const areaPath = `M${firstX},${baseY} L${pts.split(" ").map(p => p).join(" L")} L${lastX},${baseY} Z`;
    return `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
        <path d="M ${pts.split(" ").join(" L ")}" stroke="${col.text}" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.8" fill="${col.text}"/>
      </svg>`;
  }

  /* ── Build a locked placeholder card ── */
  function buildLockedCard(ind) {
    return `
      <div class="indicator-card locked" id="card-${ind.id}">
        <div class="lock-badge">🔒 TO BE SUBSCRIBED</div>
        <div class="card-top">
          <div class="card-label-wrap">
            <span class="card-icon">${ind.icon}</span>
            <div class="card-label">${ind.label}</div>
            <div class="card-source">${ind.source}</div>
          </div>
          <div class="sparkline-wrap">${sparklineSVG(null, "locked")}</div>
        </div>
        <div class="card-value">—</div>
        <div class="card-bottom">
          <div class="card-status">
            <span class="status-dot" style="background:${COLOR.locked.dot}"></span>
            <span style="color:${COLOR.locked.text}">Awaiting subscription</span>
          </div>
          <span class="card-change" style="color:var(--muted)">n/a</span>
        </div>
        <div class="card-note">${ind.note}</div>
      </div>`;
  }

  /* ── Build a live card (skeleton state) ── */
  function buildSkeletonCard(ind) {
    return `
      <div class="indicator-card" id="card-${ind.id}">
        <div class="card-top">
          <div class="card-label-wrap">
            <span class="card-icon">${ind.icon}</span>
            <div class="card-label">${ind.label}</div>
            <div class="card-source">${ind.source}</div>
          </div>
          <div class="sparkline-wrap" id="spark-${ind.id}"></div>
        </div>
        <div class="card-value" id="val-${ind.id}">
          <div class="skeleton" style="width:100px;height:2rem;"></div>
        </div>
        <div class="card-bottom">
          <div class="card-status" id="status-${ind.id}">
            <span class="status-dot" style="background:var(--muted2)"></span>
            <span style="color:var(--muted)">Loading…</span>
          </div>
          <span class="card-change" id="change-${ind.id}" style="color:var(--muted)">—</span>
        </div>
        <div class="card-note">${ind.note}</div>
      </div>`;
  }

  /* ── Patch a card with live data ── */
  function patchCard(ind, data) {
    const card   = document.getElementById(`card-${ind.id}`);
    const valEl  = document.getElementById(`val-${ind.id}`);
    const statEl = document.getElementById(`status-${ind.id}`);
    const chgEl  = document.getElementById(`change-${ind.id}`);
    const spkEl  = document.getElementById(`spark-${ind.id}`);
    if (!card) return;

    const col = COLOR[data.status] || COLOR.amber;
    const up  = data.change >= 0;
    const chgText = `${up ? "▲" : "▼"} ${Math.abs(data.change)}${data.unit === "%" || data.unit === "dwellings/mo" ? "%" : ""}`;

    // Add colour class
    card.classList.remove("green", "amber", "red");
    card.classList.add(data.status);

    valEl.innerHTML  = data.value;
    statEl.innerHTML = `
      <span class="status-dot" style="background:${col.dot}"></span>
      <span style="color:${col.text}">${data.statusLabel}</span>`;
    chgEl.innerHTML  = chgText;
    chgEl.style.color = up ? "var(--green)" : "var(--red)";

    if (spkEl) spkEl.innerHTML = sparklineSVG(data.trend, data.status);
  }

  /* ── Patch a card into error state ── */
  function patchCardError(ind, errMsg) {
    const card  = document.getElementById(`card-${ind.id}`);
    const valEl = document.getElementById(`val-${ind.id}`);
    if (!card || !valEl) return;
    card.classList.add("amber");
    valEl.innerHTML = `<span style="font-size:1rem;color:var(--amber)">Error</span>`;
    const noteEl = card.querySelector(".card-note");
    if (noteEl) {
      noteEl.innerHTML += `<div class="error-note">⚠ ${errMsg} — check console for details.</div>`;
    }
  }

  /* ── Update the signal bar ── */
  function updateSignal(results) {
    const textEl  = document.getElementById("signal-text");
    const pillsEl = document.getElementById("signal-pills");
    if (!textEl || !pillsEl) return;

    const live = results.filter(r => r.data);
    if (!live.length) {
      textEl.textContent = "No live data loaded — check network or API availability.";
      return;
    }

    const greenCount = live.filter(r => r.data.status === "green").length;
    const redCount   = live.filter(r => r.data.status === "red").length;
    const signal     = greenCount >= 2 ? "Positive fundamentals" : redCount >= 2 ? "Caution — weakening signals" : "Mixed signals — monitor closely";
    textEl.textContent = signal + " · " + live.length + " live indicator" + (live.length > 1 ? "s" : "") + " loaded";

    pillsEl.innerHTML = live.map(r => {
      const col = COLOR[r.data.status] || COLOR.amber;
      return `<span class="signal-pill" style="background:${col.dim};color:${col.text};">${r.ind.label.split(" ")[0]} ${r.data.value}</span>`;
    }).join("");
  }

  /* ── Timestamp ── */
  function setTimestamp() {
    const el = document.getElementById("last-updated");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleString("en-AU", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  }

  /* ── Tab switching ── */
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById(`tab-${target}`);
        if (panel) panel.classList.add("active");
      });
    });
  }

  /* ── Bootstrap ── */
  async function init() {
    initTabs();
    setTimestamp();

    const grid = document.getElementById("cards-grid");
    if (!grid) return;

    // Render all cards first (locked placeholders + loading skeletons)
    grid.innerHTML = INDICATORS.map(ind =>
      ind.locked ? buildLockedCard(ind) : buildSkeletonCard(ind)
    ).join("");

    // Fetch live indicators concurrently
    const liveInds = INDICATORS.filter(ind => !ind.locked && ind.fetcher);

    const results = await Promise.allSettled(
      liveInds.map(ind =>
        ind.fetcher()
          .then(data => ({ ind, data }))
          .catch(err => { console.error(`[${ind.id}]`, err); return { ind, err }; })
      )
    );

    const resolved = results.map(r => (r.status === "fulfilled" ? r.value : r.reason));

    resolved.forEach(r => {
      if (r.data)  patchCard(r.ind, r.data);
      if (r.err)   patchCardError(r.ind, r.err.message || "Fetch failed");
    });

    updateSignal(resolved);
  }

  /* Run after DOM ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
