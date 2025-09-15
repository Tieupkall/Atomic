const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "rent",
  version: "1.2.3",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Duyệt hoặc gỡ duyệt nhóm trong số ngày/phút chỉ định",
  commandCategory: "Admin",
  usages: "[số ngày] [phút] - mặc định 7 ngày",
  cooldowns: 5
};

const filePath = path.join(__dirname, "cache", "data", "thuebot.json");

function getPrefix(threadID) {
  const cfg = global.config || {};
  const map = cfg.GROUP_PREFIX || {};
  if (threadID && map[threadID]) return map[threadID];
  return (typeof cfg.PREFIX === "string" && cfg.PREFIX) ? cfg.PREFIX : "/";
}

const ensureDirectoryExists = () => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readThuebot = () => {
  try {
    ensureDirectoryExists();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveThuebot = (data) => {
  try {
    ensureDirectoryExists();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
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

const cleanExpiredData = (thuebot) => {
  const now = Date.now();
  return thuebot.filter(item => new Date(item.expiresAt).getTime() > now);
};

module.exports.run = async ({ api, event }) => {
  const { threadID, senderID } = event;
  const adminBot = global.config.ADMINBOT || [];
  if (!adminBot.includes(senderID)) return api.sendMessage("❌ Bạn không có quyền sử dụng lệnh này.", threadID);

  let thuebot = readThuebot();
  const cleanedData = cleanExpiredData(thuebot);
  if (cleanedData.length !== thuebot.length) {
    saveThuebot(cleanedData);
    thuebot = cleanedData;
  }

  const listGroup = (await api.getThreadList(100, null, ["INBOX"])).filter(t => t.isGroup);
  if (!listGroup.length) return api.sendMessage("⚠️ Không tìm thấy nhóm nào.", threadID);

  let msg = "📋 DANH SÁCH NHÓM BOT ĐANG THAM GIA\n\n";
  listGroup.forEach((g, i) => {
    const entry = thuebot.find(e => e.t_id === g.threadID);
    let status = "❌ Chưa duyệt";
    if (entry) {
      const timeRemaining = calculateTimeRemaining(entry.expiresAt);
      status = timeRemaining ? `✅ Đã duyệt (Còn lại: ${timeRemaining})` : "❌ Chưa duyệt (Đã hết hạn)";
    }
    msg += `${i + 1}. ${g.name}\nID: ${g.threadID}\n➡️ ${status}\n\n`;
  });
  msg += "📌 Reply số thứ tự để duyệt hoặc gỡ duyệt nhóm.\n🕒 Cú pháp: STT [số ngày] [số phút]\n👥 STT [join]\n🚪 STT [out]\n";

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

  if (input.length >= 2 && input[1].toLowerCase() === "out") {
    const outIndex = parseInt(input[0]);
    if (isNaN(outIndex) || outIndex < 1 || outIndex > data.length) return api.sendMessage("⚠️ Số thứ tự không hợp lệ.", event.threadID);
    const selected = data[outIndex - 1];
    const { threadID, name } = selected;
    api.removeUserFromGroup(api.getCurrentUserID(), threadID, (err) => {
      if (err) return api.sendMessage("❌ Không thể thoát khỏi nhóm.", event.threadID);
      api.sendMessage(`✅ Bot đã thoát khỏi nhóm "${name}"\n🆔 ${threadID}`, event.threadID);
    });
    return;
  }

  if (input.length >= 2 && input[1].toLowerCase() === "join") {
    const joinIndex = parseInt(input[0]);
    if (isNaN(joinIndex) || joinIndex < 1 || joinIndex > data.length) return api.sendMessage("⚠️ Số thứ tự không hợp lệ.", event.threadID);
    const selected = data[joinIndex - 1];
    const { threadID, name } = selected;
    const senderID = event.senderID;
    try {
      const threadInfo = await api.getThreadInfo(threadID);
      if (threadInfo.participantIDs.includes(senderID)) return api.sendMessage("⚠️ Bạn đã có trong nhóm này rồi!", event.threadID);
    } catch {}
    let userName = "Người dùng";
    try {
      const userInfo = await api.getUserInfo(senderID);
      if (userInfo[senderID]) userName = userInfo[senderID].name;
    } catch {}
    api.addUserToGroup(senderID, threadID, (err) => {
      if (err) return api.sendMessage("❌ Không thể thêm bạn vào nhóm.", event.threadID);
      api.sendMessage(`✅ Đã thêm ${userName} vào nhóm "${name}"\n🆔 ${threadID}`, event.threadID);
    });
    return;
  }

  const index = parseInt(input[0]);
  const days = parseInt(input[1]) || 0;
  const minutes = parseInt(input[2]) || 0;
  if (isNaN(index) || index < 1 || index > data.length) return api.sendMessage("⚠️ Số thứ tự không hợp lệ.", event.threadID);

  const selected = data[index - 1];
  const { threadID, name } = selected;
  let thuebot = cleanExpiredData(readThuebot());
  const existingEntry = thuebot.find(item => item.t_id === threadID);
  const botID = api.getCurrentUserID();
  const botName = global.config.BOTNAME || "Bot";
  const prefix = getPrefix(threadID);
  let responseMsg = "";

  if (existingEntry) {
    if (days === 0 && minutes === 0) {
      thuebot = thuebot.filter(item => item.t_id !== threadID);
      responseMsg = `❌ Đã gỡ duyệt nhóm:\n📌 ${name}\n🆔 ${threadID}`;
      await api.changeNickname(`[ ${prefix} ] • ${botName} | Chưa thuê`, threadID, botID);
    } else {
      const currentExpireTime = new Date(existingEntry.expiresAt).getTime();
      const now = Date.now();
      const remainingTime = Math.max(0, currentExpireTime - now);
      const additionalMs = (days * 24 * 60 * 60 * 1000) + (minutes * 60 * 1000);
      const newExpireTime = now + remainingTime + additionalMs;
      let totalTimeText = "";
      const totalDays = Math.floor((newExpireTime - now) / (24 * 60 * 60 * 1000));
      const totalHours = Math.floor(((newExpireTime - now) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const totalMinutes = Math.floor(((newExpireTime - now) % (60 * 60 * 1000)) / (60 * 1000));
      if (totalDays > 0) totalTimeText += `${totalDays} ngày`;
      if (totalHours > 0) totalTimeText += ` ${totalHours} giờ`;
      if (totalMinutes > 0 && totalDays === 0) totalTimeText += ` ${totalMinutes} phút`;
      const updatedEntry = { ...existingEntry, expiresAt: new Date(newExpireTime).toISOString(), durationText: totalTimeText || "dưới 1 phút", time_end: new Date(newExpireTime).toLocaleDateString('vi-VN') };
      thuebot[thuebot.findIndex(item => item.t_id === threadID)] = updatedEntry;
      responseMsg = `✅ Đã gia hạn nhóm:\n📌 ${name}\n🆔 ${threadID}\n🕒 Tổng còn lại: ${totalTimeText || "dưới 1 phút"}\n⏰ Hết hạn: ${new Date(newExpireTime).toLocaleString('vi-VN')}`;
      await api.changeNickname(`[ ${prefix} ] • ${botName} | ${totalTimeText || "dưới 1 phút"}`, threadID, botID);
    }
  } else {
    if (days === 0 && minutes === 0) return api.sendMessage("⚠️ Bạn phải nhập thời gian hợp lệ.", event.threadID);
    const now = Date.now();
    const totalMs = (days * 24 * 60 * 60 * 1000) + (minutes * 60 * 1000);
    const expireTime = now + totalMs;
    let durationText = "";
    if (days > 0) durationText += `${days} ngày`;
    if (minutes > 0) durationText += ` ${minutes} phút`;
    const newEntry = { t_id: threadID, groupName: name, expiresAt: new Date(expireTime).toISOString(), createdAt: new Date(now).toISOString(), durationText, durationDays: days, durationMinutes: minutes, time_end: new Date(expireTime).toLocaleDateString('vi-VN') };
    thuebot.push(newEntry);
    responseMsg = `✅ Đã duyệt nhóm:\n📌 ${name}\n🆔 ${threadID}\n🕒 ${durationText}\n⏰ Hết hạn: ${new Date(expireTime).toLocaleString('vi-VN')}`;
    await api.changeNickname(`[ ${prefix} ] • ${botName} | ${durationText}`, threadID, botID);
  }

  if (!saveThuebot(thuebot)) return api.sendMessage("❌ Không thể lưu dữ liệu.", event.threadID);
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