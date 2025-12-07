import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// =========================== PATHS ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Статика Mini App + картинки
app.use(express.static(path.join(__dirname, "public")));

// ====================== LOAD RECIPES ============================

const RECIPES_FILES = [
  path.join(__dirname, "data", "recipes_full.json"),        // 150 рецептів
  path.join(__dirname, "data", "recipes_with_images.json"), // fallback
  path.join(__dirname, "data", "recipes.json"),             // fallback
];

let recipes = [];

// нормалізація одного рецепту
function normalize(r, index) {
  return {
    id: r.id ?? r.ID ?? index + 1,
    title: r.title ?? r.name ?? `Рецепт #${index + 1}`,
    image: r.image ?? null,
    description: r.description ?? r.text ?? null,
    ingredients:
      Array.isArray(r.ingredients)
        ? r.ingredients
        : typeof r.ingredients_text === "string"
        ? r.ingredients_text.split("\n").map((x) => x.trim()).filter(Boolean)
        : [],
    category: r.category ?? r.section ?? "Other",
  };
}

function loadRecipes() {
  for (const file of RECIPES_FILES) {
    if (fs.existsSync(file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));

        if (Array.isArray(raw)) {
          recipes = raw.map(normalize);
          console.log(`✅ Loaded ${recipes.length} recipes from ${path.basename(file)}`);
          return;
        }

        if (Array.isArray(raw.recipes)) {
          recipes = raw.recipes.map(normalize);
          console.log(`✅ Loaded ${recipes.length} recipes from ${path.basename(file)}`);
          return;
        }

        if (Array.isArray(raw.sections)) {
          const merged = [];
          raw.sections.forEach((sec) => {
            if (Array.isArray(sec.recipes)) {
              sec.recipes.forEach((r) =>
                merged.push({ ...normalize(r, merged.length), category: sec.title })
              );
            }
          });
          recipes = merged;
          console.log(`✅ Loaded ${recipes.length} recipes from sections in ${path.basename(file)}`);
          return;
        }
      } catch (e) {
        console.log("❌ Error parsing", file, e.message);
      }
    }
  }

  console.log("❌ No usable recipe file found.");
  recipes = [];
}

loadRecipes();

// ======================= API ROUTES =============================

// GET all recipes
app.get("/api/recipes", (req, res) => {
  res.json(
    recipes.map((r) => ({
      id: r.id,
      title: r.title,
      image: r.image,
      category: r.category ?? "Other",
    }))
  );
});

// GET recipe by ID
app.get("/api/recipes/:id", (req, res) => {
  const id = String(req.params.id);
  const recipe = recipes.find((r) => String(r.id) === id);

  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  res.json(recipe);
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", recipesCount: recipes.length });
});

// FRONTEND FALLBACK
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====================== START SERVER =============================

// Render використовує PORT із env → ми ПОВИННІ слухати саме його!
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🔥 Server running at http://localhost:${PORT}`);
});
