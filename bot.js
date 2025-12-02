import TelegramBot from "node-telegram-bot-api";

// 🔐 ВСТАВ СВІЙ ТОКЕН
const TOKEN = "ВАШ_ТОКЕН_ТУТ";

// 🌐 URL Mini App
const MINI_APP_URL = "https://food-miniapp.onrender.com/";

// Створюємо бота
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("🤖 Coconut AI Bot запущений...");

// Анімоване привітання
const wave = (text) =>
  [...text].map((c, i) => (i % 2 === 0 ? "✨" + c + "✨" : "💎" + c + "💎")).join(" ");

// -------- /start --------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    wave("Привіт! Я Coconut AI 🥥🤍") +
      "\n\nЯ допоможу з рецептами, продуктами та персональними AI-порадами.\n\n" +
      "👉 Натисни кнопку нижче, щоб запустити Coconut AI"
  );

  await bot.sendMessage(chatId, "Відкрити Coconut AI:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🥥 ВІДКРИТИ APP",
            web_app: { url: MINI_APP_URL }
          }
        ]
      ]
    }
  });
});

// -------- Всі інші повідомлення --------
bot.on("message", async (msg) => {
  if (msg.text && msg.text !== "/start") {
    await bot.sendMessage(
      msg.chat.id,
      "🥥 Я працюю всередині Mini App.\n\nНатисни нижче, щоб продовжити:",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Відкрити Coconut AI",
                web_app: { url: MINI_APP_URL }
              }
            ]
          ]
        }
      }
    );
  }
});
