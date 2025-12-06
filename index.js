import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ================== БАЗОВІ ШЛЯХИ ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

// ================== OPENAI КЛІЄНТ ==================
// 🔑 ВАЖЛИВО: постав свій ключ у змінній середовища OPENAI_API_KEY
// або заміни рядок нижче на свій ключ (не раджу комітити в GitHub)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "ENTER_YOUR_OPENAI_KEY",
});

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json());

// Статика — Telegram Mini App фронтенд, картинки, стилі
app.use(express.static(path.join(__dirname, "public")));

// ================== ЗАВАНТАЖЕННЯ РЕЦЕПТІВ ==================

const RECIPES_PATH = path.join(__dirname, "data", "recipes_with_images.json");
let recipes = [];

function loadRecipes() {
  try {
    const fileRaw = fs.readFileSync(RECIPES_PATH, "utf8");
    const parsed = JSON.parse(fileRaw);

    if (Array.isArray(parsed)) {
      recipes = parsed;
    } else if (Array.isArray(parsed.recipes)) {
      recipes = parsed.recipes;
    } else {
      console.warn("⚠️ Неочікуваний формат recipes_with_images.json, використовую порожній список.");
      recipes = [];
    }

    console.log(`✅ Loaded ${recipes.length} recipes from data/recipes_with_images.json`);
  } catch (err) {
    console.error("❌ Error loading recipes_with_images.json:", err.message);
    recipes = [];
  }
}

loadRecipes();

// ================== ДОПОМІЖНІ ФУНКЦІЇ ==================

// Витягти список інгредієнтів з рецепту (підтримка різних схем)
function getIngredientList(recipe) {
  if (!recipe) return [];

  if (Array.isArray(recipe.ingredients)) {
    return recipe.ingredients;
  }
  if (Array.isArray(recipe.ingredientsList)) {
    return recipe.ingredientsList;
  }
  if (typeof recipe.ingredients_text === "string") {
    return recipe.ingredients_text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof recipe.ingredientsText === "string") {
    return recipe.ingredientsText
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

// Зробити Instacart-посилання з інгредієнтів
function buildInstacartUrl(ingredients) {
  if (!ingredients || ingredients.length === 0) {
    return "https://www.instacart.com";
  }
  const query = ingredients.join(", ");
  const encoded = encodeURIComponent(query);
  return `https://www.instacart.com/store/search?q=${encoded}`;
}

// ================== API: СПИСОК РЕЦЕПТІВ ==================

/**
 * GET /api/recipes
 * Повертає список рецептів (коротка форма) для меню:
 *  - id
 *  - title
 *  - image (якщо є)
 */
app.get("/api/recipes", (req, res) => {
  const list = recipes.map((r, index) => ({
    id: r.id ?? index,
    title: r.title ?? r.name ?? `Рецепт #${index + 1}`,
    image: r.image || null,
  }));

  res.json(list);
});

// ================== API: ОДИН РЕЦЕПТ ==================

/**
 * GET /api/recipes/:id
 * Деталі по одному рецепту:
 *  - id, title, description, ingredients
 *  - image (якщо є)
 *  - instacartUrl
 */
app.get("/api/recipes/:id", (req, res) => {
  const recipeId = req.params.id;
  let recipe = null;

  // id може бути числовим індексом або id з JSON
  if (/^\d+$/.test(recipeId)) {
    const index = Number(recipeId);
    recipe = recipes.find((r) => String(r.id) === recipeId) ?? recipes[index];
  } else {
    recipe = recipes.find((r) => String(r.id) === recipeId);
  }

  if (!recipe) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  const ingredients = getIngredientList(recipe);
  const instacartUrl = buildInstacartUrl(ingredients);

  const response = {
    id: recipe.id ?? recipeId,
    title: recipe.title ?? recipe.name ?? "Без назви",
    description: recipe.description ?? recipe.text ?? null,
    ingredients,
    image: recipe.image || null, // відносний шлях типу /recipes/recipe_12.webp
    instacartUrl,
  };

  res.json(response);
});

// ================== API: ПОШУК РЕЦЕПТІВ ==================

/**
 * GET /api/search?q=курка
 * Пошук по назві + інгредієнтах
 */
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();

  if (!q) {
    return res.json([]);
  }

  const results = recipes.filter((r, index) => {
    const title = (r.title || r.name || `Рецепт #${index + 1}`).toLowerCase();
    const ingredients = getIngredientList(r)
      .join(" ")
      .toLowerCase();

    return title.includes(q) || ingredients.includes(q);
  });

  res.json(
    results.map((r, index) => ({
      id: r.id ?? index,
      title: r.title ?? r.name ?? `Рецепт #${index + 1}`,
      image: r.image || null,
    }))
  );
});

// ================== AI-КАРТИНКА, ЯКЩО ФОТО НЕМА ==================

/**
 * POST /api/recipes/:id/generate-image
 * Якщо рецепт без фото — генеруємо через OpenAI
 * Відповідь: { imageBase64: "data:image/png;base64,..." }
 */
app.post("/api/recipes/:id/generate-image", async (req, res) => {
  const recipeId = req.params.id;

  let recipe = null;
  if (/^\d+$/.test(recipeId)) {
    const index = Number(recipeId);
    recipe = recipes.find((r) => String(r.id) === recipeId) ?? recipes[index];
  } else {
    recipe = recipes.find((r) => String(r.id) === recipeId);
  }

  if (!recipe) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  // Якщо вже є фото з PDF — просто повертаємо 409
  if (recipe.image) {
    return res.status(409).json({ error: "Recipe already has an image", image: recipe.image });
  }

  const title = recipe.title ?? recipe.name ?? "страва";
  const ingredients = getIngredientList(recipe);

  const prompt = `
Фуд-фото для кулінарної книги. Страва: "${title}".
Інгредієнти: ${ingredients.join(", ")}.
Сучасний світлий стиль, виглядає смачно та професійно, вид зверху або 3/4.
  `.trim();

  try {
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "512x512",
    });

    const b64 = img.data[0].b64_json;
    const dataUrl = `data:image/png;base64,${b64}`;

    return res.json({ imageBase64: dataUrl });
  } catch (err) {
    console.error("❌ Error generating image:", err);
    return res.status(500).json({ error: "Failed to generate image" });
  }
});

// ================== ЗАГАЛЬНІ СЕРВІСНІ РОУТИ ==================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", recipesCount: recipes.length });
});

// Фолбек — віддати фронтенд (якщо потім буде SPA)
app.get("*", (req, res, next) => {
  // Якщо це запит на файл (картинка/скрипт) — пропустити до express.static
  if (req.path.startsWith("/api") || req.path.includes(".")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== ЗАПУСК СЕРВЕРА ==================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Food miniapp listening on http://localhost:${PORT}`);
});
