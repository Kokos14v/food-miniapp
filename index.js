import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "ENTER_YOUR_OPENAI_KEY",
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// === LOAD RECIPES (FULL VERSION!) ===
const RECIPES_PATH = path.join(__dirname, "data", "recipes_full.json");
let recipes = [];

function loadRecipes() {
  try {
    const file = fs.readFileSync(RECIPES_PATH, "utf8");
    const json = JSON.parse(file);

    recipes = Array.isArray(json) ? json : json.recipes || [];

    console.log(`✅ Loaded ${recipes.length} recipes from recipes_full.json`);
  } catch (err) {
    console.error("❌ Failed to load recipes_full.json:", err.message);
    recipes = [];
  }
}

loadRecipes();

// === Helper functions ===
function getIngredientList(recipe) {
  if (!recipe) return [];
  if (Array.isArray(recipe.ingredients)) return recipe.ingredients;
  if (Array.isArray(recipe.ingredientsList)) return recipe.ingredientsList;

  if (typeof recipe.ingredients_text === "string")
    return recipe.ingredients_text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

  if (typeof recipe.ingredientsText === "string")
    return recipe.ingredientsText.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

  return [];
}

function buildInstacartUrl(ingredients) {
  if (!ingredients.length) return "https://www.instacart.com";
  return `https://www.instacart.com/store/search?q=${encodeURIComponent(ingredients.join(", "))}`;
}

// === API ROUTES ===

// Summary list for MiniApp grid
app.get("/api/recipes", (req, res) => {
  res.json(
    recipes.map((r, i) => ({
      id: r.id ?? i,
      title: r.title ?? r.name ?? `Recipe #${i + 1}`,
      image: r.image || null,
      category: r.category || "Other",
    }))
  );
});

// Full recipe details
app.get("/api/recipes/:id", (req, res) => {
  const rid = req.params.id;

  const recipe =
    recipes.find(r => String(r.id) === rid) ||
    recipes[Number(rid)];

  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  const ingredients = getIngredientList(recipe);

  res.json({
    id: recipe.id ?? rid,
    title: recipe.title ?? recipe.name ?? "Без назви",
    description: recipe.description ?? recipe.text ?? "",
    ingredients,
    image: recipe.image || null,
    category: recipe.category || "Other",
    instacartUrl: buildInstacartUrl(ingredients),
  });
});

// AI image generation (if image missing)
app.post("/api/recipes/:id/generate-image", async (req, res) => {
  const rid = req.params.id;

  const recipe =
    recipes.find(r => String(r.id) === rid) ||
    recipes[Number(rid)];

  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  if (recipe.image)
    return res.status(409).json({ error: "Image exists", image: recipe.image });

  const ingredients = getIngredientList(recipe);
  const prompt = `Food photo of "${recipe.title}". Ingredients: ${ingredients.join(", ")}`;

  try {
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "512x512",
    });

    const base64 = img.data[0].b64_json;

    res.json({ imageBase64: `data:image/png;base64,${base64}` });
  } catch (e) {
    console.error("❌ AI image error:", e);
    res.status(500).json({ error: "AI generation failed" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", recipesCount: recipes.length });
});

// Spa fallback
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Server running at http://localhost:${PORT}`));
