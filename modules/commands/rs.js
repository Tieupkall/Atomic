const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
  name: "rs",
  version: "1.0.1",
  hasPermssion: 2,
  credits: "Atomic",
  description: "Khởi động lại bot",
  commandCategory: "Admin",
  usages: "",
  cooldowns: 5
};

module.exports.run = async function({ api, event }) {
  const { threadID, messageID, senderID } = event;
  try {
    const userName = global.data.userName.get(senderID) || "Admin";
    const resetPath = path.join(__dirname, "../../data/restart_config.json");

    const data = {
      threadID,
      requester: userName,
      time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss")
    };

    fs.writeFileSync(resetPath, JSON.stringify(data, null, 2), "utf8");
    api.sendMessage("🔄 Đang khởi động lại bot...", threadID, messageID);
    setTimeout(() => process.exit(1), 3000);
  } catch (e) {
    api.sendMessage(`❌ Lỗi khi reset: ${e.message}`, threadID, messageID);
  }
};