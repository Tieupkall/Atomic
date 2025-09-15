const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
  name: "upbot",
  version: "1.2.8",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Hiển thị thông tin bot và đồng bộ tên bot kèm thời gian thuê",
  commandCategory: "Hệ thống",
  usages: "[+ sync]",
  cooldowns: 5,
  usePrefix: true
};

const thuePath = path.join(__dirname, "cache", "data", "thuebot.json");

function getPrefix(threadID) {
  const cfg = global.config || {};
  const m = cfg.GROUP_PREFIX || {};
  if (threadID && m[threadID]) return m[threadID];
  return typeof cfg.PREFIX === "string" && cfg.PREFIX ? cfg.PREFIX : "/";
}

const getThuebot = () => {
  try {
    if (!fs.existsSync(thuePath)) return [];
    const data = fs.readFileSync(thuePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
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

const cleanExpiredData = (thuebotData) => {
  const now = Date.now();
  return thuebotData.filter(i => new Date(i.expiresAt).getTime() > now);
};

const saveCleanedData = (cleanedData) => {
  try {
    const dir = path.dirname(thuePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(thuePath, JSON.stringify(cleanedData, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
};

const getNicknameWithRent = (tID, botName) => {
  let thuebotData = getThuebot();
  const prefix = getPrefix(tID);
  const cleanedData = cleanExpiredData(thuebotData);
  if (cleanedData.length !== thuebotData.length) {
    saveCleanedData(cleanedData);
    thuebotData = cleanedData;
  }
  const entry = thuebotData.find(e => e.t_id === tID);
  if (!entry) return `[ ${prefix} ] • ${botName} | Chưa thuê`;
  const timeRemaining = calculateTimeRemaining(entry.expiresAt);
  if (!timeRemaining) {
    const updatedData = thuebotData.filter(e => e.t_id !== tID);
    saveCleanedData(updatedData);
    return `[ ${prefix} ] • ${botName} | Chưa thuê`;
  }
  return `[ ${prefix} ] • ${botName} | ${timeRemaining}`;
};

module.exports.run = async function ({ api, event = {}, args, Users }) {
  const { threadID, messageID } = event;
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "BOT";

  if (args[0] === "sync") {
    let threads = [];
    try {
      threads = await api.getThreadList(100, null, ["INBOX"]);
    } catch {
      return api.sendMessage("❌ Không thể lấy danh sách nhóm.", threadID, messageID);
    }
    const groups = threads.filter(t => t.isGroup);
    let successCount = 0, errorCount = 0;
    const results = [];
    for (const group of groups) {
      try {
        const newNick = getNicknameWithRent(group.threadID, botName);
        const threadInfo = await api.getThreadInfo(group.threadID);
        const currentNick = threadInfo.nicknames ? threadInfo.nicknames[botID] : "";
        if (newNick !== currentNick) {
          await api.changeNickname(newNick, group.threadID, botID);
          results.push(`✔️ ${group.name || "Không tên"} (${currentNick} → ${newNick})`);
        } else {
          results.push(`⏭️ ${group.name || "Không tên"} (đã đúng)`);
        }
        successCount++;
        await new Promise(r => setTimeout(r, 200));
      } catch (error) {
        results.push(`❌ ${group.name || "Không tên"}: ${error.message}`);
        errorCount++;
      }
    }
    const summary =
      `🔁 KẾT QUẢ ĐỒNG BỘ TÊN BOT\n` +
      `✅ Thành công: ${successCount}/${groups.length}\n` +
      `❌ Lỗi: ${errorCount}/${groups.length}\n\n` +
      `📋 CHI TIẾT:\n${results.join("\n")}`;
    return api.sendMessage(summary, threadID, messageID);
  }

  let threads = [];
  const userIDs = new Set();
  let approvedGroups = 0;
  try {
    threads = await api.getThreadList(100, null, ["INBOX"]);
    const groups = threads.filter(t => t.isGroup);
    const thuebotData = cleanExpiredData(getThuebot());
    for (const group of groups) {
      try {
        const info = await api.getThreadInfo(group.threadID);
        info.participantIDs.forEach(id => userIDs.add(id));
        if (thuebotData.find(e => e.t_id === group.threadID)) approvedGroups++;
      } catch {}
    }
  } catch {}

  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeText = `${d ? d + " ngày " : ""}${h ? h + " giờ " : ""}${m ? m + " phút " : ""}${s} giây`;
  const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY");

  const adminIDs = global.config.ADMINBOT || [];
  const adminNames = await Promise.all(
    adminIDs.map(async id => {
      try { return await Users.getNameUser(id) || `UID: ${id}`; } catch { return `UID: ${id}`; }
    })
  );

  const totalGroups = threads.filter(t => t.isGroup).length;
  const freeGroups = totalGroups - approvedGroups;

  const msg =
    `🤖 THÔNG TIN BOT\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
    `🆔 Tên bot: ${botName}\n` +
    `⚙️ Phiên bản: ${module.exports.config.version}\n` +
    `📚 Tổng nhóm: ${totalGroups}\n` +
    `   ├─ ✅ Đã thuê: ${approvedGroups}\n` +
    `   └─ ❌ Chưa thuê: ${freeGroups}\n` +
    `👥 Người dùng: ${userIDs.size}\n` +
    `👑 Admin: ${adminNames.join(", ")}\n` +
    `🕒 Uptime: ${uptimeText}\n` +
    `🗓️ Thời gian: ${time}\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
    `📌 Sử dụng: ${getPrefix(threadID)}upbot sync\n` +
    `💡 Để cập nhật biệt danh bot với thời gian thuê.`;

  if (threadID) {
    const sent = await api.sendMessage(msg, threadID, messageID);
    if (!global.client.handleReaction) global.client.handleReaction = [];
    if (sent && sent.messageID) {
      global.client.handleReaction.push({
        name: module.exports.config.name,
        messageID: sent.messageID,
        author: event.senderID || "system",
        type: "upbot_sync"
      });
    }
    return sent;
  }
};

module.exports.autoSync = async function ({ api }) {
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "BOT";
  let threads = [];
  try { threads = await api.getThreadList(100, null, ["INBOX"]); } catch (e) {
    console.error("[upbot.autoSync] ❌ Không thể lấy danh sách nhóm:", e.message);
    return;
  }
  const groups = threads.filter(t => t.isGroup);
  let syncCount = 0;
  for (const group of groups) {
    try {
      const newNick = getNicknameWithRent(group.threadID, botName);
      await api.changeNickname(newNick, group.threadID, botID);
      syncCount++;
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.log(`[upbot.autoSync] ❌ ${group.name || group.threadID}: ${err.message}`);
    }
  }
  console.log(`[upbot.autoSync] ✅ Đã đồng bộ ${syncCount}/${groups.length} nhóm`);
};

module.exports.checkExpired = async function ({ api }) {
  const thuebotData = getThuebot();
  const now = Date.now();
  const expiredEntries = [];
  const soonExpiredEntries = [];
  thuebotData.forEach(entry => {
    const expireTime = new Date(entry.expiresAt).getTime();
    const remaining = expireTime - now;
    const hoursLeft = remaining / 3600000;
    if (remaining <= 0) expiredEntries.push(entry);
    else if (hoursLeft <= 24) soonExpiredEntries.push({ ...entry, timeLeft: calculateTimeRemaining(entry.expiresAt) });
  });
  const adminIDs = global.config.ADMINBOT || [];
  if (expiredEntries.length > 0) {
    const msg = `⚠️ CÓ ${expiredEntries.length} NHÓM ĐÃ HẾT HẠN THUÊ:\n\n` +
      expiredEntries.map((e, i) => `${i + 1}. ${e.groupName || 'Không tên'}\n   ID: ${e.t_id}`).join('\n\n');
    for (const id of adminIDs) { try { await api.sendMessage(msg, id); } catch {} }
  }
  if (soonExpiredEntries.length > 0) {
    const msg = `🔔 CÓ ${soonExpiredEntries.length} NHÓM SẮP HẾT HẠN:\n\n` +
      soonExpiredEntries.map((e, i) => `${i + 1}. ${e.groupName || 'Không tên'}\n   ID: ${e.t_id}\n   ⏰ Còn: ${e.timeLeft}`).join('\n\n');
    for (const id of adminIDs) { try { await api.sendMessage(msg, id); } catch {} }
  }
  const cleanedData = cleanExpiredData(thuebotData);
  if (cleanedData.length !== thuebotData.length) {
    saveCleanedData(cleanedData);
    console.log(`[upbot.checkExpired] 🧹 Đã dọn dẹp ${thuebotData.length - cleanedData.length} entry hết hạn`);
  }
};

module.exports.handleReaction = async function ({ api, event }) {
  try {
    const { threadID, messageID, userID, reaction } = event;
    const adminBot = global.config.ADMINBOT || [];
    const isAdmin = adminBot.includes(userID) || adminBot.includes(String(userID));
    if (!isAdmin) return;
    if (reaction === "👍") {
      try { await api.setMessageReaction("⏳", messageID); } catch {}
      const botID = api.getCurrentUserID();
      const botName = global.config.BOTNAME || "BOT";
      let threads = [];
      try { threads = await api.getThreadList(100, null, ["INBOX"]); }
      catch { await api.sendMessage("❌ Không thể lấy danh sách nhóm.", threadID, messageID); return; }
      const groups = threads.filter(t => t.isGroup);
      let successCount = 0, errorCount = 0;
      const results = [];
      for (const group of groups) {
        try {
          const newNick = getNicknameWithRent(group.threadID, botName);
          const threadInfo = await api.getThreadInfo(group.threadID);
          const currentNick = threadInfo.nicknames ? threadInfo.nicknames[botID] : "";
          if (newNick !== currentNick) {
            await api.changeNickname(newNick, group.threadID, botID);
            results.push(`✔️ ${group.name || "Không tên"} (${currentNick} → ${newNick})`);
          } else {
            results.push(`⏭️ ${group.name || "Không tên"} (đã đúng)`);
          }
          successCount++;
          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          results.push(`❌ ${group.name || "Không tên"}: ${error.message}`);
          errorCount++;
        }
      }
      const summary =
        `🔁 KẾT QUẢ ĐỒNG BỘ TÊN BOT (VIA REACTION)\n` +
        `✅ Thành công: ${successCount}/${groups.length}\n` +
        `❌ Lỗi: ${errorCount}/${groups.length}\n\n` +
        `📋 CHI TIẾT:\n${results.slice(0, 10).join("\n")}${results.length > 10 ? `\n...(và ${results.length - 10} kết quả khác)` : ""}`;
      try { await api.setMessageReaction("✅", messageID); } catch {}
      return api.sendMessage(summary, threadID, messageID);
    }
  } catch (error) {
    try { await api.setMessageReaction("❌", event.messageID); } catch {}
  }
};