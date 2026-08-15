/* mold_survey engine
 * - multi-page flow, back-lock after free recall (S2b)
 * - card randomization + order logging, per-page dwell-time logging
 * - conditional branching (review_count → acted, code_exposure → S5B)
 * - ko/en, autosave to localStorage, Apps Script endpoint or JSON fallback
 */
(function () {
  "use strict";
  const CFG = window.SURVEY_CONFIG;
  const STORE_KEY = "mold_survey_" + CFG.VERSION;

  // ---------- state ----------
  let state = {
    lang: null,
    pageIdx: 0,
    locked: false, // true once the user leaves the free-recall page
    answers: {},
    files: [], // {name, type, dataUrl}
    meta: {
      version: CFG.VERSION,
      src: new URLSearchParams(location.search).get("src") || "",
      ua: navigator.userAgent,
      screen: (window.screen ? window.screen.width + "x" + window.screen.height : ""),
      startedAt: null,
      cardOrder: null,
      pageTimesMs: {},
    },
    submitted: false,
    cand2Open: false,
  };
  let pageShownAt = Date.now();

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const t = (key) => {
    const v = window.I18N[state.lang][key];
    return v === undefined ? key : v;
  };
  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : "{" + k + "}"));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const A = (id, val) => { if (val === "" || val == null) delete state.answers[id]; else state.answers[id] = val; save(); };
  const get = (id) => state.answers[id];

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, files: [] })); } catch (e) { /* quota */ }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (s && s.meta && !s.submitted && (s.pageIdx > 0 || Object.keys(s.answers || {}).length)) {
        state = { ...state, ...s, files: [] };
        return true;
      }
    } catch (e) { }
    return false;
  }
  function detectLang() {
    const p = new URLSearchParams(location.search).get("lang");
    if (p === "ko" || p === "en") return p;
    return (navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const CARD_KEYS = ["crn", "pb", "mr", "esa", "cp", "ffm", "trap", "exec"];
  const CARD_IMG = {
    crn: "assets/cards/card1_crossref.png",
    pb: "assets/cards/card2_problem.png",
    mr: "assets/cards/card3_redundancy.png",
    esa: "assets/cards/card4_evalsurface.png",
    cp: "assets/cards/card5_positioning.png",
    ffm: "assets/cards/card6_figuremonotony.png",
    trap: null, // trap card: text only, no numbers (by design)
    exec: "assets/cards/card8_execution.png",
  };

  // ---------- input widgets ----------
  function qhead(label, req, note) {
    return `<div class="q-label">${esc(label)} <span class="tag ${req ? "req" : "opt"}">${req ? t("required_mark") : t("optional_mark")}</span></div>` +
      (note ? `<div class="q-note">${esc(note)}</div>` : "");
  }
  function radiosBare(id, opts) {
    const cur = get(id);
    let html = `<div class="opts">`;
    opts.forEach((o, i) => {
      html += `<label class="opt"><input type="radio" name="${id}" value="${i}" ${cur === i ? "checked" : ""}> <span>${esc(o)}</span></label>`;
    });
    return html + `</div>`;
  }
  function radios(id, opts, { otherIdx = -1, req = true, label, note } = {}) {
    const cur = get(id);
    let html = `<div class="q" data-q="${id}">` + qhead(label, req, note) + `<div class="opts">`;
    opts.forEach((o, i) => {
      html += `<label class="opt"><input type="radio" name="${id}" value="${i}" ${cur === i ? "checked" : ""}> <span>${esc(o)}</span></label>`;
      if (i === otherIdx) {
        html += `<input type="text" class="other-input" id="${id}_other" placeholder="…" value="${esc(get(id + "_other") || "")}" ${cur === i ? "" : "style='display:none'"}>`;
      }
    });
    html += `</div><div class="q-err"></div></div>`;
    return html;
  }
  function checks(id, opts, { req = true, label, note, max = 0, otherIdx = -1 } = {}) {
    const cur = get(id) || [];
    let html = `<div class="q" data-q="${id}" data-max="${max}">` + qhead(label, req, note) + `<div class="opts">`;
    opts.forEach((o, i) => {
      html += `<label class="opt"><input type="checkbox" name="${id}" value="${i}" ${cur.includes(i) ? "checked" : ""}> <span>${esc(o)}</span></label>`;
      if (i === otherIdx) {
        html += `<input type="text" class="other-input" id="${id}_other" placeholder="…" value="${esc(get(id + "_other") || "")}" ${cur.includes(i) ? "" : "style='display:none'"}>`;
      }
    });
    html += `</div><div class="q-err"></div></div>`;
    return html;
  }
  function textarea(id, { req = true, label, note, minlen = 0, rows = 3, placeholder = "" } = {}) {
    return `<div class="q" data-q="${id}" data-minlen="${minlen}">` + qhead(label, req, note) +
      `<textarea id="${id}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(get(id) || "")}</textarea><div class="q-err"></div></div>`;
  }
  function textinput(id, { req = true, label, note, type = "text", placeholder = "" } = {}) {
    return `<div class="q" data-q="${id}">` + qhead(label, req, note) +
      `<input type="${type}" id="${id}" value="${esc(get(id) || "")}" placeholder="${esc(placeholder)}"><div class="q-err"></div></div>`;
  }
  function scale5(id, { label, req = true } = {}) {
    const cur = get(id);
    let html = `<div class="q" data-q="${id}">` + qhead(label, req) +
      `<div class="scale"><span class="scale-lab">${esc(t("seen_lo"))}</span>`;
    for (let i = 0; i <= 4; i++) {
      html += `<label class="scale-opt"><input type="radio" name="${id}" value="${i}" ${cur === i ? "checked" : ""}><span>${i}</span></label>`;
    }
    html += `<span class="scale-lab">${esc(t("seen_hi"))}</span></div><div class="q-err"></div></div>`;
    return html;
  }

  // ---------- page definitions ----------
  function candidateFields(prefix, required) {
    return (
      textinput(prefix + "_name", { req: required, label: t("f_name_q"), note: t("f_name_note") }) +
      textarea(prefix + "_rule", { req: required, label: t("f_rule_q"), note: t("f_rule_note"), minlen: required ? 10 : 0, rows: 2 }) +
      checks(prefix + "_where", t("f_where_opts"), { req: required, label: t("f_where_q") }) +
      textarea(prefix + "_count", { req: required, label: t("f_count_q"), note: t("f_count_note"), rows: 2 }) +
      textarea(prefix + "_why", { req: required, label: t("f_why_q"), note: t("f_why_note"), rows: 2 }) +
      textarea(prefix + "_fix", { req: false, label: t("f_fix_q"), note: t("f_fix_note"), rows: 2 }) +
      radios(prefix + "_erase", t("f_erase_opts"), { req: required, label: t("f_erase_q") }) +
      textarea(prefix + "_example", { req: false, label: t("f_example_q"), note: t("f_example_note"), rows: 2 })
    );
  }

  function buildPages() {
    const pages = [];

    pages.push({
      id: "consent",
      render() {
        const R = CFG.REWARD[state.lang];
        const bullets = t("s0_bullets").map((b) => `<li>${esc(fmt(b, { minutes: CFG.MINUTES, base: R.base, prize: R.prize }))}</li>`).join("");
        return `<h1>${esc(t("s0_heading"))}</h1>
          <p>${esc(t("s0_p1"))}</p><p>${esc(t("s0_p2"))}</p>
          <ul class="bullets">${bullets}</ul>
          <p class="contact">${esc(fmt(t("s0_contact"), { email: CFG.CONTACT_EMAIL }))}</p>
          <input type="text" id="hp_website" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <div class="q" data-q="consent"><label class="opt consent"><input type="checkbox" name="consent" ${get("consent") ? "checked" : ""}> <span>${esc(t("s0_consent"))}</span></label><div class="q-err"></div></div>`;
      },
      validate() { return get("consent") ? [] : ["consent"]; },
      nextLabel: () => t("nav_start"),
    });

    pages.push({
      id: "s1",
      render() {
        return `<h2>${esc(t("s1_heading"))}</h2>` +
          radios("role", t("role_opts"), { label: t("role_q"), otherIdx: 6 }) +
          radios("review_count", t("review_opts"), { label: t("review_q"), note: t("review_note") }) +
          radios("field", t("field_opts"), { label: t("field_q"), otherIdx: 7 }) +
          radios("llm_use", t("llm_opts"), { label: t("llm_q") }) +
          checks("ai_tools", t("tools_opts"), { label: t("tools_q"), otherIdx: 7 }) +
          radios("code_exposure", t("code_exp_opts"), { label: t("code_exp_q") });
      },
      validate() {
        const miss = [];
        ["role", "review_count", "field", "llm_use", "code_exposure"].forEach((id) => { if (get(id) === undefined) miss.push(id); });
        if (!(get("ai_tools") || []).length) miss.push("ai_tools");
        return miss;
      },
    });

    pages.push({
      id: "s2a",
      render() {
        return `<h2>${esc(t("s2a_heading"))}</h2>` +
          radios("d_freq", t("dfreq_opts"), { label: t("dfreq_q") }) +
          radios("d_share", t("dshare_opts"), { label: t("dshare_q") }) +
          checks("d_context", t("dctx_opts"), { label: t("dctx_q"), otherIdx: 4, req: false }) +
          textinput("d_topics", { label: t("dtopics_q"), note: t("dtopics_note") }) +
          textarea("d_links", { req: false, label: t("dlinks_q"), note: t("dlinks_note"), rows: 2 });
      },
      validate() {
        const miss = [];
        ["d_freq", "d_share"].forEach((id) => { if (get(id) === undefined) miss.push(id); });
        if (!String(get("d_topics") || "").trim()) miss.push("d_topics");
        return miss;
      },
    });

    pages.push({
      id: "s2b",
      render() {
        const verbRows = [1, 2, 3].map((n) => {
          const filled = n === 1 || String(get("r_p" + n) || "").trim().length > 0;
          return `<div class="verb-row" id="verbrow_${n}" ${filled ? "" : "style='display:none'"}>
            <div class="verb-lab">${esc(fmt(t("verb_label"), { n }))}</div>` +
            radiosBare("r_v" + n, t("verb_opts")) + `</div>`;
        }).join("");
        return `<h2>${esc(t("s2b_heading"))}</h2>
          <p>${esc(t("s2b_intro"))}</p>
          <p class="ex-note">${esc(t("s2b_ex_note"))}</p>
          <div class="example"><h3>${esc(t("ex1_title"))}</h3><img src="assets/cards/card9_arggraph.png" alt=""><p class="ex-desc">${esc(t("ex1_desc"))}</p></div>
          <div class="example"><h3>${esc(t("ex2_title"))}</h3><img src="assets/cards/card10_figurecolor.png" alt=""><p class="ex-desc">${esc(t("ex2_desc"))}</p></div>
          <p class="ex-after">${esc(t("ex_after"))}</p>
          <div class="q" data-q="r_p1" data-minlen="20">${qhead(t("recall_q"), true, t("recall_note"))}
            <label class="sub-lab">${esc(t("recall_p1"))}</label>
            <textarea id="r_p1" rows="2">${esc(get("r_p1") || "")}</textarea>
            <label class="sub-lab">${esc(t("recall_p2"))} <span class="tag opt">${esc(t("optional_mark"))}</span></label>
            <textarea id="r_p2" rows="2">${esc(get("r_p2") || "")}</textarea>
            <label class="sub-lab">${esc(t("recall_p3"))} <span class="tag opt">${esc(t("optional_mark"))}</span></label>
            <textarea id="r_p3" rows="2">${esc(get("r_p3") || "")}</textarea>
            <div class="q-err"></div>
          </div>
          <div class="q" data-q="verb">${qhead(t("verb_q"), true)}${verbRows}<div class="q-err"></div></div>` +
          textarea("r_contrast", { req: false, label: t("contrast_q"), note: t("contrast_note"), rows: 2 }) +
          `<div class="lock-warning">${esc(t("lock_warning"))}</div>`;
      },
      validate() {
        const miss = [];
        if (String(get("r_p1") || "").trim().length < 20) miss.push("r_p1");
        [1, 2, 3].forEach((n) => {
          const filled = n === 1 || String(get("r_p" + n) || "").trim().length > 0;
          if (filled && get("r_v" + n) === undefined) miss.push("verb");
        });
        return miss;
      },
      onLeave() { state.locked = true; save(); },
    });

    pages.push({
      id: "s3",
      render() {
        return `<h2>${esc(t("s3_heading"))}</h2>
          <p>${esc(t("s3_p1"))}</p><p>${esc(t("s3_p2"))}</p><p>${esc(t("s3_p3"))}</p><p>${esc(t("s3_p4"))}</p>
          <p class="demo-link">${esc(t("s3_more"))}<a href="${esc(CFG.DEMO_URL)}" target="_blank" rel="noopener">${esc(CFG.DEMO_URL)}</a></p>`;
      },
      validate() { return []; },
    });

    // 8 card pages (randomized order held in meta.cardOrder)
    state.meta.cardOrder = state.meta.cardOrder || shuffle(CARD_KEYS);
    state.meta.cardOrder.forEach((key, i) => {
      pages.push({
        id: "card_" + key,
        render() {
          const card = t("cards")[key];
          const img = CARD_IMG[key];
          const showActed = get("review_count") !== 0; // "0편" → skip acted
          return `<h2>${esc(t("s4_heading"))}</h2>
            <div class="card-note">${esc(fmt(t("s4_note"), { i: i + 1 }))}</div>
            <div class="mold-card ${img ? "" : "text-card"}">
              <h3>${esc(card.title)}</h3>
              ${img ? `<img src="${img}" alt="">` : ""}
              ${img && state.lang === "en" ? `<div class="img-caption">${esc(t("s4_img_caption"))}</div>` : ""}
              ${card.stat && (!img || state.lang === "en") ? `<div class="card-stat">${esc(card.stat)}</div>` : ""}
            </div>` +
            scale5("c_" + key + "_seen", { label: t("seen_q") }) +
            radios("c_" + key + "_named", t("named_opts"), { label: t("named_q") }) +
            (showActed ? radios("c_" + key + "_acted", t("acted_opts"), { label: t("acted_q") }) : "");
        },
        validate() {
          const miss = [];
          if (get("c_" + key + "_seen") === undefined) miss.push("c_" + key + "_seen");
          if (get("c_" + key + "_named") === undefined) miss.push("c_" + key + "_named");
          if (get("review_count") !== 0 && get("c_" + key + "_acted") === undefined) miss.push("c_" + key + "_acted");
          return miss;
        },
      });
    });

    pages.push({
      id: "s4wrap",
      render() {
        const titles = state.meta.cardOrder.map((k) => t("cards")[k].title);
        return `<h2>${esc(t("s4wrap_heading"))}</h2>` +
          checks("w_top2", titles, { label: t("top2_q"), max: 2 }) +
          textarea("w_doubt", { label: t("doubt_q"), note: t("doubt_note"), minlen: 2, rows: 3 });
      },
      validate() {
        const miss = [];
        if (!(get("w_top2") || []).length) miss.push("w_top2");
        if (!String(get("w_doubt") || "").trim()) miss.push("w_doubt");
        return miss;
      },
      // store selected titles' internal keys, order-independent
      onLeave() {
        const sel = (get("w_top2") || []).map((i) => state.meta.cardOrder[i]);
        state.answers.w_top2_keys = sel; save();
      },
    });

    pages.push({
      id: "s5",
      render() {
        const R = CFG.REWARD[state.lang];
        return `<h2>${esc(t("s5_heading"))}</h2>
          <p>${esc(t("s5_intro"))}</p>
          <div class="prize-box">${esc(fmt(t("s5_prize"), { prize: R.prize })).replace(/\n/g, "<br>")}</div>
          <h3 class="cand-head">${esc(t("cand1_heading"))}</h3>` +
          candidateFields("m1", true) +
          (state.cand2Open
            ? `<h3 class="cand-head">${esc(t("cand2_heading"))}</h3>` + candidateFields("m2", false)
            : `<button type="button" class="ghost-btn" id="cand2_toggle">${esc(t("cand2_toggle"))}</button>`);
      },
      validate() {
        const miss = [];
        if (!String(get("m1_name") || "").trim()) miss.push("m1_name");
        if (String(get("m1_rule") || "").trim().length < 10) miss.push("m1_rule");
        if (!(get("m1_where") || []).length) miss.push("m1_where");
        if (!String(get("m1_count") || "").trim()) miss.push("m1_count");
        if (!String(get("m1_why") || "").trim()) miss.push("m1_why");
        if (get("m1_erase") === undefined) miss.push("m1_erase");
        // candidate 2: if anything is filled, at least name it
        const any2 = ["m2_rule", "m2_count", "m2_why", "m2_fix", "m2_example"].some((id) => String(get(id) || "").trim()) || (get("m2_where") || []).length || get("m2_erase") !== undefined;
        if (any2 && !String(get("m2_name") || "").trim()) miss.push("m2_name");
        return miss;
      },
    });

    // conditional: only if code_exposure is 자주(0)/몇 번(1)
    pages.push({
      id: "s5b",
      cond: () => get("code_exposure") === 0 || get("code_exposure") === 1,
      render() {
        return `<h2>${esc(t("s5b_heading"))}</h2><p>${esc(t("s5b_intro"))}</p>` +
          textarea("b_code", { label: t("b_code_q"), minlen: 10, rows: 3 }) +
          checks("b_seen", t("b_seen_opts"), { label: t("b_seen_q") }) +
          textarea("b_only", { req: false, label: t("b_only_q"), rows: 2 });
      },
      validate() {
        const miss = [];
        if (String(get("b_code") || "").trim().length < 10) miss.push("b_code");
        if (!(get("b_seen") || []).length) miss.push("b_seen");
        return miss;
      },
    });

    pages.push({
      id: "s6",
      render() {
        return `<h2>${esc(t("s6_heading"))}</h2><p>${esc(t("s6_intro"))}</p>` +
          textarea("q_unverbal", { label: t("unverbal_q"), note: t("unverbal_note"), minlen: 2, rows: 3 }) +
          textarea("q_askedfix", { req: false, label: t("askedfix_q"), rows: 2 }) +
          radios("q_bottleneck", t("bottleneck_opts"), { label: t("bottleneck_q") }) +
          textarea("q_converge", { req: false, label: t("converge_q"), rows: 2 }) +
          textinput("q_ai_ok", { label: t("ai_ok_q") }) +
          textinput("q_human_must", { label: t("human_must_q") });
      },
      validate() {
        const miss = [];
        if (!String(get("q_unverbal") || "").trim()) miss.push("q_unverbal");
        if (get("q_bottleneck") === undefined) miss.push("q_bottleneck");
        if (!String(get("q_ai_ok") || "").trim()) miss.push("q_ai_ok");
        if (!String(get("q_human_must") || "").trim()) miss.push("q_human_must");
        return miss;
      },
    });

    pages.push({
      id: "s7",
      render() {
        const uploadBlock = CFG.ENDPOINT
          ? `<div class="q" data-q="upload">${qhead(fmt(t("upload_q"), { max: CFG.MAX_FILES, mb: CFG.MAX_FILE_MB }), false, t("upload_note"))}
              <input type="file" id="file_input" accept="image/*" multiple style="display:none">
              <button type="button" class="ghost-btn" id="file_pick">${esc(t("upload_pick"))}</button>
              <button type="button" class="ghost-btn" id="file_clear" ${state.files.length ? "" : "style='display:none'"}>${esc(t("upload_clear"))}</button>
              <div id="file_list" class="file-list">${state.files.map((f) => esc(f.name)).join("<br>")}</div>
              <div class="q-err"></div></div>`
          : "";
        return `<h2>${esc(t("s7_heading"))}</h2>` +
          uploadBlock +
          radios("next_round", t("next_round_opts"), { req: false, label: t("next_round_q") }) +
          textinput("email", { label: t("email_q"), note: t("email_note"), type: "email" }) +
          radios("ack", t("ack_opts"), { label: t("ack_q") }) +
          `<div id="ack_name_wrap" ${get("ack") === 0 ? "" : "style='display:none'"}>` +
          textinput("ack_name", { req: false, label: t("ack_name_q") }) + `</div>` +
          radios("notify", t("notify_opts"), { req: false, label: t("notify_q") }) +
          textarea("comments", { req: false, label: t("comments_q"), rows: 2 });
      },
      validate() {
        const miss = [];
        const em = String(get("email") || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) miss.push("email");
        if (get("ack") === undefined) miss.push("ack");
        if (get("ack") === 0 && !String(get("ack_name") || "").trim()) miss.push("ack_name");
        return miss;
      },
      nextLabel: () => t("nav_submit"),
    });

    return pages.filter((p) => !p.cond || p.cond());
  }

  // ---------- rendering & navigation ----------
  function currentPages() { return buildPages(); }

  function render() {
    const pages = currentPages();
    if (state.pageIdx >= pages.length) { renderDone(); return; }
    const page = pages[state.pageIdx];
    const total = pages.length;
    const pct = Math.round((state.pageIdx / total) * 100);
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent = t("progress") + " " + pct + "%";
    document.title = t("app_title");

    let html = page.render();
    $("#page").innerHTML = html;
    window.scrollTo(0, 0);

    // nav buttons — back is hidden entirely once the free-recall page is left (S2b lock)
    $("#btn-back").style.display = state.pageIdx > 0 && !state.locked ? "" : "none";
    $("#lock-note").style.display = state.locked && state.pageIdx > 0 && !state.submitted ? "" : "none";
    $("#lock-note").textContent = t("nav_locked");
    $("#btn-next").textContent = page.nextLabel ? page.nextLabel() : t("nav_next");
    $("#btn-next").disabled = false;

    attachHandlers(page);
    pageShownAt = Date.now();
  }

  function attachHandlers(page) {
    const root = $("#page");
    root.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.name && !el.id) return;
      if (el.type === "radio") {
        A(el.name, parseInt(el.value, 10));
        // show/hide "other" input
        const other = document.getElementById(el.name + "_other");
        if (other) other.style.display = otherVisible(el.name) ? "" : "none";
        if (el.name === "ack") {
          const w = document.getElementById("ack_name_wrap");
          if (w) w.style.display = get("ack") === 0 ? "" : "none";
        }
      } else if (el.type === "checkbox" && el.name) {
        const q = el.closest(".q");
        const max = q ? parseInt(q.dataset.max || "0", 10) : 0;
        let cur = (get(el.name) || []).slice();
        const v = parseInt(el.value, 10);
        if (isNaN(v)) { // consent-style single checkbox
          A(el.name, el.checked ? 1 : "");
          return;
        }
        if (el.checked) { if (!cur.includes(v)) cur.push(v); } else { cur = cur.filter((x) => x !== v); }
        if (max && cur.length > max) { el.checked = false; cur = cur.filter((x) => x !== v); showErr(q, t("err_max2")); }
        A(el.name, cur.length ? cur.sort((a, b) => a - b) : "");
        const other = document.getElementById(el.name + "_other");
        if (other) {
          const idx = otherIndexOf(el.name);
          other.style.display = (get(el.name) || []).includes(idx) ? "" : "none";
        }
      } else if (el.tagName === "TEXTAREA" || el.type === "text" || el.type === "email") {
        A(el.id, el.value);
        // free-recall: reveal verb rows for filled patterns
        if (/^r_p[23]$/.test(el.id)) {
          const n = el.id.slice(-1);
          const row = document.getElementById("verbrow_" + n);
          if (row) row.style.display = el.value.trim() ? "" : "none";
        }
      }
    });

    const cand2 = document.getElementById("cand2_toggle");
    if (cand2) cand2.addEventListener("click", () => { state.cand2Open = true; save(); render(); });

    const pick = document.getElementById("file_pick");
    if (pick) {
      const input = document.getElementById("file_input");
      pick.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        const files = Array.from(input.files).slice(0, CFG.MAX_FILES);
        state.files = [];
        let pending = files.length;
        files.forEach((f) => {
          if (f.size > CFG.MAX_FILE_MB * 1024 * 1024) {
            showErr(pick.closest(".q"), fmt(t("upload_toobig"), { mb: CFG.MAX_FILE_MB }));
            pending--; refreshFiles(); return;
          }
          const r = new FileReader();
          r.onload = () => { state.files.push({ name: f.name, type: f.type, dataUrl: r.result }); if (--pending === 0) refreshFiles(); };
          r.readAsDataURL(f);
        });
      });
      const clear = document.getElementById("file_clear");
      clear.addEventListener("click", () => { state.files = []; refreshFiles(); });
      function refreshFiles() {
        document.getElementById("file_list").innerHTML = state.files.map((f) => esc(f.name)).join("<br>");
        document.getElementById("file_clear").style.display = state.files.length ? "" : "none";
      }
    }
  }
  function otherVisible(name) {
    const idxMap = { role: 6, field: 7, d_context: 4 };
    return idxMap[name] !== undefined && get(name) === idxMap[name];
  }
  function otherIndexOf(name) {
    const idxMap = { ai_tools: 7, d_context: 4 };
    return idxMap[name] !== undefined ? idxMap[name] : -1;
  }
  function showErr(qEl, msg) {
    if (!qEl) return;
    const err = qEl.querySelector(".q-err");
    if (err) { err.textContent = msg; qEl.classList.add("has-err"); }
  }
  function clearErrs() {
    document.querySelectorAll(".q-err").forEach((e) => (e.textContent = ""));
    document.querySelectorAll(".has-err").forEach((e) => e.classList.remove("has-err"));
  }

  function next() {
    const pages = currentPages();
    const page = pages[state.pageIdx];
    clearErrs();
    const miss = page.validate ? page.validate() : [];
    if (miss.length) {
      miss.forEach((id) => {
        const byId = document.getElementById(id);
        const q = document.querySelector(`[data-q="${id}"]`) || (byId ? byId.closest(".q") : null);
        if (q) {
          const minlen = parseInt(q.dataset.minlen || "0", 10);
          const isMin = minlen && String(get(id) || "").trim().length > 0 && String(get(id) || "").trim().length < minlen;
          showErr(q, id === "email" && get("email") ? t("err_email") : isMin ? fmt(t("err_minlen"), { n: minlen }) : t("err_required"));
        }
      });
      const first = document.querySelector(".has-err");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // record dwell time
    state.meta.pageTimesMs[page.id] = (state.meta.pageTimesMs[page.id] || 0) + (Date.now() - pageShownAt);
    if (page.onLeave) page.onLeave();
    if (!state.meta.startedAt) state.meta.startedAt = new Date().toISOString();

    if (state.pageIdx === pages.length - 1) { submit(); return; }
    state.pageIdx++;
    save();
    render();
  }
  function back() {
    if (state.locked || state.pageIdx === 0) return;
    const pages = currentPages();
    const page = pages[state.pageIdx];
    state.meta.pageTimesMs[page.id] = (state.meta.pageTimesMs[page.id] || 0) + (Date.now() - pageShownAt);
    state.pageIdx--;
    save();
    render();
  }

  // ---------- submit ----------
  function payload() {
    return {
      version: CFG.VERSION,
      lang: state.lang,
      src: state.meta.src,
      ua: state.meta.ua,
      screen: state.meta.screen,
      startedAt: state.meta.startedAt,
      submittedAt: new Date().toISOString(),
      pageTimesMs: state.meta.pageTimesMs,
      cardOrder: state.meta.cardOrder,
      honeypot: document.getElementById("hp_website") ? document.getElementById("hp_website").value : (state.answers._hp || ""),
      answers: state.answers,
      files: state.files,
    };
  }
  async function submit() {
    const btn = $("#btn-next");
    btn.disabled = true;
    btn.textContent = t("submitting");
    const data = payload();
    if (!CFG.ENDPOINT) { fallback(data, fmt(t("submit_no_endpoint"), { email: CFG.CONTACT_EMAIL })); return; }
    try {
      const res = await fetch(CFG.ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight for Apps Script
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) throw new Error("bad response");
      state.submitted = true;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { }
      renderDone();
    } catch (e) {
      fallback(data, fmt(t("submit_fail"), { email: CFG.CONTACT_EMAIL }), true);
    }
  }
  function fallback(data, msg, retry) {
    $("#page").insertAdjacentHTML("beforeend",
      `<div class="submit-fallback"><p>${esc(msg)}</p><button type="button" class="ghost-btn" id="dl_json">${esc(t("submit_download"))}</button></div>`);
    document.getElementById("dl_json").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mold_survey_response.json";
      a.click();
    });
    const btn = $("#btn-next");
    btn.disabled = false;
    btn.textContent = t("nav_submit");
  }
  function renderDone() {
    state.submitted = true;
    $("#progress-fill").style.width = "100%";
    $("#progress-text").textContent = t("progress") + " 100%";
    $("#btn-back").style.display = "none";
    $("#btn-next").style.display = "none";
    $("#lock-note").style.display = "none";
    $("#page").innerHTML = `<h1>${esc(t("done_heading"))}</h1>
      <p>${esc(t("done_p1"))}</p>
      <p>${esc(t("done_p2"))}<a href="${esc(CFG.DEMO_URL)}" target="_blank" rel="noopener">${esc(CFG.DEMO_URL)}</a></p>
      <p>${esc(t("done_p3"))}</p>`;
    window.removeEventListener("beforeunload", warnUnload);
  }

  function warnUnload(e) {
    if (!state.submitted && state.pageIdx > 0) { e.preventDefault(); e.returnValue = ""; }
  }

  // ---------- boot ----------
  function setLang(lang) {
    state.lang = lang;
    save();
    document.documentElement.lang = lang;
    document.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
    render();
  }
  window.addEventListener("DOMContentLoaded", () => {
    const resumed = restore();
    if (!state.lang) state.lang = detectLang();
    document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
    $("#btn-next").addEventListener("click", next);
    $("#btn-back").addEventListener("click", back);
    window.addEventListener("beforeunload", warnUnload);
    setLang(state.lang);
    if (resumed && !state.submitted) {
      const bar = document.createElement("div");
      bar.className = "resume-bar";
      bar.innerHTML = `<span>${esc(t("resume_notice"))}</span> <button type="button" id="discard">${esc(t("resume_discard"))}</button>`;
      document.body.insertBefore(bar, document.body.firstChild);
      document.getElementById("discard").addEventListener("click", () => {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { }
        location.reload();
      });
    }
  });
})();
