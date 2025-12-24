(() => {
  const STORAGE_KEY = "prompt-library.prompts";
  const USER_RATINGS_KEY = "prompt-library.userRatings";

  const form = document.getElementById("promptForm");
  const titleInput = document.getElementById("promptTitle");
  const contentInput = document.getElementById("promptContent");
  const listEl = document.getElementById("promptList");

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

    for (const prompt of prompts) {
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

      listEl.appendChild(card);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) return;

    const prompts = loadPrompts();
    prompts.unshift({
      id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
      title,
      content,
      ratings: { average: 0, count: 0 }
    });

    savePrompts(prompts);

    form.reset();
    titleInput.focus();

    render();
  });

  render();
})();
