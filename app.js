/* mold_survey — sectioned wizard with a left stepper
 * - one section per page ("다음/뒤로"), card section paginated card-by-card (1/8 …)
 * - left sidebar stepper shows all sections + where you are; completed sections are clickable
 * - free-recall section becomes read-only once you move past it (soft no-priming guard)
 * - ko/en toggle (answers survive switching; ?lang=ko|en forces), ?src= cohort tagging
 * - conditional: review_count=0 hides "acted"; no code exposure removes the code section
 * - autosave to localStorage; POST to Apps Script endpoint or JSON-download fallback
 */
(function () {
  "use strict";
  const CFG = window.SURVEY_CONFIG;
  const STORE_KEY = "mold_survey_" + CFG.VERSION;

  let state = {
    lang: null,
    answers: {},
    files: [],
    stepId: "consent",
    sub: 0,
    visited: { consent: 0 }, // stepId -> max sub visited
    meta: {
      version: CFG.VERSION,
      src: new URLSearchParams(location.search).get("src") || "",
      ua: navigator.userAgent,
      screen: (window.screen ? window.screen.width + "x" + window.screen.height : ""),
      startedAt: null,
      recallLockedAt: null,
      cardOrder: null,
      pageTimesMs: {},
    },
    submitted: false,
  };
  let shownAt = Date.now();

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
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, files: [] })); } catch (e) { }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (s && s.meta && !s.submitted && Object.keys(s.answers || {}).length) {
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
  const RECALL_IDS = ["r_p1", "r_p2", "r_p3", "r_contrast"];

  // ---------- widgets ----------
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
  function textarea(id, { req = true, label, note, minlen = 0, rows = 3 } = {}) {
    return `<div class="q" data-q="${id}" data-minlen="${minlen}">` + qhead(label, req, note) +
      `<textarea id="${id}" rows="${rows}">${esc(get(id) || "")}</textarea><div class="q-err"></div></div>`;
  }
  function textinput(id, { req = true, label, note, type = "text" } = {}) {
    return `<div class="q" data-q="${id}">` + qhead(label, req, note) +
      `<input type="${type}" id="${id}" value="${esc(get(id) || "")}"><div class="q-err"></div></div>`;
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

  // ---------- steps ----------
  function steps() {
    state.meta.cardOrder = state.meta.cardOrder || shuffle(CARD_KEYS);
    const order = state.meta.cardOrder;
    const showActed = get("review_count") !== 0;
    const list = [];

    list.push({
      id: "consent", label: () => t("step_consent"), subCount: 1,
      render() {
        const R = CFG.REWARD[state.lang];
        const bullets = t("s0_bullets").map((b) => `<li>${esc(fmt(b, { minutes: CFG.MINUTES, base: R.base, prize: R.prize }))}</li>`).join("");
        return `<div class="logo-row">
            <img src="assets/logos/snu.png" alt="Seoul National University" class="inst-logo">
            <span class="logo-x">×</span>
            <img src="assets/logos/umn.png" alt="University of Minnesota" class="inst-logo">
          </div>
          <h1>${esc(t("s0_heading"))}</h1>
          <p>${esc(t("s0_p1"))}</p><p>${esc(t("s0_p2"))}</p>
          <ul class="bullets">${bullets}</ul>
          <p class="contact">${esc(fmt(t("s0_contact"), { email: CFG.CONTACT_EMAIL }))}</p>
          <input type="text" id="hp_website" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <div class="q" data-q="consent"><label class="opt consent"><input type="checkbox" name="consent" ${get("consent") ? "checked" : ""}> <span>${esc(t("s0_consent"))}</span></label><div class="q-err"></div></div>`;
      },
      validate() { return get("consent") ? [] : ["consent"]; },
      nextLabel: () => t("nav_start"),
    });

    list.push({
      id: "s1", label: () => t("step_s1"), subCount: 1,
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

    list.push({
      id: "s2a", label: () => t("step_s2a"), subCount: 1,
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

    list.push({
      id: "recall", label: () => t("step_recall"), subCount: 1,
      render() {
        const locked = !!state.meta.recallLockedAt;
        const verbRows = [1, 2, 3].map((n) => {
          const filled = n === 1 || String(get("r_p" + n) || "").trim().length > 0;
          return `<div class="verb-row" id="verbrow_${n}" ${filled ? "" : "style='display:none'"}>
            <div class="verb-lab">${esc(fmt(t("verb_label"), { n }))}</div>` + radiosBare("r_v" + n, t("verb_opts")) + `</div>`;
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
          `<div class="lock-warning ${locked ? "locked-note" : ""}" id="recall-lock-note">${esc(locked ? t("sp_recall_locked") : t("wz_recall_lock_warning"))}</div>`;
      },
      validate() {
        const miss = [];
        if (String(get("r_p1") || "").trim().length < 20) miss.push("r_p1");
        [1, 2, 3].forEach((n) => {
          const filled = n === 1 || String(get("r_p" + n) || "").trim().length > 0;
          if (filled && get("r_v" + n) === undefined && miss.indexOf("verb") < 0) miss.push("verb");
        });
        return miss;
      },
      onLeaveForward() {
        if (!state.meta.recallLockedAt) { state.meta.recallLockedAt = new Date().toISOString(); save(); }
      },
      afterRender() {
        if (state.meta.recallLockedAt) {
          RECALL_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.readOnly = true; el.classList.add("locked"); }
          });
          document.querySelectorAll('input[name^="r_v"]').forEach((el) => { el.disabled = true; });
        }
      },
    });

    list.push({
      id: "s3", label: () => t("step_s3"), subCount: 1,
      render() {
        return `<h2>${esc(t("s3_heading"))}</h2>
          <p>${esc(t("s3_p1"))}</p><p>${esc(t("s3_p2"))}</p><p>${esc(t("s3_p3"))}</p><p>${esc(t("s3_p4"))}</p>
          <p class="demo-link">${esc(t("s3_more"))}<a href="${esc(CFG.DEMO_URL)}" target="_blank" rel="noopener">${esc(CFG.DEMO_URL)}</a></p>`;
      },
      validate() { return []; },
    });

    list.push({
      id: "cards", label: () => t("step_cards"), subCount: 9, // 8 cards + wrap
      subLabel(sub) { return sub < 8 ? fmt(t("wz_card_sub"), { i: sub + 1, n: 8 }) : t("s4wrap_heading"); },
      render(sub) {
        if (sub < 8) {
          const key = order[sub];
          const card = t("cards")[key];
          const img = CARD_IMG[key];
          return `<h2>${esc(t("s4_heading"))}</h2>
            <div class="card-note">${esc(fmt(t("s4_note"), { i: sub + 1 }))}</div>
            <div class="mold-card ${img ? "" : "text-card"}">
              <h3>${esc(card.title)}</h3>
              ${img ? `<img src="${img}" alt="">` : ""}
              ${img && state.lang === "en" ? `<div class="img-caption">${esc(t("s4_img_caption"))}</div>` : ""}
              ${card.stat && (!img || state.lang === "en") ? `<div class="card-stat">${esc(card.stat)}</div>` : ""}
            </div>` +
            scale5("c_" + key + "_seen", { label: t("seen_q") }) +
            radios("c_" + key + "_named", t("named_opts"), { label: t("named_q") }) +
            (showActed ? radios("c_" + key + "_acted", t("acted_opts"), { label: t("acted_q") }) : "");
        }
        const titles = order.map((k) => t("cards")[k].title);
        return `<h2>${esc(t("s4wrap_heading"))}</h2>` +
          checks("w_top2", titles, { label: t("top2_q"), max: 2 }) +
          textarea("w_doubt", { label: t("doubt_q"), note: t("doubt_note"), rows: 3 });
      },
      validate(sub) {
        const miss = [];
        if (sub < 8) {
          const key = order[sub];
          if (get("c_" + key + "_seen") === undefined) miss.push("c_" + key + "_seen");
          if (get("c_" + key + "_named") === undefined) miss.push("c_" + key + "_named");
          if (showActed && get("c_" + key + "_acted") === undefined) miss.push("c_" + key + "_acted");
        } else {
          if (!(get("w_top2") || []).length) miss.push("w_top2");
          if (!String(get("w_doubt") || "").trim()) miss.push("w_doubt");
          state.answers.w_top2_keys = (get("w_top2") || []).map((i) => order[i]);
        }
        return miss;
      },
    });

    list.push({
      id: "s5", label: () => t("step_s5"), subCount: 1,
      render() {
        const R = CFG.REWARD[state.lang];
        return `<h2>${esc(t("s5_heading"))}</h2>
          <p>${esc(t("s5_intro"))}</p>
          <div class="prize-box">${esc(fmt(t("s5_prize"), { prize: R.prize })).replace(/\n/g, "<br>")}</div>
          <h3 class="cand-head">${esc(t("cand1_heading"))}</h3>` + candidateFields("m1", true) +
          `<h3 class="cand-head">${esc(t("cand2_heading"))}</h3>` + candidateFields("m2", false);
      },
      validate() {
        const miss = [];
        if (!String(get("m1_name") || "").trim()) miss.push("m1_name");
        if (String(get("m1_rule") || "").trim().length < 10) miss.push("m1_rule");
        if (!(get("m1_where") || []).length) miss.push("m1_where");
        if (!String(get("m1_count") || "").trim()) miss.push("m1_count");
        if (!String(get("m1_why") || "").trim()) miss.push("m1_why");
        if (get("m1_erase") === undefined) miss.push("m1_erase");
        const any2 = ["m2_rule", "m2_count", "m2_why", "m2_fix", "m2_example"].some((id) => String(get(id) || "").trim()) || (get("m2_where") || []).length || get("m2_erase") !== undefined;
        if (any2 && !String(get("m2_name") || "").trim()) miss.push("m2_name");
        return miss;
      },
    });

    if (get("code_exposure") === 0 || get("code_exposure") === 1) {
      list.push({
        id: "s5b", label: () => t("step_s5b"), subCount: 1,
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
    }

    list.push({
      id: "s6", label: () => t("step_s6"), subCount: 1,
      render() {
        return `<h2>${esc(t("s6_heading"))}</h2><p>${esc(t("s6_intro"))}</p>` +
          textarea("q_unverbal", { label: t("unverbal_q"), note: t("unverbal_note"), rows: 3 }) +
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

    list.push({
      id: "s7", label: () => t("step_s7"), subCount: 1,
      render() {
        const uploadBlock = CFG.ENDPOINT
          ? `<div class="q" data-q="upload">${qhead(fmt(t("upload_q"), { max: CFG.MAX_FILES, mb: CFG.MAX_FILE_MB }), false, t("upload_note"))}
              <input type="file" id="file_input" accept="image/*" multiple style="display:none">
              <button type="button" class="ghost-btn" id="file_pick">${esc(t("upload_pick"))}</button>
              <button type="button" class="ghost-btn" id="file_clear" ${state.files.length ? "" : "style='display:none'"}>${esc(t("upload_clear"))}</button>
              <div id="file_list" class="file-list">${state.files.map((f) => esc(f.name)).join("<br>")}</div>
              <div class="q-err"></div></div>`
          : "";
        return `<h2>${esc(t("s7_heading"))}</h2>` + uploadBlock +
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
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(get("email") || "").trim())) miss.push("email");
        if (get("ack") === undefined) miss.push("ack");
        if (get("ack") === 0 && !String(get("ack_name") || "").trim()) miss.push("ack_name");
        return miss;
      },
      nextLabel: () => t("nav_submit"),
    });

    return list;
  }
  const stepIndex = (list, id) => list.findIndex((s) => s.id === id);
  function furthestIndex(list) {
    let max = 0;
    for (const id in state.visited) {
      const i = stepIndex(list, id);
      if (i > max) max = i;
    }
    return max;
  }
  function unitPos(list) {
    let done = 0, total = 0, cur = 0;
    list.forEach((s, i) => {
      const idx = stepIndex(list, state.stepId);
      if (i < idx) done += s.subCount;
      if (i === idx) done += state.sub;
      total += s.subCount;
    });
    cur = done;
    return { cur, total };
  }

  // ---------- rendering ----------
  function render() {
    document.title = t("app_title");
    document.documentElement.lang = state.lang;
    document.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === state.lang));
    if (state.submitted) { renderDone(); return; }

    const list = steps();
    let idx = stepIndex(list, state.stepId);
    if (idx < 0) { state.stepId = list[0].id; state.sub = 0; idx = 0; } // e.g. s5b removed
    const step = list[idx];
    if (state.sub >= step.subCount) state.sub = step.subCount - 1;

    // record visit
    state.visited[step.id] = Math.max(state.visited[step.id] || 0, state.sub);

    // progress
    const { cur, total } = unitPos(list);
    const pct = Math.round((cur / total) * 100);
    $("#progress-fill").style.width = pct + "%";
    $("#mobile-step").textContent = fmt(t("wz_mobile_step"), { i: idx + 1, n: list.length }) + (step.subCount > 1 ? " · " + step.subLabel(state.sub) : "");

    // stepper sidebar
    const fi = furthestIndex(list);
    let side = "";
    list.forEach((s, i) => {
      const cls = i === idx ? "current" : i <= fi ? "done" : "todo";
      const clickable = i <= fi && i !== idx;
      const subTxt = i === idx && s.subCount > 1 ? `<span class="step-sub">${esc(s.subLabel(state.sub))}</span>` : "";
      side += `<button type="button" class="step ${cls}" data-step="${s.id}" ${clickable ? "" : "disabled"}>
        <span class="step-dot">${i < idx || (i <= fi && i !== idx) ? "✓" : i + 1}</span>
        <span class="step-lab">${esc(s.label())}${subTxt}</span></button>`;
    });
    $("#stepper").innerHTML = side;
    document.querySelectorAll(".step[data-step]").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        recordTime(step);
        state.stepId = b.dataset.step;
        state.sub = 0;
        save();
        render();
      });
    });

    // page
    $("#page").innerHTML = step.render(state.sub);
    if (step.afterRender) step.afterRender(state.sub);
    window.scrollTo(0, 0);

    $("#btn-back").style.display = (idx === 0 && state.sub === 0) ? "none" : "";
    $("#btn-back").textContent = t("nav_back");
    $("#btn-next").textContent = step.nextLabel ? step.nextLabel() : t("nav_next");
    $("#btn-next").disabled = false;
    $("#submit-err").textContent = "";

    attachHandlers();
    shownAt = Date.now();
  }

  function recordTime(step) {
    const key = step.id + (step.subCount > 1 ? "_" + state.sub : "");
    state.meta.pageTimesMs[key] = (state.meta.pageTimesMs[key] || 0) + (Date.now() - shownAt);
  }

  // ---------- events ----------
  function attachHandlers() {
    const root = $("#page");
    root.oninput = (e) => {  // assignment (not addEventListener): render() runs per page, avoid stacking listeners
      const el = e.target;
      if (!el.name && !el.id) return;
      if (!state.meta.startedAt) { state.meta.startedAt = new Date().toISOString(); save(); }

      const qBox = el.closest(".q");
      if (qBox) {
        qBox.classList.remove("has-err");
        const er = qBox.querySelector(".q-err");
        if (er) er.textContent = "";
      }

      if (el.type === "radio") {
        A(el.name, parseInt(el.value, 10));
        const other = document.getElementById(el.name + "_other");
        if (other) other.style.display = otherRadioVisible(el.name) ? "" : "none";
        if (el.name === "ack") {
          const w = document.getElementById("ack_name_wrap");
          if (w) w.style.display = get("ack") === 0 ? "" : "none";
        }
      } else if (el.type === "checkbox" && el.name) {
        const q = el.closest(".q");
        const max = q ? parseInt(q.dataset.max || "0", 10) : 0;
        const v = parseInt(el.value, 10);
        if (isNaN(v)) { A(el.name, el.checked ? 1 : ""); return; } // consent
        let cur = (get(el.name) || []).slice();
        if (el.checked) { if (!cur.includes(v)) cur.push(v); } else { cur = cur.filter((x) => x !== v); }
        if (max && cur.length > max) { el.checked = false; cur = cur.filter((x) => x !== v); showErr(q, t("err_max2")); }
        A(el.name, cur.length ? cur.sort((a, b) => a - b) : "");
        const other = document.getElementById(el.name + "_other");
        if (other) other.style.display = (get(el.name) || []).includes(otherCheckIndex(el.name)) ? "" : "none";
      } else if (el.tagName === "TEXTAREA" || el.type === "text" || el.type === "email") {
        A(el.id, el.value);
        if (/^r_p[23]$/.test(el.id)) {
          const n = el.id.slice(-1);
          const row = document.getElementById("verbrow_" + n);
          if (row) row.style.display = el.value.trim() ? "" : "none";
        }
      }
    };

    $("#btn-next").onclick = next;
    $("#btn-back").onclick = back;

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
            if (--pending === 0) refreshFiles();
            return;
          }
          const r = new FileReader();
          r.onload = () => { state.files.push({ name: f.name, type: f.type, dataUrl: r.result }); if (--pending === 0) refreshFiles(); };
          r.readAsDataURL(f);
        });
      });
      document.getElementById("file_clear").addEventListener("click", () => { state.files = []; refreshFiles(); });
      function refreshFiles() {
        document.getElementById("file_list").innerHTML = state.files.map((f) => esc(f.name)).join("<br>");
        document.getElementById("file_clear").style.display = state.files.length ? "" : "none";
      }
    }
  }
  function otherRadioVisible(name) {
    const idxMap = { role: 6, field: 7 };
    return idxMap[name] !== undefined && get(name) === idxMap[name];
  }
  function otherCheckIndex(name) {
    const idxMap = { ai_tools: 7, d_context: 4 };
    return idxMap[name] !== undefined ? idxMap[name] : -1;
  }
  function showErr(qEl, msg) {
    if (!qEl) return;
    const err = qEl.querySelector(".q-err");
    if (err) { err.textContent = msg; qEl.classList.add("has-err"); }
  }

  // ---------- navigation ----------
  function next() {
    const list = steps();
    const idx = stepIndex(list, state.stepId);
    const step = list[idx];
    const miss = step.validate ? step.validate(state.sub) : [];
    if (miss.length) {
      miss.forEach((id) => {
        const byId = document.getElementById(id);
        const q = document.querySelector(`[data-q="${id}"]`) || (byId ? byId.closest(".q") : null);
        if (q) {
          const minlen = parseInt(q.dataset.minlen || "0", 10);
          const cur = String(get(id) || "").trim();
          const isMin = minlen && cur.length > 0 && cur.length < minlen;
          showErr(q, id === "email" && get("email") ? t("err_email") : isMin ? fmt(t("err_minlen"), { n: minlen }) : t("err_required"));
        }
      });
      const first = document.querySelector(".has-err");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    recordTime(step);
    if (state.sub < step.subCount - 1) {
      state.sub++;
    } else if (idx === list.length - 1) {
      submit();
      return;
    } else {
      if (step.onLeaveForward) step.onLeaveForward();
      state.stepId = list[idx + 1].id;
      state.sub = 0;
    }
    save();
    render();
  }
  function back() {
    const list = steps();
    const idx = stepIndex(list, state.stepId);
    const step = list[idx];
    recordTime(step);
    if (state.sub > 0) {
      state.sub--;
    } else if (idx > 0) {
      state.stepId = list[idx - 1].id;
      state.sub = list[idx - 1].subCount - 1;
    }
    save();
    render();
  }

  // ---------- submit ----------
  function payload() {
    const hp = document.getElementById("hp_website");
    return {
      version: CFG.VERSION,
      lang: state.lang,
      src: state.meta.src,
      ua: state.meta.ua,
      screen: state.meta.screen,
      startedAt: state.meta.startedAt,
      submittedAt: new Date().toISOString(),
      recallLockedAt: state.meta.recallLockedAt,
      cardOrder: state.meta.cardOrder,
      pageTimesMs: state.meta.pageTimesMs,
      honeypot: hp ? hp.value : "",
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
      fallback(data, fmt(t("submit_fail"), { email: CFG.CONTACT_EMAIL }));
    }
  }
  function fallback(data, msg) {
    const old = document.getElementById("fallback-box");
    if (old) old.remove();
    $("#page").insertAdjacentHTML("beforeend",
      `<div class="submit-fallback" id="fallback-box"><p>${esc(msg)}</p><button type="button" class="ghost-btn" id="dl_json">${esc(t("submit_download"))}</button></div>`);
    document.getElementById("dl_json").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mold_survey_response.json";
      a.click();
    });
    document.getElementById("fallback-box").scrollIntoView({ behavior: "smooth", block: "center" });
    const btn = $("#btn-next");
    btn.disabled = false;
    btn.textContent = t("nav_submit");
  }
  function renderDone() {
    state.submitted = true;
    $("#progress-fill").style.width = "100%";
    $("#stepper").innerHTML = "";
    $("#mobile-step").textContent = "";
    $("#btn-back").style.display = "none";
    $("#btn-next").style.display = "none";
    $("#page").innerHTML = `<h1>${esc(t("done_heading"))}</h1>
      <p>${esc(t("done_p1"))}</p>
      <p>${esc(t("done_p2"))}<a href="${esc(CFG.DEMO_URL)}" target="_blank" rel="noopener">${esc(CFG.DEMO_URL)}</a></p>
      <p>${esc(t("done_p3"))}</p>`;
    window.scrollTo(0, 0);
    window.removeEventListener("beforeunload", warnUnload);
  }
  function warnUnload(e) {
    if (!state.submitted && state.meta.startedAt) { e.preventDefault(); e.returnValue = ""; }
  }

  // ---------- boot ----------
  function setLang(lang) {
    state.lang = lang;
    save();
    render();
  }
  window.addEventListener("DOMContentLoaded", () => {
    const resumed = restore();
    if (!state.lang) state.lang = detectLang();
    document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
    window.addEventListener("beforeunload", warnUnload);
    setLang(state.lang);
    if (resumed && !state.submitted) {
      const bar = document.createElement("div");
      bar.className = "resume-bar";
      bar.innerHTML = `<span>${esc(t("resume_notice"))}</span> <button type="button" id="discard">${esc(t("resume_discard"))}</button>`;
      document.body.insertBefore(bar, document.body.firstChild);
      document.getElementById("discard").addEventListener("click", () => {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { }
        location.href = location.pathname + location.search;
      });
    }
  });
})();
