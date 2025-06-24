const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../data/antichange.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports.config = {
  name: "antichange",
  version: "2.0.0",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Bật/tắt chức năng chống đổi theme, tên nhóm, emoji",
  commandCategory: "Quản trị nhóm",
  usages: "[on/off]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const threadID = event.threadID;
  const mode = args[0]?.toLowerCase();
  if (!["on", "off"].includes(mode)) {
    return api.sendMessage("⚙️ Sử dụng:\n• antichange on → bật\n• antichange off → tắt", threadID);
  }

  const data = loadData();

  if (!data[threadID]) data[threadID] = {};

  if (mode === "on") {
    try {
      const info = await api.getThreadInfo(threadID);
      const color = info.threadColor || "#0084ff"; // fallback nếu rỗng
      const name = info.threadName || "Không tên";
      const emoji = info.emoji || "👍";

      data[threadID] = {
        enabled: true,
        theme: color,
        name: name,
        emoji: emoji
      };

      saveData(data);
      return api.sendMessage(`✅ Đã bật chống đổi. Ghi nhận:\n• Theme: ${color}\n• Tên nhóm: ${name}\n• Emoji: ${emoji}`, threadID);
    } catch (err) {
      console.error("❌ [antichange] Lỗi khi lấy thông tin nhóm:", err);
      return api.sendMessage("⚠️ Không thể lấy thông tin nhóm. Bật thất bại.", threadID);
    }
  }

  if (mode === "off") {
    data[threadID].enabled = false;
    saveData(data);
    return api.sendMessage("❌ Đã tắt tính năng chống đổi.", threadID);
  }
};