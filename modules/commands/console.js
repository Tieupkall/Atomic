
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "console",
    version: "1.0.0",
    hasPermssion: 3,
    credits: "Atomic",
    description: "Quản lý bật/tắt console logging",
    commandCategory: "Admin", 
    usages: "on/off/status",
    cooldowns: 2
};

const configPath = path.join(__dirname, '..', '..', 'data', 'console_config.json');

function loadConsoleConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('[Console Config] Error loading config:', error);
    }
    return { enabled: true }; // Mặc định bật
}

function saveConsoleConfig(config) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('[Console Config] Error saving config:', error);
        return false;
    }
}

let consoleConfig = loadConsoleConfig();

// Export config để console.js có thể sử dụng
module.exports.getConsoleConfig = () => consoleConfig;

module.exports.run = async function({ api, event, args }) {
    try {
        const { threadID, messageID } = event;
        const command = args[0]?.toLowerCase();

        if (!command) {
            return api.sendMessage("📋 Sử dụng:\n• consolemgr on - Bật console\n• consolemgr off - Tắt console\n• consolemgr status - Xem trạng thái", threadID, messageID);
        }

        switch (command) {
            case 'on':
                consoleConfig.enabled = true;
                if (saveConsoleConfig(consoleConfig)) {
                    return api.sendMessage("✅ Đã BẬT console logging!\nTin nhắn sẽ được hiển thị trong console.", threadID, messageID);
                } else {
                    return api.sendMessage("❌ Không thể lưu cài đặt!", threadID, messageID);
                }

            case 'off':
                consoleConfig.enabled = false;
                if (saveConsoleConfig(consoleConfig)) {
                    return api.sendMessage("❌ Đã TẮT console logging!\nTin nhắn sẽ không hiển thị trong console nữa.", threadID, messageID);
                } else {
                    return api.sendMessage("❌ Không thể lưu cài đặt!", threadID, messageID);
                }

            case 'status':
                const status = consoleConfig.enabled ? '✅ ĐANG BẬT' : '❌ ĐANG TẮT';
                return api.sendMessage(`📊 Trạng thái Console Logging: ${status}`, threadID, messageID);

            default:
                return api.sendMessage("❌ Lệnh không hợp lệ!\nSử dụng: on/off/status", threadID, messageID);
        }

    } catch (error) {
        console.error('[Console Manager] Error:', error);
        return api.sendMessage("❌ Có lỗi xảy ra khi quản lý console!", event.threadID, event.messageID);
    }
};

module.exports.onLoad = function() {
    consoleConfig = loadConsoleConfig();
};
