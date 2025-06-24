const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../data/antichange.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({}));
  const raw = fs.readFileSync(dataPath, "utf8");
  console.log("[antichange] 📥 Dữ liệu antichange.json đã load:", raw);
  return JSON.parse(raw);
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log("[antichange] 💾 Dữ liệu đã được ghi vào antichange.json.");
}

function isValidEmoji(e) {
  return typeof e === "string" && e.length > 0;
}

module.exports.config = {
  name: "antichange",
  eventType: ["log:thread-color", "log:thread-name", "log:thread-icon"],
  version: "3.2.0",
  credits: "Atomic",
  description: "Chặn đổi theme, tên và emoji nhóm (có debug console)"
};

module.exports.run = async function ({ api, event }) {
  const { threadID, logMessageType, logMessageData } = event;
  const data = loadData();

  if (!data[threadID]?.enabled) {
    console.log(`[antichange] ❌ Nhóm ${threadID} chưa bật bảo vệ.`);
    return;
  }

  const threadData = data[threadID];
  const availableColors = Object.values(api.threadColors);
  const fallbackColor = availableColors[0] || "#0084ff";

  try {
    switch (logMessageType) {
      case "log:thread-color": {
        const newColor = logMessageData?.theme_color;
        console.log(`[antichange] 🎨 Theme nhóm ${threadID} bị đổi: ${newColor}`);

        if (!threadData.theme && newColor) {
          if (availableColors.includes(newColor)) {
            threadData.theme = newColor;
            console.log(`[antichange] 📝 Lưu lần đầu theme: ${newColor}`);
            saveData(data);
          }
          return;
        }

        if (newColor !== threadData.theme) {
          const restoreColor = availableColors.includes(threadData.theme)
            ? threadData.theme
            : fallbackColor;

          try {
            await api.changeThreadColor(restoreColor, threadID);
            console.log(`[antichange] ✅ Đã khôi phục theme về ${restoreColor}`);
          } catch (err) {
            console.warn(`[antichange] ⚠️ Không thể đổi theme về ${restoreColor}:`, err);
          }

          if (restoreColor === fallbackColor && threadData.theme !== fallbackColor) {
            threadData.theme = fallbackColor;
            console.log(`[antichange] 🛠 Cập nhật fallback theme`);
            saveData(data);
          }
        }

        break;
      }

      case "log:thread-name": {
        const newName = logMessageData?.name;
        console.log(`[antichange] 🏷 Tên nhóm bị đổi: ${newName}`);

        if (!threadData.name && newName) {
          threadData.name = newName;
          console.log(`[antichange] 📝 Lưu tên nhóm ban đầu: ${newName}`);
          saveData(data);
          return;
        }

        if (newName !== threadData.name) {
          await api.setTitle(threadData.name, threadID);
          console.log(`[antichange] 🔄 Đã khôi phục tên nhóm về: ${threadData.name}`);
        }

        break;
      }

      case "log:thread-icon": {
        const newEmoji = logMessageData?.emoji;
        console.log(`[antichange] 😄 Emoji bị đổi: ${newEmoji}`);

        if (!threadData.emoji && isValidEmoji(newEmoji)) {
          threadData.emoji = newEmoji;
          console.log(`[antichange] 📝 Lưu emoji lần đầu: ${newEmoji}`);
          saveData(data);
          return;
        }

        if (newEmoji !== threadData.emoji && isValidEmoji(threadData.emoji)) {
          try {
            await api.changeThreadEmoji(threadData.emoji, threadID);
            console.log(`[antichange] 🔄 Đã khôi phục emoji về: ${threadData.emoji}`);
          } catch (err) {
            console.warn(`[antichange] ⚠️ Không thể đổi emoji:`, err);
          }
        }

        break;
      }
    }
  } catch (err) {
    console.error("❌ [antichange] Lỗi trong xử lý sự kiện:", err);
  }
};