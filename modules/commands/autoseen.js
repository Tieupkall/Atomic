const fs = require('fs-extra');
const pathFile = __dirname + '/../../data/autoseen.json';

// Create directory if it doesn't exist
const dir = require('path').dirname(pathFile);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Create file with default JSON structure if it doesn't exist
if (!fs.existsSync(pathFile)) {
  const defaultConfig = {
    enabled: true,
    lastUpdated: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    updatedBy: null
  };
  fs.writeFileSync(pathFile, JSON.stringify(defaultConfig, null, 2));
}

// Helper functions for JSON operations
function getConfig() {
  try {
    const data = fs.readFileSync(pathFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Error reading config:', error);
    // Return default config if file is corrupted
    return { 
      enabled: true, 
      lastUpdated: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), 
      updatedBy: null 
    };
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(pathFile, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.log('Error saving config:', error);
    return false;
  }
}

module.exports.config = {
  name: "autoseen",
  version: "1.0.1",
  hasPermssion: 3,
  credits: "NTKhang",
  description: "Bật/tắt tự động seen khi có tin nhắn mới",
  commandCategory: "Admin",
  usages: "on/off/status",
  cooldowns: 5,
  dependencies: {}
};

module.exports.handleEvent = async ({ api, event, args }) => {
  try {
    const config = getConfig();
    if (config.enabled === true) {
      // Sử dụng cả markAsReadAll và markAsSeen để đảm bảo hoạt động
      api.markAsReadAll(() => {});
      
      // Nếu có threadID cụ thể, mark as seen cho thread đó
      if (event && event.threadID) {
        setTimeout(() => {
          api.markAsSeen(event.threadID, (err) => {});
        }, 1000); // Delay 1 giây để đảm bảo tin nhắn đã được xử lý
      }
    }
  } catch (error) {
    // Silent error handling
  }
};

module.exports.run = async ({ api, event, args }) => {
  try {
    const config = getConfig();
    const currentTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const userID = event.senderID;

    if (args[0] === 'on') {
      config.enabled = true;
      config.lastUpdated = currentTime;
      config.updatedBy = userID;
      
      if (saveConfig(config)) {
        api.sendMessage('✅ Đã bật chế độ tự động seen khi có tin nhắn mới', event.threadID, event.messageID);
      } else {
        api.sendMessage('❌ Có lỗi xảy ra khi lưu cấu hình', event.threadID, event.messageID);
      }
    }
    else if (args[0] === 'off') {
      config.enabled = false;
      config.lastUpdated = currentTime;
      config.updatedBy = userID;
      
      if (saveConfig(config)) {
        api.sendMessage('✅ Đã tắt chế độ tự động seen khi có tin nhắn mới', event.threadID, event.messageID);
      } else {
        api.sendMessage('❌ Có lỗi xảy ra khi lưu cấu hình', event.threadID, event.messageID);
      }
    }
    else if (args[0] === 'status') {
      const status = config.enabled ? 'Bật' : 'Tắt';
      const lastUpdated = config.lastUpdated;
      
      let statusMessage = `📊 Trạng thái Auto Seen:\n`;
      statusMessage += `• Trạng thái: ${status}\n`;
      statusMessage += `• Cập nhật lần cuối: ${lastUpdated}`;
      
      if (config.updatedBy) {
        statusMessage += `\n• Được cập nhật bởi: ${config.updatedBy}`;
      }
      
      api.sendMessage(statusMessage, event.threadID, event.messageID);
    }
    else {
      const currentStatus = config.enabled ? 'Bật' : 'Tắt';
      api.sendMessage(
        `❌ Sai cú pháp!\n\n📝 Cách sử dụng:\n• autoseen on - Bật tự động seen\n• autoseen off - Tắt tự động seen\n• autoseen status - Xem trạng thái hiện tại\n\n📊 Trạng thái hiện tại: ${currentStatus}`, 
        event.threadID, 
        event.messageID
      );
    }
  }
  catch(error) {
    console.log('Error in run:', error);
    api.sendMessage('❌ Đã xảy ra lỗi khi thực hiện lệnh', event.threadID, event.messageID);
  }
};