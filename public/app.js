// CoconutAI Mini App — логіка фронтенду
// ЦЕЙ ФАЙЛ керує екранами та рецептам у самому Mini App

(function () {
  const tg = window.Telegram ? window.Telegram.WebApp : null;

  // ================== INIT TELEGRAM WEBAPP ==================
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.MainButton) tg.MainButton.hide();
    } catch (e) {
      console.warn("Telegram WebApp init error:", e);
    }
  }

  // ================== ЕКРАНИ ТА МЕНЮ ==================

  const cards = document.querySelectorAll("[data-action]");
  const screens = document.querySelectorAll(".screen");

  function setActiveScreen(name) {
    if (!screens.length) return;

    const wantedIds = new Set([name, `screen-${name}`]);

    screens.forEach((el) => {
      const id = el.id || "";
      const ds = el.dataset.screen || "";
      const isActive = wantedIds.has(id) || ds === name;

      if (isActive) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  // Клік по картках головного меню
  cards.forEach((card) => {
    const action = card.dataset.action;
    card.addEventListener("click", () => {
      if (!action) return;

      if (action === "recipes") {
        setActiveScreen("recipes");
        loadRecipesList();
      } else if (action === "grocery") {
        setActiveScreen("grocery");
      } else if (action === "tracker") {
        setActiveScreen("tracker");
      } else if (action === "settings") {
        setActiveScreen("settings");
      } else {
        console.log("Unknown action:", action);
      }

      if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) {
        tg.HapticFeedback.impactOccurred("light");
      }
    });
  });

  // ================== РОЗДІЛ "РЕЦЕПТИ" ==================

  const recipesScreen = document.getElementById("screen-recipes");
  let recipesListEl = null;
  let recipeDetailsEl = null;
  let recipeBackBtn = null;

  let recipesCache = null;
  let isLoadingList = false;
  let isLoadingOne = false;

  // Створюємо в середині екрану layout (список + деталі)
  function ensureRecipeLayout() {
    if (!recipesScreen) return;

    if (!recipesListEl || !recipeDetailsEl) {
      recipesScreen.innerHTML = `
        <div class="screen-card">
          <div class="screen-title-row">
            <h2>Рецепти</h2>
            <button class="small-pill" type="button" data-recipes-refresh>
              Оновити
            </button>
          </div>

          <p class="screen-subtitle">
            Обери корисний рецепт. Натисни на картку, щоб побачити деталі.
          </p>

          <div class="recipes-layout">
            <div class="recipes-list" data-recipes-list></div>

            <div class="recipe-details" data-recipe-details>
              <div class="recipe-details-empty">
                Обери рецепт зліва, щоб побачити опис та інгредієнти.
              </div>
            </div>
          </div>

          <button class="back-button" type="button" data-recipes-back>
            ← Назад до меню
          </button>
        </div>
      `;

      recipesListEl = recipesScreen.querySelector("[data-recipes-list]");
      recipeDetailsEl = recipesScreen.querySelector("[data-recipe-details]");
      recipeBackBtn = recipesScreen.querySelector("[data-recipes-back]");

      const refreshBtn = recipesScreen.querySelector("[data-recipes-refresh]");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
          recipesCache = null;
          loadRecipesList(true);
          if (
            tg &&
            tg.HapticFeedback &&
            tg.HapticFeedback.notificationOccurred
          ) {
            tg.HapticFeedback.notificationOccurred("success");
          }
        });
      }

      if (recipeBackBtn) {
        recipeBackBtn.addEventListener("click", () => {
          setActiveScreen("home");
        });
      }
    }
  }

  // Універсальна функція запиту JSON
  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  // Завантаження СПИСКУ рецептів
  async function loadRecipesList(force = false) {
    ensureRecipeLayout();
    if (!recipesListEl) return;
    if (isLoadingList) return;

    isLoadingList = true;
    recipesListEl.innerHTML =
      '<div class="mini-loader">Завантаження рецептів…</div>';

    try {
      if (!recipesCache || force) {
        const data = await fetchJson("/api/recipes");
        recipesCache = Array.isArray(data) ? data : [];
      }

      if (!recipesCache.length) {
        recipesListEl.innerHTML =
          '<div class="empty-state">Поки що немає рецептів</div>';
        return;
      }

      recipesListEl.innerHTML = recipesCache
        .map(
          (r) => `
          <button class="recipe-card" type="button" data-recipe-id="${String(
            r.id
          )}">
            ${
              r.image
                ? `<div class="recipe-thumb" style="background-image: url('${r.image}')"></div>`
                : `<div class="recipe-thumb recipe-thumb-empty">🥥</div>`
            }
            <div class="recipe-title">${r.title || "Без назви"}</div>
          </button>
        `
        )
        .join("");

      recipesListEl.querySelectorAll("[data-recipe-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-recipe-id");
          if (!id) return;
          openRecipeDetails(id);
        });
      });
    } catch (err) {
      console.error("Failed to load recipes list", err);
      recipesListEl.innerHTML = `
        <div class="error-state">
          Не вдалося завантажити рецепти. Спробуй ще раз пізніше.
        </div>
      `;
    } finally {
      isLoadingList = false;
    }
  }

  // Завантаження КОНКРЕТНОГО рецепта
  async function openRecipeDetails(id) {
    ensureRecipeLayout();
    if (!recipeDetailsEl) return;
    if (isLoadingOne) return;

    isLoadingOne = true;
    recipeDetailsEl.innerHTML =
      '<div class="mini-loader">Завантаження рецепта…</div>';

    try {
      const data = await fetchJson(
        `/api/recipes/${encodeURIComponent(id)}`
      );

      const ingredientsHtml = (data.ingredients || [])
        .map((i) => `<li>${i}</li>`)
        .join("");

      recipeDetailsEl.innerHTML = `
        <div class="recipe-details-inner">
          ${
            data.image
              ? `<div class="recipe-details-photo" style="background-image: url('${data.image}')"></div>`
              : ""
          }
          <h3>${data.title || "Без назви"}</h3>

          ${
            data.description
              ? `<p class="recipe-description">${data.description}</p>`
              : ""
          }

          ${
            ingredientsHtml
              ? `
            <h4>Інгредієнти</h4>
            <ul class="recipe-ingredients">
              ${ingredientsHtml}
            </ul>
          `
              : ""
          }

          ${
            data.instacartUrl
              ? `
            <a
              class="primary-link"
              href="${data.instacartUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Купити інгредієнти в Instacart
            </a>
          `
              : ""
          }
        </div>
      `;

      if (tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged) {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (err) {
      console.error("Failed to load recipe details", err);
      recipeDetailsEl.innerHTML = `
        <div class="error-state">
          Не вдалося завантажити рецепт. Спробуй пізніше.
        </div>
      `;
    } finally {
      isLoadingOne = false;
    }
  }

  // За замовчуванням відкриваємо головний екран
  setActiveScreen("home");
})();
