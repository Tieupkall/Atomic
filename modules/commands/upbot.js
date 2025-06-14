const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
  name: "upbot",
  version: "1.2.7",
  hasPermssion: 3,
  credits: "Atomic",
  description: "Hiển thị thông tin bot và đồng bộ tên bot kèm thời gian thuê",
  commandCategory: "Admin",
  usages: "[+ sync]",
  cooldowns: 5
};

const thuePath = path.join(__dirname, "cache", "data", "thuebot.json");

const getThuebot = () => {
  try {
    if (!fs.existsSync(thuePath)) return [];
    const data = fs.readFileSync(thuePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("[upbot] Lỗi đọc file thuebot.json:", error);
    return [];
  }
};

// Hàm tính thời gian còn lại chi tiết (giống rent.js)
const calculateTimeRemaining = (expiresAt) => {
  const now = Date.now();
  const expireTime = new Date(expiresAt).getTime();
  const remaining = expireTime - now;
  
  if (remaining <= 0) return null;
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  let timeText = "";
  if (days > 0) timeText += `${days} ngày`;
  if (hours > 0) {
    if (timeText) timeText += " ";
    timeText += `${hours} giờ`;
  }
  if (minutes > 0 && days === 0) { // Chỉ hiện phút nếu dưới 1 ngày
    if (timeText) timeText += " ";
    timeText += `${minutes} phút`;
  }
  
  return timeText.trim() || "dưới 1 phút";
};

// Hàm làm sạch dữ liệu hết hạn
const cleanExpiredData = (thuebotData) => {
  const now = Date.now();
  return thuebotData.filter(item => {
    const expireTime = new Date(item.expiresAt).getTime();
    return expireTime > now;
  });
};

// Hàm lưu dữ liệu đã làm sạch
const saveCleanedData = (cleanedData) => {
  try {
    const dir = path.dirname(thuePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(thuePath, JSON.stringify(cleanedData, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[upbot] Lỗi lưu file thuebot.json:", error);
    return false;
  }
};

const getNicknameWithRent = (tID, botName) => {
  let thuebotData = getThuebot();
  
  // Làm sạch dữ liệu hết hạn
  const cleanedData = cleanExpiredData(thuebotData);
  if (cleanedData.length !== thuebotData.length) {
    saveCleanedData(cleanedData);
    thuebotData = cleanedData;
  }
  
  const entry = thuebotData.find(e => e.t_id === tID);
  if (!entry) return `${botName} | Chưa thuê`;
  
  const timeRemaining = calculateTimeRemaining(entry.expiresAt);
  if (!timeRemaining) {
    // Nếu hết hạn, loại bỏ khỏi dữ liệu
    const updatedData = thuebotData.filter(e => e.t_id !== tID);
    saveCleanedData(updatedData);
    return `${botName} | Chưa thuê`;
  }
  
  return `${botName} | ${timeRemaining}`;
};

module.exports.run = async function ({ api, event = {}, args, Users }) {
  const { threadID, messageID } = event;
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "BOT";

  if (args[0] === "sync") {
    let threads = [];
    try {
      threads = await api.getThreadList(100, null, ["INBOX"]);
    } catch (e) {
      return api.sendMessage("❌ Không thể lấy danh sách nhóm.", threadID, messageID);
    }

    const groups = threads.filter(t => t.isGroup);
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const group of groups) {
      try {
        const newNick = getNicknameWithRent(group.threadID, botName);
        await api.changeNickname(newNick, group.threadID, botID);
        results.push(`✔️ ${group.name || "Không tên"}`);
        successCount++;
        
        // Delay nhỏ để tránh spam API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push(`❌ ${group.name || "Không tên"}: ${error.message}`);
        errorCount++;
      }
    }

    const summary = `🔁 KẾT QUẢ ĐỒNG BỘ TÊN BOT\n` +
                   `✅ Thành công: ${successCount}/${groups.length}\n` +
                   `❌ Lỗi: ${errorCount}/${groups.length}\n\n` +
                   `📋 CHI TIẾT:\n${results.join("\n")}`;

    return api.sendMessage(summary, threadID, messageID);
  }

  // Nếu không phải "sync" → hiện thông tin bot
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
        
        // Đếm nhóm đã được duyệt
        if (thuebotData.find(e => e.t_id === group.threadID)) {
          approvedGroups++;
        }
      } catch {}
    }
  } catch {}

  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  let uptimeText = "";
  if (days > 0) uptimeText += `${days} ngày `;
  if (hours > 0) uptimeText += `${hours} giờ `;
  if (minutes > 0) uptimeText += `${minutes} phút `;
  uptimeText += `${seconds} giây`;
  
  const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY");

  const adminIDs = global.config.ADMINBOT || [];
  const adminNames = await Promise.all(
    adminIDs.map(async id => {
      try {
        return await Users.getNameUser(id) || `UID: ${id}`;
      } catch {
        return `UID: ${id}`;
      }
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
    `📌 Sử dụng: ${global.config.PREFIX || ''}upbot sync\n` +
    `💡 Để cập nhật biệt danh bot với thời gian thuê.`;

  return threadID && api.sendMessage(msg, threadID, messageID);
};

// ====== Hàm auto gọi từ handleEvent.js ======
module.exports.autoSync = async function ({ api }) {
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "BOT";

  let threads = [];
  try {
    threads = await api.getThreadList(100, null, ["INBOX"]);
  } catch (e) {
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
      
      // Delay để tránh spam API
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.log(`[upbot.autoSync] ❌ ${group.name || group.threadID}: ${err.message}`);
    }
  }
  
  console.log(`[upbot.autoSync] ✅ Đã đồng bộ ${syncCount}/${groups.length} nhóm`);
};

// ====== Hàm kiểm tra và thông báo hết hạn ======
module.exports.checkExpired = async function ({ api }) {
  const thuebotData = getThuebot();
  const now = Date.now();
  const expiredEntries = [];
  const soonExpiredEntries = [];
  
  thuebotData.forEach(entry => {
    const expireTime = new Date(entry.expiresAt).getTime();
    const remaining = expireTime - now;
    const hoursLeft = remaining / (60 * 60 * 1000);
    
    if (remaining <= 0) {
      expiredEntries.push(entry);
    } else if (hoursLeft <= 24) { // Sắp hết hạn trong 24h
      soonExpiredEntries.push({
        ...entry,
        timeLeft: calculateTimeRemaining(entry.expiresAt)
      });
    }
  });
  
  // Gửi thông báo cho admin về các nhóm hết hạn
  const adminIDs = global.config.ADMINBOT || [];
  
  if (expiredEntries.length > 0) {
    const msg = `⚠️ CÓ ${expiredEntries.length} NHÓM ĐÃ HẾT HẠN THUÊ:\n\n` +
                expiredEntries.map((entry, i) => 
                  `${i + 1}. ${entry.groupName || 'Không tên'}\n   ID: ${entry.t_id}`
                ).join('\n\n');
    
    for (const adminID of adminIDs) {
      try {
        await api.sendMessage(msg, adminID);
      } catch {}
    }
  }
  
  if (soonExpiredEntries.length > 0) {
    const msg = `🔔 CÓ ${soonExpiredEntries.length} NHÓM SẮP HẾT HẠN:\n\n` +
                soonExpiredEntries.map((entry, i) => 
                  `${i + 1}. ${entry.groupName || 'Không tên'}\n   ID: ${entry.t_id}\n   ⏰ Còn: ${entry.timeLeft}`
                ).join('\n\n');
    
    for (const adminID of adminIDs) {
      try {
        await api.sendMessage(msg, adminID);
      } catch {}
    }
  }
  
  // Làm sạch dữ liệu hết hạn
  const cleanedData = cleanExpiredData(thuebotData);
  if (cleanedData.length !== thuebotData.length) {
    saveCleanedData(cleanedData);
    console.log(`[upbot.checkExpired] 🧹 Đã dọn dẹp ${thuebotData.length - cleanedData.length} entry hết hạn`);
  }
};