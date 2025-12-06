const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', 'data', 'recipes.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'recipes_with_images.json');

const raw = fs.readFileSync(INPUT_PATH, 'utf8');
const recipes = JSON.parse(raw);

// ВАЖЛИВО: припускаємо, що ПОРЯДОК рецептів = порядок сторінок PDF
// 1-й рецепт -> recipe_1.webp
// 2-й рецепт -> recipe_2.webp
// і т.д.
const updated = recipes.map((recipe, index) => {
  const pageNumber = index + 1;

  return {
    ...recipe,
    pdfPage: pageNumber, // на всякий випадок зберігаємо номер сторінки
    image: `/recipes/recipe_${pageNumber}.webp`
  };
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updated, null, 2), 'utf8');
console.log(`✅ Saved ${updated.length} recipes with images to ${OUTPUT_PATH}`);
