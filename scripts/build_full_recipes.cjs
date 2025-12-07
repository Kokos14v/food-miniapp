// build_full_recipes.cjs
// Автоматичне створення recipes_full.json з PDF + фото

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const PDF_PATH = path.join(__dirname, "../data/recipes.pdf");  
const OUT_PATH = path.join(__dirname, "../data/recipes_full.json");

console.log("📄 Loading PDF…");

(async () => {
  const buffer = fs.readFileSync(PDF_PATH);
  const pdf = await pdfParse(buffer);

  console.log(`📄 PDF pages: ${pdf.numpages}`);

  const pages = pdf.text
    .split(/\f/g) // розділити по сторінках
    .map(p => p.trim())
    .filter(p => p.length > 10);

  console.log(`📄 Parsed pages: ${pages.length}`);

  const recipes = [];

  function detectMealType(title, text) {
    const t = (title + " " + text).toLowerCase();

    if (t.includes("снідан") || t.includes("breakfast")) return "breakfast";
    if (t.includes("обід") || t.includes("lunch")) return "lunch";
    if (t.includes("вечер") || t.includes("dinner")) return "dinner";

    // fallback
    if (recipes.length < 50) return "breakfast";
    if (recipes.length < 100) return "lunch";
    return "dinner";
  }

  pages.forEach((pageText, i) => {
    const lines = pageText.split("\n").map(s => s.trim()).filter(Boolean);

    const title = lines[0] || `Рецепт #${i+1}`;

    // Інгредієнти — це рядки, де є тире або числа
    const ingredients = lines
      .filter(l => l.match(/[-–]|г|мл|\d/))
      .slice(1, 12);

    const description = lines.slice(ingredients.length + 1).join(" ");

    const mealType = detectMealType(title, pageText);

    recipes.push({
      id: i + 1,
      title,
      mealType,
      ingredients,
      description: description || null,
      image: `/recipes/recipe_${i + 1}.webp`
    });
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(recipes, null, 2), "utf8");

  console.log(`✅ DONE! Saved ${recipes.length} recipes → data/recipes_full.json`);
})();
