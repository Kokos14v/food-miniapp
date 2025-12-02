import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

// 🔑 ВСТАВ СВОЙ КЛЮЧ АБО ВИКОРИСТАЙ ENV
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "ENTER_YOUR_OPENAI_KEY"
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ---------- ФІКСОВАНІ РЕЦЕПТИ З JSON ----------
const recipesPath = path.join(__dirname, "data", "recipes.json");
let RECIPES = [];
try {
  const raw = fs.readFileSync(recipesPath, "utf8");
  RECIPES = JSON.parse(raw);
  console.log(`Loaded ${RECIPES.length} recipes from data/recipes.json`);
} catch (e) {
  console.error("❌ Помилка завантаження recipes.json:", e.message);
}

function getRecipesByCategory(category) {
  return RECIPES.filter(r => r.category === category);
}
function getRandomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function callChat(model, system, userContent) {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ]
  });
  return completion.choices[0].message.content;
}

// =============== 1) CHAT COMPLETIONS ===============
// Загальний чат, якщо захочеш використати в UI
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const system = "Ти FoodHelper Coconut — асистент з харчування, рецептів, продуктів і шопінгу.";
    const answer = await callChat("gpt-4o-mini", system, message || "");
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 2) РЕЦЕПТИ З ФІКСОВАНОЇ БАЗИ ===============
app.post("/api/recipe", async (req, res) => {
  try {
    const { type } = req.body; // breakfast / lunch / dinner / snack
    const list = getRecipesByCategory(type);
    if (!list.length) {
      return res.json({ ok: false, error: "Немає рецептів для цієї категорії" });
    }
    const recipe = getRandomFrom(list);
    const text = [
      `### ${recipe.title}`,
      "",
      "Інгредієнти:",
      ...(recipe.ingredients || []).map(i => `- ${i}`),
      "",
      "Кроки:",
      ...(recipe.steps || []).map((s, i) => `${i + 1}. ${s}`)
    ].join("\n");

    res.json({ ok: true, result: text });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 3) EMBEDDINGS: ПОШУК РЕЦЕПТІВ ===============
app.post("/api/search-recipes", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json({ ok: false, error: "Порожній запит" });

    const embedModel = "text-embedding-3-small";

    // Вектор запиту
    const qEmbRes = await openai.embeddings.create({
      model: embedModel,
      input: query
    });
    const qVec = qEmbRes.data[0].embedding;

    // Вектори рецептів (на льоту — ок для невеликої бази)
    const recipeTexts = RECIPES.map(
      r => `${r.title}\n${(r.ingredients || []).join(", ")}\n${(r.steps || []).join(" ")}`
    );

    const rEmbRes = await openai.embeddings.create({
      model: embedModel,
      input: recipeTexts
    });

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    const scored = RECIPES.map((r, idx) => ({
      recipe: r,
      score: cosine(qVec, rEmbRes.data[idx].embedding)
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const lines = scored.map((item, i) => {
      const r = item.recipe;
      return `${i + 1}. ${r.title} (score ${item.score.toFixed(3)})`;
    });

    res.json({
      ok: true,
      result: `Найрелевантніші рецепти:\n\n${lines.join("\n")}`
    });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 4) МЕНЮ (AI, але тільки з твоїх рецептів) ===============
app.post("/api/menu-today", async (req, res) => {
  try {
    const system = `
      Ти планувальник харчування.
      Використовуй ТІЛЬКИ рецепти з JSON, який я даю.
      Зроби меню на сьогодні: сніданок, обід, вечеря, перекус.
      Формат списком, без вигаданих назв.
    `;
    const user = `Ось список рецептів:\n\n${JSON.stringify(RECIPES, null, 2)}`;
    const answer = await callChat("gpt-4o-mini", system, user);
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

app.post("/api/menu-week", async (req, res) => {
  try {
    const system = `
      Ти планувальник харчування.
      Використовуй ТІЛЬКИ ці рецепти.
      Зроби меню на 7 днів (сніданок, обід, вечеря, перекус).
      Наприкінці додай попередній список покупок.
    `;
    const user = `Ось список рецептів:\n\n${JSON.stringify(RECIPES, null, 2)}`;
    const answer = await callChat("gpt-4o-mini", system, user);
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 5) СПИСОК ПОКУПОК (AI) ===============
app.post("/api/shoppinglist", async (req, res) => {
  try {
    const { menuText } = req.body;
    const system = `
      Ти асистент, який перетворює меню на список покупок.
      Віддай структуровано: Овочі, Фрукти, М'ясо, Молочка, Крупи, Інше.
    `;
    const user = `Ось меню:\n\n${menuText}`;
    const answer = await callChat("gpt-4o-mini", system, user);
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 6) ВІДОМОСТІ ПРО ПРОДУКТ (AI) ===============
app.post("/api/product-info", async (req, res) => {
  try {
    const { productName } = req.body;
    const system = `
      Ти нутриціолог.
      Опиши продукт: калорійність на 100 г, БЖВ, користь, ризики.
      Пиши коротко і структуровано.
    `;
    const user = `Продукт: ${productName}`;
    const answer = await callChat("gpt-4o-mini", system, user);
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 7) FILE/PDF: ПАРСИНГ РЕЦЕПТІВ ===============
app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: "Файл не надіслано" });
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    const pdfText = pdfData.text;

    const system = `
      Ти парсер кулінарних рецептів.
      Витягни з тексту рецепти в Markdown: Назва, інгредієнти, кроки.
    `;
    const user = `Ось текст PDF:\n\n${pdfText}`;
    const answer = await callChat("gpt-4o-mini", system, user);

    fs.unlinkSync(req.file.path);
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 8) VISION: АНАЛІЗ ФОТО ПРОДУКТУ ===============
app.post("/api/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ ok: false, error: "Завантаж зображення" });
    }

    const imgBuffer = fs.readFileSync(req.file.path);
    const base64 = imgBuffer.toString("base64");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Ти нутриціолог. Описуєш продукт на фото: що це, як можна використати в рецептах, приблизна калорійність, порада."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Проаналізуй цей продукт." },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` }
            }
          ]
        }
      ]
    });

    fs.unlinkSync(req.file.path);
    const answer = completion.choices[0].message.content;
    res.json({ ok: true, result: answer });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 9) AI-ПІДБІР ТОВАРУ В МАГАЗИНАХ ===============
app.post("/api/find-product", async (req, res) => {
  try {
    const { ingredient, store } = req.body;
    const storeName = store || "Instacart";

    const domain = {
      Instacart: "instacart.com",
      Amazon: "amazon.com",
      Walmart: "walmart.com",
      iHerb: "iherb.com"
    }[storeName] || "instacart.com";

    const system = `
      Ти асистент з онлайн-шопінгу.
      За назвою інгредієнта знайди найвідповідніший продукт на сайті ${domain}.
      ПОВЕРТАЙ ТІЛЬКИ ОДИН URL (посилання) без пояснень, тексту, коментарів.
      Якщо не впевнений — все одно дай найкращий варіант.
    `;
    const user = `Інгредієнт: ${ingredient}\nМагазин: ${storeName}`;

    const answer = await callChat("gpt-4.1-mini", system, user);
    const url = (answer || "").trim().split(/\s+/)[0];

    res.json({ ok: true, url });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

// =============== 10) ЗАПУСК СЕРВЕРА ===============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Food miniapp listening on http://localhost:${PORT}`);
});
