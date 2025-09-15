const fs = require("fs");
const path = require("path");
const CONFIG_PATH = path.join(__dirname, "..", "..", "config.json");

module.exports.config = {
  name: "setprefix",
  version: "2.0.0",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Đặt prefix riêng cho nhóm hiện tại",
  commandCategory: "Admin",
  usages: "setprefix <ký_tự|từ> hoặc setprefix reset",
  cooldowns: 3
};

const uid = global.config.UIDBOT;
const thuebotFilePath = path.join(__dirname, "cache", "data", "thuebot.json");

const readThuebot = () => {
  try {
    if (!fs.existsSync(thuebotFilePath)) return [];
    const data = fs.readFileSync(thuebotFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc file thuebot.json:", error);
    return [];
  }
};

const calculateTimeRemaining = (expiresAt) => {
  const now = Date.now();
  const expireTime = new Date(expiresAt).getTime();
  const remaining = expireTime - now;

  if (remaining <= 0) return null;

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  let timeText = "";
  if (days > 0) timeText += `${days} ngày `;
  if (hours > 0) timeText += `${hours} giờ `;
  if (minutes > 0) timeText += `${minutes} phút`;

  return timeText.trim() || "dưới 1 phút";
};

const getRentStatus = (threadID) => {
  const thuebot = readThuebot();
  const entry = thuebot.find(e => e.t_id === threadID);
  if (!entry) return "Chưa thuê";

  const timeRemaining = calculateTimeRemaining(entry.expiresAt);
  return timeRemaining || "Chưa thuê";
};

const createBotNickname = (prefix, threadID) => {
  const rentStatus = getRentStatus(threadID);
  const botName = global.config.BOTNAME || "Bot";

  if (rentStatus === "Chưa thuê") {
    return `[ ${prefix} ] • ${botName} | Chưa thuê`;
  } else {
    return `[ ${prefix} ] • ${botName} | ${rentStatus}`;
  }
};

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
  try {
    if (event.userID != handleReaction.author) return;
    const { threadID } = event;
    const newPrefix = handleReaction.PREFIX;

    // Chỉ cập nhật config.json
    let cfg;
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      cfg.GROUP_PREFIX = cfg.GROUP_PREFIX || {};
      cfg.GROUP_PREFIX[String(threadID)] = newPrefix;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
      global.config.GROUP_PREFIX = cfg.GROUP_PREFIX;
    } catch (configError) {
      console.error("Lỗi cập nhật config.json:", configError);
      return api.sendMessage("❌ Lỗi khi lưu prefix. Vui lòng thử lại.", threadID);
    }

    // Tạo nickname mới
    const newNickname = createBotNickname(newPrefix, threadID);

    // Cập nhật nickname cho bot
    try {
      if (uid && Array.isArray(uid) && uid.length > 0) {
        for (const botId of uid) {
          await api.changeNickname(newNickname, threadID, botId);
        }
      } else {
        await api.changeNickname(newNickname, threadID, api.getCurrentUserID());
      }
    } catch (nicknameError) {
      console.error("⚠️ Lỗi khi cập nhật nickname:", nicknameError);
    }

    api.unsendMessage(handleReaction.messageID);
    return api.sendMessage(`✅ Đã chuyển đổi prefix của nhóm thành: ${newPrefix}`, threadID);
  } catch (e) {
    console.error("Lỗi xử lý reaction:", e);
    return api.sendMessage("❌ Đã xảy ra lỗi khi xử lý reaction.", event.threadID);
  }
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  if (!args[0]) {
    const currentPrefix = global.client.getPrefix(threadID);
    return api.sendMessage(`🔧 Prefix hiện tại của nhóm: ${currentPrefix}\n\n📝 Cách dùng:\n• ${currentPrefix}setprefix <ký_tự> - Đặt prefix mới\n• ${currentPrefix}setprefix reset - Reset về mặc định`, threadID, messageID);
  }

  const input = args[0].trim();

  // Reset prefix về mặc định
  if (input.toLowerCase() === "reset") {
    try {
      // Chỉ cập nhật config.json
      let cfg;
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        cfg.GROUP_PREFIX = cfg.GROUP_PREFIX || {};
        delete cfg.GROUP_PREFIX[String(threadID)];
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
        global.config.GROUP_PREFIX = cfg.GROUP_PREFIX;
      } catch (configError) {
        console.error("Lỗi cập nhật config.json:", configError);
        return api.sendMessage("❌ Lỗi khi reset prefix. Vui lòng thử lại.", threadID, messageID);
      }

      const defaultPrefix = global.config.PREFIX;

      // Tạo nickname mới với prefix đã reset
      const resetNickname = createBotNickname(defaultPrefix, threadID);

      // Cập nhật nickname cho bot
      try {
        if (uid && Array.isArray(uid) && uid.length > 0) {
          for (const botId of uid) {
            await api.changeNickname(resetNickname, threadID, botId);
          }
        } else {
          await api.changeNickname(resetNickname, threadID, api.getCurrentUserID());
        }
      } catch (nicknameError) {
        console.error("⚠️ Lỗi khi cập nhật nickname:", nicknameError);
      }

      return api.sendMessage(`✅ Đã reset prefix về mặc định: ${defaultPrefix}`, threadID, messageID);
    } catch (err) {
      console.error("❌ Lỗi khi reset prefix:", err);
      return api.sendMessage("❌ Đã xảy ra lỗi khi reset prefix. Vui lòng thử lại.", threadID, messageID);
    }
  } else {
    // Kiểm tra prefix mới
    if (input.length > 10) {
      return api.sendMessage("❌ Prefix quá dài (tối đa 10 ký tự).", threadID, messageID);
    }

    if (input.includes(" ")) {
      return api.sendMessage("❌ Prefix không được chứa khoảng trắng.", threadID, messageID);
    }

    return api.sendMessage(`Bạn muốn đổi prefix thành: ${input}\nThả cảm xúc để xác nhận`, threadID, (error, info) => {
      if (error) {
        console.error("Lỗi gửi tin nhắn xác nhận:", error);
        return api.sendMessage("❌ Lỗi khi gửi tin nhắn xác nhận.", threadID, messageID);
      }
      global.client.handleReaction.push({
        name: "setprefix",
        messageID: info.messageID,
        author: senderID,
        PREFIX: input
      });
    });
  }
};