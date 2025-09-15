const fs = require("fs");
const path = require("path");
const moment = require("moment");

module.exports = function ({ api, models, Users, Threads, Currencies }) {
  const logger = require("../../utils/log.js");

  const thuebotPath = path.join(__dirname, "../../modules/commands/cache/data/thuebot.json");
  const lastCheckPath = path.join(__dirname, "../../modules/commands/cache/data/lastCheck.json");
  const syncDataPath = path.join(__dirname, "../../modules/commands/cache/data/syncData.json");

  const getPrefix = (tID) => {
    const cfg = global.config || {};
    const m = cfg.GROUP_PREFIX || {};
    if (tID && m[tID]) return m[tID];
    return typeof cfg.PREFIX === "string" && cfg.PREFIX ? cfg.PREFIX : "/";
  };

  const ensureDirectoryExists = () => {
    const dir = path.dirname(thuebotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };

  const readSyncData = () => {
    try {
      if (!fs.existsSync(syncDataPath)) {
        const d = { lastSyncTime: null, syncInterval: 600000, syncCount: 0, createdAt: new Date().toISOString() };
        fs.writeFileSync(syncDataPath, JSON.stringify(d, null, 2), "utf-8");
        return d;
      }
      return JSON.parse(fs.readFileSync(syncDataPath, "utf-8"));
    } catch {
      return { lastSyncTime: null, syncInterval: 43200000, syncCount: 0, createdAt: new Date().toISOString() };
    }
  };

  const writeSyncData = (data) => {
    try {
      ensureDirectoryExists();
      fs.writeFileSync(syncDataPath, JSON.stringify(data, null, 2), "utf-8");
    } catch {}
  };

  const calculateTimeRemaining = (expiresAt) => {
    const now = Date.now();
    const expireTime = new Date(expiresAt).getTime();
    const remaining = expireTime - now;
    if (remaining <= 0) return null;
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    let s = "";
    if (days > 0) s += `${days} ngày`;
    if (hours > 0) s += `${s ? " " : ""}${hours} giờ`;
    if (minutes > 0 && days === 0) s += `${s ? " " : ""}${minutes} phút`;
    return s.trim() || "dưới 1 phút";
  };

  async function checkExpiredRentGroups() {
    const botID = api.getCurrentUserID();
    const botName = global.config.BOTNAME || "Bot";
    ensureDirectoryExists();

    let thuebot;
    try {
      if (!fs.existsSync(thuebotPath)) {
        fs.writeFileSync(thuebotPath, JSON.stringify([], null, 2), "utf-8");
        thuebot = [];
      } else {
        thuebot = JSON.parse(fs.readFileSync(thuebotPath, "utf-8"));
      }
    } catch {
      return;
    }

    const now = Date.now();
    const expired = [];
    const soonExpired = [];
    const stillValid = [];

    thuebot.forEach(item => {
      const expireTime = new Date(item.expiresAt).getTime();
      const remaining = expireTime - now;
      const hoursLeft = remaining / 3600000;
      if (remaining <= 0) expired.push(item);
      else if (hoursLeft <= 24) { soonExpired.push({ ...item, timeLeft: calculateTimeRemaining(item.expiresAt) }); stillValid.push(item); }
      else stillValid.push(item);
    });

    for (const item of expired) {
      try {
        const prefix = getPrefix(item.t_id);
        await api.changeNickname(`[ ${prefix} ] • ${botName} | Chưa thuê`, item.t_id, botID);
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }

    if (expired.length > 0) {
      const adminIDs = global.config.ADMINBOT || [];
      const msg = `⚠️ CÓ ${expired.length} NHÓM ĐÃ HẾT HẠN THUÊ:\n\n` + expired.map((e, i) =>
        `${i + 1}. ${e.groupName || "Không tên"}\n   ID: ${e.t_id}\n   Hết hạn: ${new Date(e.expiresAt).toLocaleString("vi-VN")}`
      ).join("\n\n");
      for (const id of adminIDs) { try { await api.sendMessage(msg, id); await new Promise(r => setTimeout(r, 100)); } catch {} }
    }

    if (soonExpired.length > 0) {
      const adminIDs = global.config.ADMINBOT || [];
      const msg = `🔔 CÓ ${soonExpired.length} NHÓM SẮP HẾT HẠN TRONG 24H:\n\n` + soonExpired.map((e, i) =>
        `${i + 1}. ${e.groupName || "Không tên"}\n   ID: ${e.t_id}\n   ⏰ Còn: ${e.timeLeft}`
      ).join("\n\n");
      for (const id of adminIDs) { try { await api.sendMessage(msg, id); await new Promise(r => setTimeout(r, 100)); } catch {} }
    }

    try {
      fs.writeFileSync(thuebotPath, JSON.stringify(stillValid, null, 2), "utf-8");
      fs.writeFileSync(lastCheckPath, JSON.stringify({
        lastDate: new Date().toDateString(),
        lastCheckTime: new Date().toISOString(),
        expiredCount: expired.length,
        soonExpiredCount: soonExpired.length,
        totalValid: stillValid.length
      }), "utf-8");
    } catch {}
  }

  async function callUpbotSync() {
    try {
      const upbotPath = path.join(__dirname, "../../modules/commands/upbot.js");
      if (!fs.existsSync(upbotPath)) return;
      delete require.cache[require.resolve(upbotPath)];
      const upbotModule = require(upbotPath);
      await upbotModule.run({ api, event: { threadID: null, messageID: null }, args: ["sync"], Users });
      const syncData = readSyncData();
      const mtz = require("moment-timezone");
      const vn = mtz.tz("Asia/Ho_Chi_Minh");
      syncData.lastSyncTime = vn.toISOString();
      syncData.syncCount = (syncData.syncCount || 0) + 1;
      syncData.lastSyncTimestamp = Date.now();
      syncData.lastSyncDate = vn.format("YYYY-MM-DD");
      writeSyncData(syncData);
    } catch (error) {
      const syncData = readSyncData();
      syncData.lastError = { message: error.message, time: new Date().toISOString() };
      writeSyncData(syncData);
    }
  }

  const calculateNextSyncTime = () => {
    const syncData = readSyncData();
    const mtz = require("moment-timezone");
    const now = mtz.tz("Asia/Ho_Chi_Minh");
    const nextMidnight = mtz.tz("Asia/Ho_Chi_Minh").add(1, "day").startOf("day");
    const until = nextMidnight.valueOf() - now.valueOf();
    if (syncData.lastSyncDate !== now.format("YYYY-MM-DD")) return 1000;
    return until;
  };

  const setupDailySync = () => {
    const mtz = require("moment-timezone");
    const now = mtz.tz("Asia/Ho_Chi_Minh");
    const nextMidnight = mtz.tz("Asia/Ho_Chi_Minh").add(1, "day").startOf("day");
    const until = nextMidnight.valueOf() - now.valueOf();
    setTimeout(() => { callUpbotSync(); setupDailySync(); }, until);
  };

  const initializeSync = () => {
    const syncData = readSyncData();
    const mtz = require("moment-timezone");
    const now = mtz.tz("Asia/Ho_Chi_Minh");
    if (syncData.lastSyncDate !== now.format("YYYY-MM-DD")) setTimeout(() => { callUpbotSync(); }, 5000);
    setupDailySync();
  };

  initializeSync();

  const processedEvents = new Set();
  const PROCESSED_EVENT_TTL = 5000;

  if (!global.mqttEventEmitter) global.mqttEventEmitter = new (require("events"))();

  return async function ({ event }) {
    const timeStart = Date.now();
    const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L");
    const { userBanned, threadBanned } = global.data;
    const { events } = global.client;
    const { allowInbox, DeveloperMode } = global.config;
    var { senderID, threadID, logMessageType, messageID } = event;
    senderID = String(senderID);
    threadID = String(threadID);
    if (userBanned.has(senderID) || threadBanned.has(threadID) || (allowInbox === false && senderID === threadID)) return;

    const today = new Date().toDateString();
    let lastChecked = null;
    if (fs.existsSync(lastCheckPath)) {
      try { lastChecked = JSON.parse(fs.readFileSync(lastCheckPath, "utf-8")).lastDate; } catch {}
    }
    if (lastChecked !== today) await checkExpiredRentGroups();

    const eventKey = `${threadID}_${logMessageType || event.type}_${messageID}`;
    const isLogEvent = logMessageType && logMessageType.startsWith("log:");
    if (isLogEvent) {
      const isAlreadyProcessed = processedEvents.has(eventKey);
      if (!isAlreadyProcessed) {
        processedEvents.add(eventKey);
        setTimeout(() => { processedEvents.delete(eventKey); }, PROCESSED_EVENT_TTL);
      }
    }

    if (logMessageType && threadID !== api.getCurrentUserID()) {
      let thuebot;
      try {
        thuebot = fs.existsSync(thuebotPath) ? JSON.parse(fs.readFileSync(thuebotPath, "utf-8")) : [];
      } catch { thuebot = []; }
      const now = Date.now();
      thuebot = thuebot.filter(item => item.expiresAt && new Date(item.expiresAt).getTime() > now);
      const isRented = thuebot.some(item => item.t_id === threadID);
      if (!global.config.ADMINBOT.includes(event.author || event.senderID) && !isRented) return;
    }

    for (const [key, value] of events.entries()) {
      if (value.config.eventType.includes(event.logMessageType || event.type)) {
        if (isLogEvent && processedEvents.has(eventKey)) continue;
        const eventRun = events.get(key);
        try {
          const Obj = { api, event, models, Users, Threads, Currencies };
          await eventRun.run(Obj);
          if (DeveloperMode === true) logger(global.getText("handleEvent", "executeEvent", time, eventRun.config.name, threadID, Date.now() - timeStart), "[ Event ]");
        } catch (error) {
          logger(global.getText("handleEvent", "eventError", eventRun.config.name, JSON.stringify(error)), "error");
        }
      }
    }
  };
};