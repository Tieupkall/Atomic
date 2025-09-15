// cron/thuebotChecker.js
const fs = require("fs");
const path = require("path");

module.exports = async function ({ api }) {
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "Bot";
  const thuebotPath = path.join(__dirname, "../modules/commands/cache/data/thuebot.json");

  let thuebot = [];
  try {
    thuebot = fs.existsSync(thuebotPath) ? JSON.parse(fs.readFileSync(thuebotPath, "utf-8")) : [];
  } catch (err) {
    console.error("❌ Lỗi đọc file thuebot.json:", err);
    return;
  }

  const now = Date.now();
  const updated = [];

  for (const item of thuebot) {
    const expired = new Date(item.expiresAt).getTime() <= now;
    if (expired) {
      try {
        await api.changeNickname(`${botName} | Chưa thuê`, item.t_id, botID);
        await api.sendMessage("⏰ Bot đã hết hạn thuê. Liên hệ admin để gia hạn.", item.t_id);
        console.log(`✅ Đã xử lý nhóm hết hạn: ${item.t_id}`);
      } catch (err) {
        console.error(`❌ Không thể xử lý nhóm ${item.t_id}:`, err.message);
      }
    } else {
      updated.push(item); // Chỉ giữ lại nhóm còn hạn
    }
  }

  // Ghi lại file chỉ chứa nhóm còn hạn
  fs.writeFileSync(thuebotPath, JSON.stringify(updated, null, 2), "utf-8");
};