const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "bot",
  version: "1.2.0",
  hasPermssion: 2,
  credits: "Atomic",
  description: "off bot",
  commandCategory: "Admin",
  usages: "bot on|off",
  cooldowns: 0
};

module.exports.run = async function ({ api, event, args }) {
  try {
    if (!Array.isArray(global.config.ADMINBOT) || !global.config.ADMINBOT.includes(event.senderID)) return;

    const configPath = path.join(__dirname, "../../data/bot.json");

    const readCfg = () => {
      try {
        if (!fs.existsSync(configPath)) {
          const def = { maintenance: false, threadBotOff: {} };
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, JSON.stringify(def, null, 2));
          return def;
        }
        const raw = fs.readFileSync(configPath, "utf8") || "{}";
        const cfg = JSON.parse(raw);
        if (typeof cfg.maintenance !== "boolean") cfg.maintenance = false;
        if (!cfg.threadBotOff || typeof cfg.threadBotOff !== "object") cfg.threadBotOff = {};
        return cfg;
      } catch {
        return { maintenance: false, threadBotOff: {} };
      }
    };

    const writeCfg = (c) => {
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(c, null, 2));
        return true;
      } catch {
        return false;
      }
    };

    const sub = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(sub)) {
      return api.sendMessage("Dùng: bot on | bot off", event.threadID, event.messageID);
    }

    const cfg = readCfg();
    const tid = String(event.threadID);

    if (sub === "off") {
      cfg.threadBotOff[tid] = true;
      if (!writeCfg(cfg)) return api.sendMessage("❌ Lỗi khi lưu bot.json!", event.threadID, event.messageID);
      return api.sendMessage("🔴 ĐÃ TẮT bot cho nhóm này.", event.threadID, event.messageID);
    }

    if (cfg.threadBotOff[tid]) delete cfg.threadBotOff[tid];
    if (!writeCfg(cfg)) return api.sendMessage("❌ Lỗi khi lưu bot.json!", event.threadID, event.messageID);
    return api.sendMessage("🟢 ĐÃ BẬT bot cho nhóm này.", event.threadID, event.messageID);
  } catch (e) {
    return api.sendMessage("❌ Lỗi: " + e.message, event.threadID, event.messageID);
  }
};