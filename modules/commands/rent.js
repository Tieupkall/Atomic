const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "rent",
  version: "1.2.2",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Duyệt hoặc gỡ duyệt nhóm trong số ngày/phút chỉ định",
  commandCategory: "admin",
  usages: "[số ngày] [phút] - mặc định 7 ngày",
  cooldowns: 5
};

const filePath = path.join(__dirname, "cache", "data", "thuebot.json");

// Đảm bảo thư mục tồn tại
const ensureDirectoryExists = () => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readThuebot = () => {
  try {
    ensureDirectoryExists();
    if (!fs.existsSync(filePath)) {
      // Tạo file mới nếu không tồn tại
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc file thuebot.json:", error);
    return [];
  }
};

const saveThuebot = (data) => {
  try {
    ensureDirectoryExists();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Lỗi lưu file thuebot.json:", error);
    return false;
  }
};

// Hàm tính thời gian còn lại
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

// Hàm làm sạch dữ liệu hết hạn
const cleanExpiredData = (thuebot) => {
  const now = Date.now();
  return thuebot.filter(item => {
    const expireTime = new Date(item.expiresAt).getTime();
    return expireTime > now;
  });
};

module.exports.run = async ({ api, event, args }) => {
  const { threadID, senderID } = event;
  const adminBot = global.config.ADMINBOT || [];

  if (!adminBot.includes(senderID)) {
    return api.sendMessage("❌ Bạn không có quyền sử dụng lệnh này.", threadID);
  }

  let thuebot = readThuebot();
  
  // Làm sạch dữ liệu hết hạn
  const cleanedData = cleanExpiredData(thuebot);
  if (cleanedData.length !== thuebot.length) {
    saveThuebot(cleanedData);
    thuebot = cleanedData;
  }

  const listGroup = (await api.getThreadList(100, null, ["INBOX"])).filter(t => t.isGroup);
  if (!listGroup.length) return api.sendMessage("⚠️ Không tìm thấy nhóm nào.", threadID);

  let msg = "📋 DANH SÁCH NHÓM BOT ĐANG THAM GIA\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n";
  
  listGroup.forEach((g, i) => {
    const entry = thuebot.find(e => e.t_id === g.threadID);
    let status = "❌ Chưa duyệt";
    
    if (entry) {
      const timeRemaining = calculateTimeRemaining(entry.expiresAt);
      if (timeRemaining) {
        status = `✅ Đã duyệt (Còn lại: ${timeRemaining})`;
      } else {
        status = "❌ Chưa duyệt (Đã hết hạn)";
      }
    }
    
    msg += `${i + 1}. ${g.name}\n   ID: ${g.threadID}\n   ➡️ ${status}\n\n`;
  });

  msg += "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n📌 Reply số thứ tự để duyệt hoặc gỡ duyệt nhóm.\n";
  msg += "🕒 Cú pháp: STT [số ngày] [số phút] (nếu duyệt mới)\n";
  msg += "💡 Ví dụ: 1 7 0 (duyệt nhóm 1 trong 7 ngày)";

  api.sendMessage(msg, threadID, (err, info) => {
    if (!err) {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: senderID,
        type: "selectGroup",
        data: listGroup
      });
      setTimeout(() => api.unsendMessage(info.messageID), 60000);
    }
  });
};

module.exports.handleReply = async ({ api, event, handleReply }) => {
  const { author, data, messageID: replyMessageID } = handleReply;
  if (event.senderID !== author) return;

  const input = event.body.trim().split(/\s+/);
  const index = parseInt(input[0]);
  const days = parseInt(input[1]) || 0;
  const minutes = parseInt(input[2]) || 0;

  if (isNaN(index) || index < 1 || index > data.length) {
    return api.sendMessage("⚠️ Số thứ tự không hợp lệ.", event.threadID);
  }

  const selected = data[index - 1];
  const { threadID, name } = selected;
  let thuebot = readThuebot();
  
  // Làm sạch dữ liệu hết hạn
  thuebot = cleanExpiredData(thuebot);
  
  const existingEntry = thuebot.find(item => item.t_id === threadID);
  const isApproved = !!existingEntry;

  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "Bot";
  let responseMsg = "";

  if (isApproved) {
    // Gỡ duyệt
    thuebot = thuebot.filter(item => item.t_id !== threadID);
    responseMsg = `❌ Đã gỡ duyệt nhóm:\n📌 ${name}\n🆔 ${threadID}`;
    
    try {
      await api.changeNickname(`${botName} | Chưa thuê`, threadID, botID);
    } catch (e) {
      console.error("Lỗi đổi nickname:", e);
    }
  } else {
    // Duyệt mới - cần thời gian hợp lệ
    if (days === 0 && minutes === 0) {
      return api.sendMessage("⚠️ Bạn phải nhập thời gian hợp lệ.\n💡 Ví dụ: 1 7 0 (7 ngày) hoặc 1 0 30 (30 phút)", event.threadID);
    }

    const now = Date.now();
    const totalMs = (days * 24 * 60 * 60 * 1000) + (minutes * 60 * 1000);
    const expireTime = now + totalMs;
    
    // Tạo text hiển thị thời gian
    let durationText = "";
    if (days > 0) durationText += `${days} ngày`;
    if (minutes > 0) {
      if (durationText) durationText += " ";
      durationText += `${minutes} phút`;
    }

    const newEntry = {
      t_id: threadID,
      groupName: name,
      expiresAt: new Date(expireTime).toISOString(),
      createdAt: new Date(now).toISOString(),
      durationText: durationText,
      durationDays: days,
      durationMinutes: minutes
    };

    thuebot.push(newEntry);
    
    responseMsg = `✅ Đã duyệt nhóm:\n📌 ${name}\n🆔 ${threadID}\n🕒 Thời hạn: ${durationText}\n⏰ Hết hạn lúc: ${new Date(expireTime).toLocaleString('vi-VN')}`;
    
    try {
      await api.changeNickname(`${botName} | ${durationText}`, threadID, botID);
    } catch (e) {
      console.error("Lỗi đổi nickname:", e);
    }
  }

  if (!saveThuebot(thuebot)) {
    return api.sendMessage("❌ Không thể lưu dữ liệu. Vui lòng thử lại.", event.threadID);
  }

  api.sendMessage(responseMsg, event.threadID, (err, info) => {
    if (!err) {
      setTimeout(() => {
        api.unsendMessage(info.messageID).catch(() => {});
        api.unsendMessage(event.messageID).catch(() => {});
        api.unsendMessage(replyMessageID).catch(() => {});
      }, 20000);
    }
  });
};