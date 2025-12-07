import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Статика: фронтенд Mini App + картинки
app.use(express.static(path.join(__dirname, "public")));

// ================== ЗАВАНТАЖЕННЯ РЕЦЕПТІВ ==================

const RECIPES_CANDIDATES = [
  path.join(__dirname, "data", "recipes_full.json"),
  path.join(__dirname, "data", "recipes_with_images.json"),
  path.join(__dirname, "data", "recipes.json"),
];

let recipes = [];

/**
 * Нормалізувати один рецепт до єдиного формату
 */
function normalizeRecipe(raw, index) {
  const id =
    raw.id != null
      ? raw.id
      : raw.ID != null
      ? raw.ID
      : index + 1;

  const title =
    raw.title ||
    raw.name ||
    raw.recipeTitle ||
    `Рецепт #${index + 1}`;

  const description =
    raw.description ||
    raw.text ||
    raw.body ||
    null;

  const ingredients =
    Array.isArray(raw.ingredients)
      ? raw.ingredients
      : Array.isArray(raw.ingredientsList)
      ? raw.ingredientsList
      : typeof raw.ingredients_text === "string"
      ? raw.ingredients_text
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : typeof raw.ingredientsText === "string"
      ? raw.ingredientsText
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const image =
    raw.image ||
    raw.photo ||
    raw.imagePath ||
    null;

  // Категорія (сніданок / обід / вечеря / інше)
  const category =
    raw.category ||
    raw.mealType ||
    raw.section ||
    raw.group ||
    "Other";

  return {
    id,
    title,
    description,
    ingredients,
    image,
    category,
    // Збережемо все інше "як є" для майбутніх фіч
    _raw: raw,
  };
}

/**
 * Нормалізувати масив рецептів до єдиного формату
 */
function normalizeRecipesArray(arr) {
  return arr
    .filter((r) => r && typeof r === "object")
    .map((r, idx) => normalizeRecipe(r, idx));
}

/**
 * Спробувати витягнути рецепти з JSON будь-якого формату
 */
function extractRecipesFromParsed(parsed) {
  // ВАРІАНТ 1 — сам по собі масив рецептів
  if (Array.isArray(parsed)) {
    return normalizeRecipesArray(parsed);
  }

  // ВАРІАНТ 2 — об’єкт з полем recipes
  if (Array.isArray(parsed.recipes)) {
    return normalizeRecipesArray(parsed.recipes);
  }

  // ВАРІАНТ 3 — об’єкт з sections: [{ title: 'Сніданок', recipes: [...] }, ...]
  if (Array.isArray(parsed.sections)) {
    const flat = [];
    parsed.sections.forEach((section, sIdx) => {
      const secTitle =
        section.title ||
        section.name ||
        section.sectionTitle ||
        `Section ${sIdx + 1}`;
      const secRecipes = Array.isArray(section.recipes)
        ? section.recipes
        : Array.isArray(section.items)
        ? section.items
        : [];

      secRecipes.forEach((r) => {
        flat.push({
          ...r,
          category: r.category || secTitle,
        });
      });
    });

    return normalizeRecipesArray(flat);
  }

  // ВАРІАНТ 4 — інші можливі ключі (data, items)
  if (Array.isArray(parsed.data)) {
    return normalizeRecipesArray(parsed.data);
  }
  if (Array.isArray(parsed.items)) {
    return normalizeRecipesArray(parsed.items);
  }

  return [];
}

/**
 * Завантажити рецепти з одного файлу
 */
function loadFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ JSON file not found: ${filePath}`);
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const extracted = extractRecipesFromParsed(parsed);

    console.log(
      `✅ Loaded ${extracted.length} recipes from ${path.basename(
        filePath
      )}`
    );
    return extracted;
  } catch (err) {
    console.error(
      `❌ Error reading ${path.basename(filePath)}:`,
      err.message
    );
    return [];
  }
}

/**
 * Головна функція завантаження рецептів
 * — перебирає кілька кандидатів і бере перший, де > 0 рецептів
 */
function loadRecipes() {
  for (const file of RECIPES_CANDIDATES) {
    const loaded = loadFromFile(file);
    if (loaded.length > 0) {
      recipes = loaded;
      return;
    }
  }

  console.warn("⚠️ No recipes found in any JSON file.");
  recipes = [];
}

loadRecipes();

// ================== ДОПОМІЖНІ ФУНКЦІЇ ==================

function getIngredientList(recipe) {
  if (!recipe) return [];

  if (Array.isArray(recipe.ingredients)) {
    return recipe.ingredients;
  }

  return [];
}

function buildInstacartUrl(ingredients) {
  if (!ingredients || ingredients.length === 0) {
    return "https://www.instacart.com";
  }
  const query = encodeURIComponent(ingredients.join(", "));
  return `https://www.instacart.com/store/search?q=${query}`;
}

/**
 * Знайти рецепт за id (рядок/число)
 */
function findRecipeById(recipeId) {
  // Пробуємо точний збіг
  let recipe =
    recipes.find((r) => String(r.id) === String(recipeId)) || null;

  // Якщо не знайшли й id виглядає як число — індекс
  if (!recipe && /^\d+$/.test(String(recipeId))) {
    const index = Number(recipeId);
    recipe = recipes[index] || null;
  }

  return recipe;
}

// ================== API: СПИСОК РЕЦЕПТІВ ==================

/**
 * GET /api/recipes
 * ?category=Breakfast|Lunch|Dinner|Snack|Other (опційно)
 */
app.get("/api/recipes", (req, res) => {
  const category = (req.query.category || "").toString().trim();

  let list = recipes;

  if (category) {
    list = list.filter(
      (r) => String(r.category || "").toLowerCase() === category.toLowerCase()
    );
  }

  // Коротка форма для списку
  const result = list.map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image || null,
    category: r.category || "Other",
  }));

  res.json(result);
});

// ================== API: ОДИН РЕЦЕПТ ==================

/**
 * GET /api/recipes/:id
 */
app.get("/api/recipes/:id", (req, res) => {
  const recipeId = req.params.id;
  const recipe = findRecipeById(recipeId);

  if (!recipe) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  const ingredients = getIngredientList(recipe);
  const instacartUrl = buildInstacartUrl(ingredients);

  const response = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    ingredients,
    image: recipe.image || null,
    instacartUrl,
    category: recipe.category || "Other",
  };

  res.json(response);
});

// ================== API: ПОШУК ==================

/**
 * GET /api/search?q=курка
 */
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();

  if (!q) {
    return res.json([]);
  }

  const result = recipes.filter((r) => {
    const title = (r.title || "").toLowerCase();
    const ingredients = getIngredientList(r)
      .join(" ")
      .toLowerCase();
    const category = (r.category || "").toLowerCase();

    return (
      title.includes(q) ||
      ingredients.includes(q) ||
      category.includes(q)
    );
  });

  res.json(
    result.map((r) => ({
      id: r.id,
      title: r.title,
      image: r.image || null,
      category: r.category || "Other",
    }))
  );
});

// ================== СЕРВІСНІ РОУТИ ==================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", recipesCount: recipes.length });
});

// Фолбек для Mini App — завжди index.html
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== СТАРТ СЕРВЕРА ==================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Food miniapp listening on http://localhost:${PORT} (recipes: ${recipes.length})`
  );
});
