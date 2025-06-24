const fs = require("fs-extra");
const path = require("path");

// Đường dẫn file dữ liệu riêng cho antibd
const pathData = path.join(__dirname, "../data/antinickname.json");

module.exports.config = {
  name: "antibd",
  version: "1.5.0",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Bật/tắt hoặc cập nhật biệt danh thành viên",
  usages: "[on | off | update | status]",
  hasPrefix: false,
  commandCategory: "Quản Trị Viên",
  cooldowns: 5
};

// Hàm kiểm tra module có được bật không từ anti manager
function isModuleEnabled(threadID) {
  try {
    // Thử import anti manager để kiểm tra trạng thái
    const antiManager = require('./commands/anti.js');
    if (antiManager && typeof antiManager.isEnabled === 'function') {
      return antiManager.isEnabled('antibd', threadID);
    }
  } catch (error) {
    console.log("Anti manager not found, using local control");
  }
  
  // Fallback: kiểm tra từ file local nếu không có anti manager
  return true;
}

// Hàm đọc dữ liệu với error handling
async function readAntiData() {
  try {
    const data = await fs.readJSON(pathData);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error reading antibd data:", error);
    return [];
  }
}

// Hàm ghi dữ liệu với error handling
async function writeAntiData(data) {
  try {
    await fs.ensureDir(path.dirname(pathData));
    await fs.writeJSON(pathData, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error("Error writing antibd data:", error);
    return false;
  }
}

// Hàm lấy thông tin nhóm an toàn
async function getThreadInfoSafely(api, threadID) {
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    return {
      success: true,
      data: threadInfo
    };
  } catch (error) {
    console.error(`Error getting thread info for ${threadID}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Hàm lọc nickname của thành viên còn trong nhóm
function filterValidNicknames(nicknames, participantIDs) {
  const filtered = {};
  
  if (!nicknames || !participantIDs) return filtered;
  
  for (const [uid, nick] of Object.entries(nicknames)) {
    if (participantIDs.includes(uid)) {
      filtered[uid] = nick;
    }
  }
  
  return filtered;
}

// Hàm tạo thống kê biệt danh
function createNicknameStats(nicknames) {
  const total = Object.keys(nicknames).length;
  const withNickname = Object.values(nicknames).filter(nick => nick && nick.trim()).length;
  const withoutNickname = total - withNickname;
  
  return { total, withNickname, withoutNickname };
}

module.exports.run = async function ({ event, api, args }) {
  const { threadID, senderID } = event;
  const type = args[0]?.toLowerCase();

  // Kiểm tra module có được bật không
  if (!isModuleEnabled(threadID)) {
    return api.sendMessage("⚠️ Module Anti Biệt danh đang bị tắt bởi Anti Manager.\nDùng lệnh `anti` để bật lại.", threadID);
  }

  // Đọc dữ liệu hiện tại
  const antiData = await readAntiData();
  const findIndex = antiData.findIndex(e => e.threadID === threadID);
  const threadEntry = antiData[findIndex] || { threadID, data: {}, createdAt: Date.now() };

  // Lấy thông tin nhóm
  const threadInfoResult = await getThreadInfoSafely(api, threadID);
  if (!threadInfoResult.success) {
    return api.sendMessage(`❌ Không thể lấy thông tin nhóm: ${threadInfoResult.error}`, threadID);
  }

  const threadInfo = threadInfoResult.data;
  const participantIDs = threadInfo.participantIDs || [];
  const rawNicknames = threadInfo.nicknames || {};
  const filteredNicknames = filterValidNicknames(rawNicknames, participantIDs);

  // Xử lý các lệnh
  switch (type) {
    case "on":
    case "enable": {
      if (findIndex !== -1) {
        return api.sendMessage("✅ Nhóm này đã bật antibd từ trước.", threadID);
      }

      threadEntry.data = filteredNicknames;
      threadEntry.createdAt = Date.now();
      threadEntry.updatedAt = Date.now();
      antiData.push(threadEntry);

      const writeSuccess = await writeAntiData(antiData);
      if (!writeSuccess) {
        return api.sendMessage("❌ Lỗi khi lưu dữ liệu!", threadID);
      }

      const stats = createNicknameStats(filteredNicknames);
      const msg = `✅ ĐÃ BẬT ANTI BIỆT DANH\n\n` +
                 `📊 Thống kê:\n` +
                 `├ 👥 Tổng thành viên: ${stats.total}\n` +
                 `├ 📝 Có biệt danh: ${stats.withNickname}\n` +
                 `└ 👤 Chưa có biệt danh: ${stats.withoutNickname}\n\n` +
                 `💡 Hệ thống sẽ tự động khôi phục biệt danh khi có thay đổi.`;

      return api.sendMessage(msg, threadID);
    }

    case "off":
    case "disable": {
      if (findIndex === -1) {
        return api.sendMessage("⚠️ Nhóm này chưa bật antibd.", threadID);
      }

      antiData.splice(findIndex, 1);
      const writeSuccess = await writeAntiData(antiData);
      if (!writeSuccess) {
        return api.sendMessage("❌ Lỗi khi lưu dữ liệu!", threadID);
      }

      return api.sendMessage("✅ Đã tắt antibd và xóa dữ liệu biệt danh của nhóm.", threadID);
    }

    case "update":
    case "refresh": {
      if (findIndex === -1) {
        return api.sendMessage("⚠️ Nhóm này chưa bật antibd. Dùng `antibd on` trước.", threadID);
      }

      const oldData = threadEntry.data || {};
      threadEntry.data = filteredNicknames;
      threadEntry.updatedAt = Date.now();
      antiData[findIndex] = threadEntry;

      const writeSuccess = await writeAntiData(antiData);
      if (!writeSuccess) {
        return api.sendMessage("❌ Lỗi khi lưu dữ liệu!", threadID);
      }

      const oldStats = createNicknameStats(oldData);
      const newStats = createNicknameStats(filteredNicknames);
      const diff = newStats.total - oldStats.total;

      let msg = `✅ ĐÃ CẬP NHẬT BIỆT DANH\n\n` +
               `📊 Thống kê mới:\n` +
               `├ 👥 Tổng thành viên: ${newStats.total}\n` +
               `├ 📝 Có biệt danh: ${newStats.withNickname}\n` +
               `└ 👤 Chưa có biệt danh: ${newStats.withoutNickname}\n\n`;

      if (diff > 0) {
        msg += `📈 Thành viên mới: +${diff}\n`;
      } else if (diff < 0) {
        msg += `📉 Thành viên rời: ${Math.abs(diff)}\n`;
      } else {
        msg += `🔄 Không có thay đổi về số lượng\n`;
      }

      msg += `⏰ Cập nhật lúc: ${new Date().toLocaleString('vi-VN')}`;

      return api.sendMessage(msg, threadID);
    }

    case "status":
    case "info": {
      if (findIndex === -1) {
        return api.sendMessage("⚠️ Nhóm này chưa bật antibd.", threadID);
      }

      const savedData = threadEntry.data || {};
      const stats = createNicknameStats(savedData);
      const currentStats = createNicknameStats(filteredNicknames);
      
      const createdAt = threadEntry.createdAt ? new Date(threadEntry.createdAt).toLocaleString('vi-VN') : 'N/A';
      const updatedAt = threadEntry.updatedAt ? new Date(threadEntry.updatedAt).toLocaleString('vi-VN') : 'N/A';

      let msg = `📊 TRẠNG THÁI ANTI BIỆT DANH\n\n` +
               `🔧 Trạng thái: ✅ Đang hoạt động\n` +
               `📅 Tạo lúc: ${createdAt}\n` +
               `🔄 Cập nhật cuối: ${updatedAt}\n\n` +
               `📈 Dữ liệu đã lưu:\n` +
               `├ 👥 Tổng thành viên: ${stats.total}\n` +
               `├ 📝 Có biệt danh: ${stats.withNickname}\n` +
               `└ 👤 Chưa có biệt danh: ${stats.withoutNickname}\n\n` +
               `📊 Hiện tại:\n` +
               `├ 👥 Tổng thành viên: ${currentStats.total}\n` +
               `├ 📝 Có biệt danh: ${currentStats.withNickname}\n` +
               `└ 👤 Chưa có biệt danh: ${currentStats.withoutNickname}\n\n`;

      const memberDiff = currentStats.total - stats.total;
      if (memberDiff !== 0) {
        msg += `⚠️ Có ${Math.abs(memberDiff)} ${memberDiff > 0 ? 'thành viên mới' : 'thành viên rời'}\n`;
        msg += `💡 Dùng \`antibd update\` để cập nhật dữ liệu`;
      } else {
        msg += `✅ Dữ liệu đã được đồng bộ`;
      }

      return api.sendMessage(msg, threadID);
    }

    default: {
      const msg = `❌ CÁCH SỬ DỤNG ANTI BIỆT DANH\n\n` +
                 `📋 Các lệnh có sẵn:\n` +
                 `├ 🟢 antibd on - Bật anti biệt danh\n` +
                 `├ 🔴 antibd off - Tắt anti biệt danh\n` +
                 `├ 🔄 antibd update - Cập nhật dữ liệu\n` +
                 `└ 📊 antibd status - Xem trạng thái\n\n` +
                 `💡 Lưu ý: Module sẽ tự động khôi phục biệt danh\n` +
                 `khi có thành viên thay đổi biệt danh.`;

      return api.sendMessage(msg, threadID);
    }
  }
};

// Event handler cho việc thay đổi biệt danh
module.exports.handleEvent = async function ({ event, api }) {
  const { threadID, logMessageType, logMessageData } = event;

  // Chỉ xử lý khi có thay đổi biệt danh
  if (logMessageType !== "log:user-nickname") return;

  // Kiểm tra module có được bật không
  if (!isModuleEnabled(threadID)) return;

  try {
    const antiData = await readAntiData();
    const findIndex = antiData.findIndex(e => e.threadID === threadID);
    
    // Nếu nhóm chưa bật antibd, bỏ qua
    if (findIndex === -1) return;

    const threadEntry = antiData[findIndex];
    const savedNicknames = threadEntry.data || {};
    
    const targetID = logMessageData.participant_id;
    const newNickname = logMessageData.nickname;
    const savedNickname = savedNicknames[targetID];

    // Nếu biệt danh mới khác với biệt danh đã lưu, khôi phục lại
    if (newNickname !== savedNickname) {
      try {
        await api.changeNickname(savedNickname || "", threadID, targetID);
        
        // Gửi thông báo (tùy chọn)
        const userInfo = await api.getUserInfo(targetID);
        const userName = userInfo[targetID]?.name || "Người dùng";
        
        const msg = `🛡️ ANTI BIỆT DANH HOẠT ĐỘNG\n\n` +
                   `👤 Thành viên: ${userName}\n` +
                   `📝 Biệt danh mới: ${newNickname || "(Xóa biệt danh)"}\n` +
                   `🔄 Đã khôi phục: ${savedNickname || "(Không có biệt danh)"}\n\n` +
                   `💡 Để thay đổi biệt danh, vui lòng dùng \`antibd update\` trước.`;
        
        // Gửi thông báo sau 1 giây để tránh spam
        setTimeout(() => {
          api.sendMessage(msg, threadID);
        }, 1000);
        
      } catch (error) {
        console.error("Error restoring nickname:", error);
      }
    }
    
  } catch (error) {
    console.error("Error in antibd handleEvent:", error);
  }
};

// Export functions cho anti manager
module.exports.isEnabled = isModuleEnabled;
module.exports.getData = readAntiData;
module.exports.saveData = writeAntiData;