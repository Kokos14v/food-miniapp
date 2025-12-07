// CoconutAI Mini App — фронтенд логіка (Reels для рецептів)

document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram ? window.Telegram.WebApp : null;

  // --------------- INIT TELEGRAM -----------------
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.MainButton) tg.MainButton.hide();
    } catch (e) {
      console.warn("Telegram WebApp init error:", e);
    }
  }

  // --------------- DOM ЕЛЕМЕНТИ ------------------

  const screens = {
    menu: document.getElementById("screen-menu"),
    recipes: document.getElementById("screen-recipes"),
    plan: document.getElementById("screen-plan"),
    analysis: document.getElementById("screen-analysis"),
    settings: document.getElementById("screen-settings"),
  };

  const cards = document.querySelectorAll("[data-action]");
  const backButtons = document.querySelectorAll("[data-back]");

  // Recipes DOM
  const recipesScreen = screens.recipes;
  const reelEl = document.getElementById("recipe-reel");
  const imageWrapEl = document.getElementById("recipe-image-wrap");
  const imageEl = document.getElementById("recipe-image");
  const imageFallbackEl = document.getElementById("recipe-image-fallback");
  const titleEl = document.getElementById("recipe-title");
  const counterEl = document.getElementById("recipe-counter");
  const descEl = document.getElementById("recipe-description");
  const ingredientsListEl = document.getElementById("recipe-ingredients-list");
  const refreshBtn = document.getElementById("recipes-refresh");
  const backTopBtn = document.getElementById("recipes-back-top");
  const backBottomBtn = document.getElementById("recipes-back");
  const prevBtn = document.getElementById("recipe-prev");
  const nextBtn = document.getElementById("recipe-next");
  const instacartBtn = document.getElementById("recipe-instacart");

  const loaderEl = document.getElementById("recipes-loader");
  const errorEl = document.getElementById("recipes-error");
  const emptyEl = document.getElementById("recipes-empty");

  // --------------- СТАН РЕЦЕПТІВ ------------------

  let recipesList = [];          // список з /api/recipes (id, title, image)
  const recipeCache = new Map(); // деталі з /api/recipes/:id
  let currentIndex = 0;
  let isLoadingList = false;
  let isLoadingRecipe = false;

  // --------------- УТИЛІТИ -----------------------

  function openScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle("active", key === name);
    });
  }

  function goMenu() {
    openScreen("menu");
  }

  function showLoader(show) {
    if (!loaderEl) return;
    loaderEl.classList.toggle("hidden", !show);
  }

  function showError(msg) {
    if (!errorEl) return;
    if (msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
    }
  }

  function showEmpty(show) {
    if (!emptyEl) return;
    emptyEl.classList.toggle("hidden", !show);
  }

  function updateCounter() {
    if (!counterEl) return;
    const total = recipesList.length || 0;
    const idx = total ? currentIndex + 1 : 0;
    counterEl.textContent = `${idx} / ${total}`;
  }

  function openInstacart(recipe) {
    if (!recipe) return;
    const url = recipe.instacartUrl || "https://www.instacart.com";
    if (tg && tg.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, "_blank");
    }
  }

  // --------------- РОБОТА З API ------------------

  const API_BASE = ""; // той самий домен (Render вже проксі)

  async function loadRecipesList() {
    if (isLoadingList) return;
    isLoadingList = true;
    showError("");
    showEmpty(false);
    showLoader(true);

    try {
      const res = await fetch(`${API_BASE}/api/recipes`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        recipesList = [];
        showEmpty(true);
      } else {
        recipesList = data;
        currentIndex = 0;
        showEmpty(false);
      }
      updateCounter();
      if (recipesList.length > 0) {
        await showRecipeByIndex(0);
      } else {
        renderEmptyRecipe();
      }
    } catch (err) {
      console.error("Error loading recipes list:", err);
      showError("Не вдалося завантажити рецепти. Спробуй ще раз.");
    } finally {
      isLoadingList = false;
      showLoader(false);
    }
  }

  async function loadRecipeDetails(recipeId) {
    if (!recipeId) return null;
    if (recipeCache.has(recipeId)) {
      return recipeCache.get(recipeId);
    }
    isLoadingRecipe = true;
    try {
      const res = await fetch(`${API_BASE}/api/recipes/${recipeId}`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      recipeCache.set(recipeId, data);
      return data;
    } catch (err) {
      console.error("Error loading recipe:", err);
      showError("Не вдалося завантажити рецепт.");
      return null;
    } finally {
      isLoadingRecipe = false;
    }
  }

  // --------------- РЕНДЕР РЕЦЕПТУ ----------------

  function renderEmptyRecipe() {
    if (!titleEl || !descEl || !ingredientsListEl) return;
    titleEl.textContent = "Рецепт";
    descEl.textContent = "Поки що немає рецептів.";
    ingredientsListEl.innerHTML = "";
    if (imageWrapEl) {
      imageWrapEl.classList.remove("has-image");
    }
    if (imageEl) {
      imageEl.src = "";
      imageEl.alt = "Рецепт";
    }
    if (imageFallbackEl) {
      imageFallbackEl.classList.remove("hidden");
    }
  }

  function renderRecipe(recipe) {
    if (!recipe) return;

    const title = recipe.title || recipe.name || "Рецепт";
    const desc =
      recipe.description ||
      recipe.text ||
      "Корисний рецепт без додаткового опису.";
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : [];

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;

    if (ingredientsListEl) {
      ingredientsListEl.innerHTML = "";
      if (ingredients.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Інгредієнти не вказані.";
        ingredientsListEl.appendChild(li);
      } else {
        ingredients.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          ingredientsListEl.appendChild(li);
        });
      }
    }

    if (recipe.image && imageEl && imageWrapEl) {
      imageEl.src = recipe.image;
      imageEl.alt = title;
      imageWrapEl.classList.add("has-image");
      if (imageFallbackEl) imageFallbackEl.classList.add("hidden");
    } else {
      if (imageEl) {
        imageEl.src = "";
        imageEl.alt = "Рецепт";
      }
      if (imageWrapEl) imageWrapEl.classList.remove("has-image");
      if (imageFallbackEl) imageFallbackEl.classList.remove("hidden");
    }

    updateCounter();
    showError("");
  }

  async function showRecipeByIndex(index) {
    if (!recipesList.length) {
      renderEmptyRecipe();
      return;
    }
    let nextIndex = index;
    if (nextIndex < 0) nextIndex = recipesList.length - 1;
    if (nextIndex >= recipesList.length) nextIndex = 0;

    currentIndex = nextIndex;
    const meta = recipesList[currentIndex];
    const recipeId = meta.id;

    const recipe = await loadRecipeDetails(recipeId);
    if (!recipe) return;

    renderRecipe(recipe);
  }

  // --------------- СВАЙПИ ------------------------

  let touchStartY = null;
  let touchStartX = null;

  function handleTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartY === null || touchStartX === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;

    const deltaY = touchEndY - touchStartY;
    const deltaX = touchEndX - touchStartX;

    const absY = Math.abs(deltaY);
    const absX = Math.abs(deltaX);

    // Вліво/вправо — назад до меню (правий свайп)
    if (absX > absY && absX > 40) {
      if (deltaX > 0) {
        // свайп вправо
        goMenu();
      }
      touchStartY = null;
      touchStartX = null;
      return;
    }

    // Вгору/вниз — зміна рецепта
    if (absY > 40) {
      if (deltaY < 0) {
        // вгору → наступний
        showRecipeByIndex(currentIndex + 1);
      } else {
        // вниз → попередній
        showRecipeByIndex(currentIndex - 1);
      }
    }

    touchStartY = null;
    touchStartX = null;
  }

  if (reelEl) {
    reelEl.addEventListener("touchstart", handleTouchStart, { passive: true });
    reelEl.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  // --------------- ОБРОБКА КНОПОК ----------------

  function handleCardAction(action) {
    switch (action) {
      case "recipes":
        openScreen("recipes");
        if (tg && tg.sendData) {
          tg.sendData(JSON.stringify({ open: "recipe" }));
        }
        if (!recipesList.length) {
          loadRecipesList();
        }
        break;

      case "plan":
        openScreen("plan");
        if (tg && tg.sendData) {
          tg.sendData(JSON.stringify({ open: "plan" }));
        }
        break;

      case "analysis":
        openScreen("analysis");
        if (tg && tg.sendData) {
          tg.sendData(JSON.stringify({ open: "analysis" }));
        }
        break;

      case "settings":
        openScreen("settings");
        if (tg && tg.sendData) {
          tg.sendData(JSON.stringify({ open: "settings" }));
        }
        break;

      default:
        console.warn("Unknown action:", action);
        break;
    }
  }

  cards.forEach((card) => {
    const action = card.getAttribute("data-action");
    if (!action) return;
    card.addEventListener("click", () => handleCardAction(action));
  });

  backButtons.forEach((btn) => {
    btn.addEventListener("click", goMenu);
  });

  if (backTopBtn) backTopBtn.addEventListener("click", goMenu);
  if (backBottomBtn) backBottomBtn.addEventListener("click", goMenu);

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      recipeCache.clear();
      loadRecipesList();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      showRecipeByIndex(currentIndex - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      showRecipeByIndex(currentIndex + 1);
    });
  }

  if (instacartBtn) {
    instacartBtn.addEventListener("click", async () => {
      if (!recipesList.length) return;
      const meta = recipesList[currentIndex];
      const recipe = await loadRecipeDetails(meta.id);
      if (!recipe) return;
      openInstacart(recipe);
    });
  }

  // --------------- СТАРТ ------------------------

  // Початковий екран — меню
  openScreen("menu");
});
