
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "dev",
    version: "1.0.0",
    hasPermssion: 3,
    credits: "Atomic",
    description: "Chế độ chỉnh sửa file trực tiếp",
    commandCategory: "Admin", 
    usages: "on/off/status",
    cooldowns: 2
};

const configPath = path.join(__dirname, '..', '..', 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('[DevMode] Lỗi đọc config:', error);
    }
    return null;
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[DevMode] Lỗi lưu config:', error);
        return false;
    }
}

module.exports.run = async function({ api, event, args }) {
    try {
        const { threadID, messageID } = event;
        const command = args[0]?.toLowerCase();

        if (!command) {
            return api.sendMessage("📋 Sử dụng:\n• devmode on - Bật Developer Mode\n• devmode off - Tắt Developer Mode\n• devmode status - Xem trạng thái", threadID, messageID);
        }

        const config = loadConfig();
        if (!config) {
            return api.sendMessage("❌ Không thể đọc file config!", threadID, messageID);
        }

        switch (command) {
            case 'on':
                config.DeveloperMode = true;
                if (saveConfig(config)) {
                    return api.sendMessage("✅ Đã BẬT Developer Mode!", threadID, messageID);
                } else {
                    return api.sendMessage("❌ Không thể lưu cài đặt!", threadID, messageID);
                }

            case 'off':
                config.DeveloperMode = false;
                if (saveConfig(config)) {
                    return api.sendMessage("❌ Đã TẮT Developer Mode!", threadID, messageID);
                } else {
                    return api.sendMessage("❌ Không thể lưu cài đặt!", threadID, messageID);
                }

            case 'status':
                const status = config.DeveloperMode ? '✅ ĐANG BẬT' : '❌ ĐANG TẮT';
                return api.sendMessage(`📊 Trạng thái Developer Mode: ${status}`, threadID, messageID);

            default:
                return api.sendMessage("❌ Lệnh không hợp lệ!\nSử dụng: on/off/status", threadID, messageID);
        }

    } catch (error) {
        console.error('[DevMode] Lỗi:', error);
        return api.sendMessage("❌ Có lỗi xảy ra khi quản lý Developer Mode!", event.threadID, event.messageID);
    }
};
