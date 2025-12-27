(() => {
  const STORAGE_KEY = "prompt-library.prompts";
  const USER_RATINGS_KEY = "prompt-library.userRatings";
  const NOTES_KEY = "prompt-library.notes";

  const form = document.getElementById("promptForm");
  const titleInput = document.getElementById("promptTitle");
  const contentInput = document.getElementById("promptContent");
  const listEl = document.getElementById("promptList");
  const modelInput = document.getElementById("modelName");
  const formErrorEl = document.getElementById("formError");

  // Metadata & Validation
  function isValidISO8601(str) {
    if (typeof str !== "string" || !str) return false;
    try {
      const d = new Date(str);
      return d.toISOString() === str && /Z$/.test(str);
    } catch {
      return false;
    }
  }

  function isLikelyCode(text) {
    const t = String(text || "");
    const patterns = [
      /\bfunction\b|\bclass\b|=>|import\s+|export\s+|const\s+|let\s+|var\s+/, 
      /#include|using\s+namespace|public\s+static|System\./,
      /\bdef\b|\breturn\b|:\n|\{\s*\}|;|<[^>]+>/
    ];
    return patterns.some((re) => re.test(t));
  }

  function estimateTokens(text, isCode) {
    const s = String(text || "").trim();
    const words = s ? s.split(/\s+/).filter(Boolean).length : 0;
    const chars = s.length;
    let min = 0.75 * words;
    let max = 0.25 * chars;
    if (isCode) {
      min *= 1.3;
      max *= 1.3;
    }
    min = Math.round(min);
    max = Math.round(max);
    const upper = Math.max(min, max);
    let confidence = "high";
    if (upper >= 1000 && upper <= 5000) confidence = "medium";
    else if (upper > 5000) confidence = "low";
    return { min, max, confidence };
  }

  function trackModel(modelName, content) {
    const name = typeof modelName === "string" ? modelName.trim() : "";
    if (!name) throw new Error("Model name must be a non-empty string.");
    if (name.length > 100) throw new Error("Model name must be at most 100 characters.");

    const createdAt = new Date().toISOString();
    const tokenEstimate = estimateTokens(content, isLikelyCode(content));
    const updatedAt = createdAt;
    return { model: name, createdAt, updatedAt, tokenEstimate };
  }

  function updateTimestamps(metadata) {
    if (!metadata || typeof metadata !== "object") {
      throw new Error("Metadata must be an object.");
    }
    const { createdAt } = metadata;
    if (!isValidISO8601(createdAt)) {
      throw new Error("createdAt must be a valid ISO 8601 string.");
    }
    const nowIso = new Date().toISOString();
    if (!isValidISO8601(nowIso)) {
      throw new Error("updatedAt must be a valid ISO 8601 string.");
    }
    const createdMs = Date.parse(createdAt);
    const updatedMs = Date.parse(nowIso);
    if (!(updatedMs >= createdMs)) {
      throw new Error("updatedAt must be greater than or equal to createdAt.");
    }
    return { ...metadata, updatedAt: nowIso };
  }

  function bumpPromptUpdatedAt(promptId) {
    try {
      const prompts = loadPrompts();
      const idx = prompts.findIndex((p) => p.id === promptId);
      if (idx === -1) return;
      const meta = prompts[idx].metadata;
      if (meta) {
        prompts[idx].metadata = updateTimestamps(meta);
        savePrompts(prompts);
      }
    } catch (err) {
      console.error("Failed to update prompt timestamp:", err);
    }
  }

  // Notes store helpers
  function loadNotesStore() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveNotesStore(store) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(store));
  }

  function getNotes(promptId) {
    const store = loadNotesStore();
    const arr = Array.isArray(store[promptId]) ? store[promptId] : [];
    // newest first by updatedAt (fallback to createdAt)
    return [...arr].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }

  function setNotes(promptId, notesArray) {
    const store = loadNotesStore();
    store[promptId] = notesArray;
    saveNotesStore(store);
  }

  function loadPrompts() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((p) => ({
        ...p,
        ratings: p.ratings && typeof p.ratings.average === "number" && typeof p.ratings.count === "number"
          ? p.ratings
          : { average: 0, count: 0 }
      }));
    } catch {
      return [];
    }
  }

  function savePrompts(prompts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  }

  function loadUserRatings() {
    try {
      const raw = localStorage.getItem(USER_RATINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveUserRatings(map) {
    localStorage.setItem(USER_RATINGS_KEY, JSON.stringify(map));
  }

  function roundTo(n, dp) {
    const f = Math.pow(10, dp || 1);
    return Math.round(n * f) / f;
  }

  function applyRatingUpdate(aggregate, oldRating, newRating) {
    let average = aggregate.average || 0;
    let count = aggregate.count || 0;
    if (!count && !oldRating) {
      return { average: newRating, count: 1 };
    }
    if (oldRating) {
      const sum = average * count;
      const nextAvg = (sum - oldRating + newRating) / count;
      return { average: roundTo(nextAvg, 1), count };
    }
    const sum = average * count;
    const nextAvg = (sum + newRating) / (count + 1);
    return { average: roundTo(nextAvg, 1), count: count + 1 };
  }

  function renderStars(value, interactive) {
    const container = document.createElement("div");
    container.className = "stars";
    if (interactive) {
      container.setAttribute("role", "slider");
      container.setAttribute("aria-valuemin", "1");
      container.setAttribute("aria-valuemax", "5");
      container.tabIndex = 0;
    } else {
      container.setAttribute("role", "img");
    }
    container.setAttribute("aria-label", "Rating");
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "star";
      btn.dataset.value = String(i);
      btn.textContent = i <= Math.round(value) ? "★" : "☆";
      if (!interactive) btn.disabled = true;
      container.appendChild(btn);
    }
    return container;
  }

  function formatRatingMeta(ratings) {
    if (!ratings.count) return "No ratings yet";
    const s = ratings.count === 1 ? "rating" : "ratings";
    return String(ratings.average.toFixed(1)) + " • " + String(ratings.count) + " " + s;
  }

  function mountRating(prompt, containerEl) {
    const userRatings = loadUserRatings();
    const userRating = userRatings[prompt.id] || 0;

    const wrap = document.createElement("div");
    wrap.className = "rating";

    const stars = renderStars(userRating || Math.round(prompt.ratings.average || 0), true);
    stars.dataset.promptId = prompt.id;

    const meta = document.createElement("div");
    meta.className = "ratingMeta";
    meta.textContent = formatRatingMeta(prompt.ratings);

    wrap.appendChild(stars);
    wrap.appendChild(meta);

    attachRatingHandlers(stars, meta, prompt);
    containerEl.appendChild(wrap);
  }

  function updateStarsVisual(starsEl, value) {
    const nodes = starsEl.querySelectorAll(".star");
    nodes.forEach((el) => {
      const v = Number(el.dataset.value);
      el.textContent = v <= value ? "★" : "☆";
      el.classList.toggle("highlight", v <= value);
    });
    starsEl.setAttribute("aria-valuenow", String(value));
  }

  function handleSetRating(prompt, newRating, starsEl, metaEl) {
    const map = loadUserRatings();
    const oldRating = map[prompt.id];
    const nextAgg = applyRatingUpdate(prompt.ratings, oldRating, newRating);
    prompt.ratings = nextAgg;
    map[prompt.id] = newRating;
    saveUserRatings(map);

    const prompts = loadPrompts().map((p) => (p.id === prompt.id ? { ...p, ratings: nextAgg } : p));
    savePrompts(prompts);
    bumpPromptUpdatedAt(prompt.id);

    updateStarsVisual(starsEl, newRating);
    metaEl.textContent = formatRatingMeta(nextAgg);
  }

  function attachRatingHandlers(starsEl, metaEl, prompt) {
    starsEl.addEventListener("mouseover", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".star") : null;
      if (!btn) return;
      updateStarsVisual(starsEl, Number(btn.dataset.value));
    });
    starsEl.addEventListener("mouseleave", () => {
      const map = loadUserRatings();
      const current = map[prompt.id] || Math.round(prompt.ratings.average || 0) || 0;
      updateStarsVisual(starsEl, current);
    });
    starsEl.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".star") : null;
      if (!btn) return;
      const value = Number(btn.dataset.value);
      handleSetRating(prompt, value, starsEl, metaEl);
    });
    starsEl.addEventListener("keydown", (e) => {
      const map = loadUserRatings();
      const current = map[prompt.id] || 0;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(5, (current || 0) + 1);
        updateStarsVisual(starsEl, next);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(1, (current || 1) - 1);
        updateStarsVisual(starsEl, prev);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const active = starsEl.querySelector(".star.highlight:last-of-type");
        const value = active ? Number(active.dataset.value) : Math.max(1, current || 1);
        handleSetRating(prompt, value, starsEl, metaEl);
      }
    });
    const initial = loadUserRatings()[prompt.id] || Math.round(prompt.ratings.average || 0) || 0;
    updateStarsVisual(starsEl, initial);
  }

  function getPreview(text, maxWords = 12) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(" ");
    return words.slice(0, maxWords).join(" ") + "…";
  }

  function render() {
    const prompts = loadPrompts();

    if (prompts.length === 0) {
      listEl.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No prompts saved yet.";
      listEl.appendChild(empty);
      return;
    }

    listEl.innerHTML = "";

    const sorted = [...prompts].sort((a, b) => {
      const aTime = a.metadata && a.metadata.createdAt ? Date.parse(a.metadata.createdAt) : 0;
      const bTime = b.metadata && b.metadata.createdAt ? Date.parse(b.metadata.createdAt) : 0;
      return bTime - aTime;
    });

    for (const prompt of sorted) {
      const card = document.createElement("article");
      card.className = "card";

      const header = document.createElement("div");
      header.className = "cardHeader";

      const h3 = document.createElement("h3");
      h3.className = "cardTitle";
      h3.textContent = prompt.title;

      const del = document.createElement("button");
      del.className = "deleteButton";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const next = loadPrompts().filter((p) => p.id !== prompt.id);
        savePrompts(next);
        const map = loadUserRatings();
        if (map[prompt.id]) {
          delete map[prompt.id];
          saveUserRatings(map);
        }
        // remove any notes for this prompt
        const notesStore = loadNotesStore();
        if (notesStore[prompt.id]) {
          delete notesStore[prompt.id];
          saveNotesStore(notesStore);
        }
        render();
      });

      header.appendChild(h3);
      header.appendChild(del);

      const preview = document.createElement("p");
      preview.className = "preview";
      preview.textContent = getPreview(prompt.content);

      card.appendChild(header);
      card.appendChild(preview);

      mountRating(prompt, card);

      // Metadata section
      mountMetadata(prompt, card);

      // Notes section
      mountNotes(prompt, card);

      listEl.appendChild(card);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = titleInput.value.trim();
    const model = modelInput.value.trim();
    const content = contentInput.value.trim();

    if (formErrorEl) formErrorEl.textContent = "";
    if (!title || !content) return;

    let metadata;
    try {
      metadata = trackModel(model, content);
    } catch (err) {
      if (formErrorEl) {
        formErrorEl.textContent = err && err.message ? err.message : "Failed to create metadata.";
      }
      return;
    }

    const prompts = loadPrompts();
    prompts.unshift({
      id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
      title,
      content,
      ratings: { average: 0, count: 0 },
      metadata
    });

    savePrompts(prompts);

    form.reset();
    titleInput.focus();

    render();
  });

  render();
  
  // Notes UI & logic
  function mountNotes(prompt, containerEl) {
    const section = document.createElement("section");
    section.className = "notes";
    section.dataset.promptId = prompt.id;

    const title = document.createElement("h4");
    title.className = "notesTitle";
    title.textContent = "Notes";
    title.id = `notes-title-${prompt.id}`;
    section.setAttribute("aria-labelledby", title.id);

    const addWrap = document.createElement("div");
    addWrap.className = "notesAdd";

    const textarea = document.createElement("textarea");
    textarea.className = "notesTextarea";
    textarea.rows = 3;
    textarea.placeholder = "Add a note...";
    textarea.setAttribute("aria-label", "Add note");

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "button notesAddButton";
    addBtn.textContent = "Add Note";
    addBtn.setAttribute("aria-label", "Add note");

    addWrap.appendChild(textarea);
    addWrap.appendChild(addBtn);

    const list = document.createElement("ul");
    list.className = "notesList";

    section.appendChild(title);
    section.appendChild(addWrap);
    section.appendChild(list);

    containerEl.appendChild(section);

    renderNotesList(prompt.id, list);

    // Event delegation for notes actions within this section
    section.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      // Add note
      if (target.closest(".notesAddButton")) {
        const text = textarea.value.trim();
        if (!text) return;
        const now = Date.now();
        const newNote = {
          id: String(now) + "-" + Math.random().toString(16).slice(2),
          promptId: prompt.id,
          content: text,
          createdAt: now,
          updatedAt: now
        };
        const current = getNotes(prompt.id);
        current.unshift(newNote);
        setNotes(prompt.id, current);
        textarea.value = "";
        renderNotesList(prompt.id, list);
        bumpPromptUpdatedAt(prompt.id);
        return;
      }

      // Row-level actions
      const item = target.closest(".noteItem");
      if (!item) return;
      const noteId = item.getAttribute("data-note-id");
      if (!noteId) return;

      if (target.closest(".noteEdit")) {
        enterEditMode(item);
        return;
      }
      if (target.closest(".noteCancel")) {
        exitEditMode(item, false);
        return;
      }
      if (target.closest(".noteSave")) {
        const ta = item.querySelector(".noteEditTextarea");
        const val = ta && ta.value ? ta.value.trim() : "";
        if (!val) {
          // empty after trim: treat as no-op
          exitEditMode(item, false);
          return;
        }
        const notes = getNotes(prompt.id);
        const idx = notes.findIndex((n) => n.id === noteId);
        if (idx !== -1) {
          notes[idx] = { ...notes[idx], content: val, updatedAt: Date.now() };
          setNotes(prompt.id, notes);
        }
        renderNotesList(prompt.id, list);
        bumpPromptUpdatedAt(prompt.id);
        return;
      }
      if (target.closest(".noteDelete")) {
        const notes = getNotes(prompt.id).filter((n) => n.id !== noteId);
        setNotes(prompt.id, notes);
        renderNotesList(prompt.id, list);
        bumpPromptUpdatedAt(prompt.id);
        return;
      }
    });
  }

  function renderNotesList(promptId, listEl) {
    const notes = getNotes(promptId);
    listEl.innerHTML = "";
    if (notes.length === 0) {
      const empty = document.createElement("li");
      empty.className = "noteEmpty";
      empty.textContent = "No notes yet.";
      listEl.appendChild(empty);
      return;
    }
    for (const note of notes) {
      const li = document.createElement("li");
      li.className = "noteItem";
      li.setAttribute("data-note-id", note.id);

      const text = document.createElement("p");
      text.className = "noteText";
      text.textContent = note.content;

      const actions = document.createElement("div");
      actions.className = "noteActions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "noteBtn noteEdit";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("aria-label", "Edit note");

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "deleteButton noteDelete";
      delBtn.textContent = "Delete";
      delBtn.setAttribute("aria-label", "Delete note");

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(text);
      li.appendChild(actions);
      listEl.appendChild(li);
    }
  }

  function enterEditMode(itemEl) {
    const textEl = itemEl.querySelector(".noteText");
    if (!textEl) return;
    const current = textEl.textContent || "";
    const ta = document.createElement("textarea");
    ta.className = "noteEditTextarea";
    ta.rows = 3;
    ta.value = current;

    const actions = itemEl.querySelector(".noteActions");
    if (!actions) return;
    actions.innerHTML = "";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "button noteSave";
    saveBtn.textContent = "Save";
    saveBtn.setAttribute("aria-label", "Save note");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "noteBtn noteCancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.setAttribute("aria-label", "Cancel edit");

    textEl.replaceWith(ta);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    ta.focus();
  }

  function exitEditMode(itemEl, reRender) {
    // Caller usually re-renders the list; this is a no-op helper.
    if (reRender) {
      const section = itemEl.closest(".notes");
      if (!section) return;
      const promptId = section.dataset.promptId;
      const list = section.querySelector(".notesList");
      if (promptId && list) renderNotesList(promptId, list);
    }
  }

  function mountMetadata(prompt, containerEl) {
    const meta = prompt.metadata || null;
    const section = document.createElement("section");
    section.className = "metadata";

    const modelRow = document.createElement("div");
    modelRow.className = "metaRow";
    const modelLabel = document.createElement("span");
    modelLabel.className = "metaLabel";
    modelLabel.textContent = "Model";
    const modelValue = document.createElement("span");
    modelValue.className = "metaValue";
    modelValue.textContent = meta && meta.model ? meta.model : "—";
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(modelValue);

    const createdRow = document.createElement("div");
    createdRow.className = "metaRow";
    const createdLabel = document.createElement("span");
    createdLabel.className = "metaLabel";
    createdLabel.textContent = "Created";
    const createdValue = document.createElement("span");
    createdValue.className = "metaValue";
    createdValue.textContent = meta && meta.createdAt ? new Date(meta.createdAt).toLocaleString() : "—";
    createdRow.appendChild(createdLabel);
    createdRow.appendChild(createdValue);

    const updatedRow = document.createElement("div");
    updatedRow.className = "metaRow";
    const updatedLabel = document.createElement("span");
    updatedLabel.className = "metaLabel";
    updatedLabel.textContent = "Updated";
    const updatedValue = document.createElement("span");
    updatedValue.className = "metaValue";
    updatedValue.textContent = meta && meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "—";
    updatedRow.appendChild(updatedLabel);
    updatedRow.appendChild(updatedValue);

    const tokensRow = document.createElement("div");
    tokensRow.className = "metaRow";
    const tokensLabel = document.createElement("span");
    tokensLabel.className = "metaLabel";
    tokensLabel.textContent = "Token Estimate";
    const tokensValue = document.createElement("span");
    tokensValue.className = "metaValue";
    const est = meta && meta.tokenEstimate ? meta.tokenEstimate : null;
    const text = est ? `${est.min}–${est.max} tokens` : "—";
    const badge = document.createElement("span");
    badge.className = "confidence";
    const confidence = est ? est.confidence : "high";
    if (confidence === "high") badge.classList.add("confidence-high");
    else if (confidence === "medium") badge.classList.add("confidence-medium");
    else badge.classList.add("confidence-low");
    badge.textContent = confidence;
    tokensValue.textContent = text + " ";
    tokensValue.appendChild(badge);
    tokensRow.appendChild(tokensLabel);
    tokensRow.appendChild(tokensValue);

    section.appendChild(modelRow);
    section.appendChild(createdRow);
    section.appendChild(updatedRow);
    section.appendChild(tokensRow);
    containerEl.appendChild(section);
  }
})();
