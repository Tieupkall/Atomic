
const fs = require('fs-extra');
const moment = require('moment-timezone');
const pathConfig = __dirname + '/../events/../../data/autoban_config.json';
const pathBanned = __dirname + '/../events/../../data/autoban_banned.json';

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(pathConfig, 'utf-8'));
  } catch (error) {
    return {
      enabled: false,
      maxMessages: 5,
      timeWindow: 10000,
      banDuration: 300000,
      lastUpdated: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };
  }
}

function saveConfig(config) {
  try {
    config.lastUpdated = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    fs.writeFileSync(pathConfig, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

function getBannedUsers() {
  try {
    return JSON.parse(fs.readFileSync(pathBanned, 'utf-8'));
  } catch (error) {
    return {};
  }
}

function saveBannedUsers(data) {
  try {
    fs.writeFileSync(pathBanned, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

module.exports.config = {
  name: "autoban",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "Admin",
  description: "Quản lý hệ thống tự động cấm người spam",
  commandCategory: "Admin",
  usages: "[on/off/set/unban/list/reset]",
  cooldowns: 5
};

module.exports.run = async ({ api, event, args, Users }) => {
  const { threadID, messageID, senderID } = event;
  const config = getConfig();
  
  if (!args[0]) {
    const status = config.enabled ? "🟢 BẬT" : "🔴 TẮT";
    return api.sendMessage(
      `📊 𝗧𝗛Ô𝗡𝗚 𝗧𝗜𝗡 𝗔𝗨𝗧𝗢𝗕𝗔𝗡\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔘 𝗧𝗿𝗮̣𝗻𝗴 𝘁𝗵𝗮́𝗶: ${status}\n` +
      `📨 𝗧𝗶𝗻 𝗻𝗵𝗮̆́𝗻 𝘁𝗼̂́𝗶 𝗱𝗮: ${config.maxMessages}\n` +
      `⏱️ 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝘁𝗶́𝗻𝗵: ${config.timeWindow / 1000} giây\n` +
      `🔒 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝗰𝗮̂́𝗺: ${config.banDuration / 60000} phút\n` +
      `🕐 𝗖𝗮̣̂𝗽 𝗻𝗵𝗮̣̂𝘁: ${config.lastUpdated}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📝 𝗛𝘂̛𝗼̛́𝗻𝗴 𝗱𝗮̂̃𝗻 𝘀𝘂̛̉ 𝗱𝘂̣𝗻𝗴:\n` +
      `• autoban on/off — Bật/tắt hệ thống\n` +
      `• autoban set [số tin] [giây] [phút ban] — Cài đặt\n` +
      `• autoban unban [userID] — Bỏ ban\n` +
      `• autoban list — Danh sách bị ban\n` +
      `• autoban reset — Reset toàn bộ`,
      threadID, messageID
    );
  }

  const action = args[0].toLowerCase();

  switch (action) {
    case "on":
    case "bật":
      config.enabled = true;
      if (saveConfig(config)) {
        api.sendMessage("✅ 𝗛𝗲̣̂ 𝘁𝗵𝗼̂́𝗻𝗴 𝗔𝘂𝘁𝗼𝗯𝗮𝗻 đã được 🟢 𝗕Ậ𝗧!", threadID, messageID);
      } else {
        api.sendMessage("❌ Có lỗi khi lưu cấu hình!", threadID, messageID);
      }
      break;

    case "off":
    case "tắt":
      config.enabled = false;
      if (saveConfig(config)) {
        api.sendMessage("❌ 𝗛𝗲̣̂ 𝘁𝗵𝗼̂́𝗻𝗴 𝗔𝘂𝘁𝗼𝗯𝗮𝗻 đã được 🔴 𝗧Ắ𝗧!", threadID, messageID);
      } else {
        api.sendMessage("❌ Có lỗi khi lưu cấu hình!", threadID, messageID);
      }
      break;

    case "set":
    case "cài":
      const maxMessages = parseInt(args[1]);
      const timeWindow = parseInt(args[2]) * 1000;
      const banDuration = parseInt(args[3]) * 60000;

      if (!maxMessages || !timeWindow || !banDuration) {
        return api.sendMessage(
          `❌ 𝗩𝘂𝗶 𝗹𝗼̀𝗻𝗴 𝗻𝗵𝗮̣̂𝗽 đ𝗮̂̀𝘆 đ𝘂̉ 𝘁𝗵𝗼̂𝗻𝗴 𝘁𝗶𝗻!\n\n` +
          `📌 𝗖𝘂́ 𝗽𝗵𝗮́𝗽: autoban set [số tin nhắn] [giây] [phút ban]\n` +
          `📥 𝗩𝗶́ 𝗱𝘂̣: autoban set 5 10 5`,
          threadID, messageID
        );
      }

      if (maxMessages < 2 || maxMessages > 20) {
        return api.sendMessage("❌ 𝗦𝗼̂́ 𝘁𝗶𝗻 𝗻𝗵𝗮̆́𝗻 𝗽𝗵𝗮̉𝗶 𝘁𝘂̛̀ 𝟮 đ𝗲̂́𝗻 𝟮𝟬!", threadID, messageID);
      }

      if (timeWindow < 3000 || timeWindow > 60000) {
        return api.sendMessage("❌ 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝗽𝗵𝗮̉𝗶 𝘁𝘂̛̀ 𝟯 đ𝗲̂́𝗻 𝟲𝟬 𝗴𝗶𝗮̂𝘆!", threadID, messageID);
      }

      if (banDuration < 60000 || banDuration > 3600000) {
        return api.sendMessage("❌ 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝗯𝗮𝗻 𝗽𝗵𝗮̉𝗶 𝘁𝘂̛̀ 𝟭 đ𝗲̂́𝗻 𝟲𝟬 𝗽𝗵𝘂́𝘁!", threadID, messageID);
      }

      config.maxMessages = maxMessages;
      config.timeWindow = timeWindow;
      config.banDuration = banDuration;

      if (saveConfig(config)) {
        api.sendMessage(
          `✅ 𝗖𝗮̣̂𝗽 𝗻𝗵𝗮̣̂𝘁 𝗰𝗮̂́𝘂 𝗵𝗶̀𝗻𝗵 𝗔𝘂𝘁𝗼𝗯𝗮𝗻 𝘁𝗵𝗮̀𝗻𝗵 𝗰𝗼̂𝗻𝗴!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📨 𝗧𝗶𝗻 𝗻𝗵𝗮̆́𝗻 𝘁𝗼̂́𝗶 𝗱𝗮: ${maxMessages}\n` +
          `⏱️ 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝘁𝗶́𝗻𝗵: ${timeWindow / 1000} giây\n` +
          `🔒 𝗧𝗵𝗼̛̀𝗶 𝗴𝗶𝗮𝗻 𝗯𝗮𝗻: ${banDuration / 60000} phút`,
          threadID, messageID
        );
      } else {
        api.sendMessage("❌ Có lỗi khi lưu cấu hình!", threadID, messageID);
      }
      break;

    case "unban":
    case "bỏban":
      const userID = args[1];
      if (!userID) {
        return api.sendMessage("❌ Vui lòng nhập UserID cần bỏ ban!", threadID, messageID);
      }

      const bannedUsers = getBannedUsers();
      if (bannedUsers[userID]) {
        delete bannedUsers[userID];
        if (saveBannedUsers(bannedUsers)) {
          api.sendMessage(`✅ Đã bỏ ban thành công cho UserID: ${userID}`, threadID, messageID);
        } else {
          api.sendMessage("❌ Có lỗi khi bỏ ban!", threadID, messageID);
        }
      } else {
        api.sendMessage("❌ UserID này không có trong danh sách bị ban!", threadID, messageID);
      }
      break;

    case "list":
    case "ds":
      const banned = getBannedUsers();
      const bannedList = Object.keys(banned);
      
      if (bannedList.length === 0) {
        return api.sendMessage("✅ Hiện tại không có ai bị ban!", threadID, messageID);
      }

      let listMessage = `📋 𝗗𝗔𝗡𝗛 𝗦𝗔́𝗖𝗛 𝗕Ị 𝗕𝗔𝗡 (${bannedList.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      for (let i = 0; i < Math.min(bannedList.length, 10); i++) {
        const userID = bannedList[i];
        const banInfo = banned[userID];
        const remaining = banInfo.unbanTime - Date.now();
        
        if (remaining > 0) {
          listMessage += `${i + 1}. UserID: ${userID}\n`;
          listMessage += `   📝 Lý do: ${banInfo.reason}\n`;
          listMessage += `   ⏰ Còn lại: ${Math.ceil(remaining / 1000)}s\n\n`;
        }
      }

      if (bannedList.length > 10) {
        listMessage += `\n... và ${bannedList.length - 10} người khác`;
      }

      api.sendMessage(listMessage, threadID, messageID);
      break;

    case "reset":
    case "xóa":
      // Reset spam tracker
      if (global.client.autobanSpam) {
        global.client.autobanSpam = {};
      }
      
      // Reset banned users
      if (saveBannedUsers({})) {
        api.sendMessage("✅ Đã reset toàn bộ dữ liệu Autoban!", threadID, messageID);
      } else {
        api.sendMessage("❌ Có lỗi khi reset dữ liệu!", threadID, messageID);
      }
      break;

    default:
      api.sendMessage(
        `❌ 𝗟𝗲̣̂𝗻𝗵 𝗸𝗵𝗼̂𝗻𝗴 𝗵𝗼̛̣𝗽 𝗹𝗲̣̂!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 𝗖𝗮́𝗰 𝗹𝗲̣̂𝗻𝗵 𝗰𝗼́ 𝘀𝗮̆̃𝗻:\n` +
        `• autoban on/off — Bật/tắt\n` +
        `• autoban set [số tin] [giây] [phút ban] — Cài đặt\n` +
        `• autoban unban [userID] — Bỏ ban\n` +
        `• autoban list — Xem danh sách\n` +
        `• autoban reset — Reset toàn bộ\n` +
        `• autoban — Xem thông tin`,
        threadID, messageID
      );
  }
};
