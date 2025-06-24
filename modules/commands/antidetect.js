const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "antidetect",
    version: "1.0.0",
    hasPermssion: 2,
    credits: "Atomic",
    description: "Hệ thống chống phát hiện và quản lý hoạt động bot",
    commandCategory: "admin",
    usages: "[on/off/status/config/clean]",
    cooldowns: 3
};

const dataPath = path.join(__dirname, "..", "..", "data", "anti", "antidetect.json");
const logPath = path.join(__dirname, "..", "..", "data", "anti", "bot_activity.json");

// Cấu hình mặc định
const defaultConfig = {
    enabled: false,
    settings: {
        minDelay: 2000,        // Delay tối thiểu giữa các tin nhắn (ms)
        maxDelay: 5000,        // Delay tối đa
        maxMessagesPerMinute: 20,  // Giới hạn tin nhắn/phút
        maxMessagesPerHour: 300,   // Giới hạn tin nhắn/giờ
        randomizeDelay: true,      // Ngẫu nhiên hóa delay
        respectCooldown: true,     // Tự động tăng cooldown
        autoCleanLogs: true,       // Tự động dọn log cũ
        logRetentionDays: 7,       // Giữ log trong bao nhiêu ngày
        pauseOnHighActivity: true,  // Tạm dừng khi hoạt động cao
        activityThreshold: 80      // Ngưỡng hoạt động (%)
    },
    statistics: {
        totalMessages: 0,
        lastReset: Date.now(),
        messagesThisHour: 0,
        messagesThisMinute: 0,
        lastMessageTime: 0,
        pausedUntil: 0
    }
};

// Đảm bảo thư mục tồn tại
const ensureDirectoryExists = () => {
    const dirs = [path.dirname(dataPath), path.dirname(logPath)];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// Đọc cấu hình
const readConfig = () => {
    try {
        ensureDirectoryExists();
        if (!fs.existsSync(dataPath)) {
            fs.writeFileSync(dataPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
        const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
        return { ...defaultConfig, ...data };
    } catch (error) {
        console.error("Lỗi đọc config antidetect:", error);
        return defaultConfig;
    }
};

// Lưu cấu hình
const saveConfig = (config) => {
    try {
        ensureDirectoryExists();
        fs.writeFileSync(dataPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error("Lỗi lưu config antidetect:", error);
        return false;
    }
};

// Đọc log hoạt động
const readActivityLog = () => {
    try {
        if (!fs.existsSync(logPath)) {
            return [];
        }
        return JSON.parse(fs.readFileSync(logPath, "utf-8"));
    } catch (error) {
        return [];
    }
};

// Lưu log hoạt động
const saveActivityLog = (logs) => {
    try {
        ensureDirectoryExists();
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    } catch (error) {
        console.error("Lỗi lưu activity log:", error);
    }
};

// Tạo delay ngẫu nhiên
const createRandomDelay = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Kiểm tra giới hạn tin nhắn
const checkMessageLimits = (config) => {
    const now = Date.now();
    const { statistics, settings } = config;
    
    // Reset counter mỗi phút
    if (now - statistics.lastMessageTime > 60000) {
        statistics.messagesThisMinute = 0;
    }
    
    // Reset counter mỗi giờ
    if (now - statistics.lastReset > 3600000) {
        statistics.messagesThisHour = 0;
        statistics.lastReset = now;
    }
    
    // Kiểm tra giới hạn
    if (statistics.messagesThisMinute >= settings.maxMessagesPerMinute) {
        return { allowed: false, reason: "Đã đạt giới hạn tin nhắn/phút" };
    }
    
    if (statistics.messagesThisHour >= settings.maxMessagesPerHour) {
        return { allowed: false, reason: "Đã đạt giới hạn tin nhắn/giờ" };
    }
    
    // Kiểm tra tạm dừng
    if (statistics.pausedUntil > now) {
        return { allowed: false, reason: "Bot đang tạm dừng" };
    }
    
    return { allowed: true };
};

// Ghi log hoạt động
const logActivity = (threadID, command, userId) => {
    const logs = readActivityLog();
    const now = Date.now();
    
    logs.push({
        timestamp: now,
        threadID,
        command,
        userId,
        date: new Date(now).toISOString()
    });
    
    // Giữ log trong thời gian quy định
    const config = readConfig();
    const retentionTime = config.settings.logRetentionDays * 24 * 60 * 60 * 1000;
    const filteredLogs = logs.filter(log => now - log.timestamp < retentionTime);
    
    saveActivityLog(filteredLogs);
};

// Dọn dẹp log và dữ liệu cũ
const cleanupOldData = () => {
    const config = readConfig();
    const now = Date.now();
    
    // Dọn log cũ
    const logs = readActivityLog();
    const retentionTime = config.settings.logRetentionDays * 24 * 60 * 60 * 1000;
    const filteredLogs = logs.filter(log => now - log.timestamp < retentionTime);
    saveActivityLog(filteredLogs);
    
    // Reset statistics cũ
    if (now - config.statistics.lastReset > 24 * 60 * 60 * 1000) {
        config.statistics.messagesThisHour = 0;
        config.statistics.messagesThisMinute = 0;
        config.statistics.lastReset = now;
        saveConfig(config);
    }
    
    return filteredLogs.length;
};

// Tính toán mức độ hoạt động
const calculateActivityLevel = () => {
    const logs = readActivityLog();
    const now = Date.now();
    const lastHour = logs.filter(log => now - log.timestamp < 3600000);
    const lastMinute = logs.filter(log => now - log.timestamp < 60000);
    
    const config = readConfig();
    const hourlyActivity = (lastHour.length / config.settings.maxMessagesPerHour) * 100;
    const minutelyActivity = (lastMinute.length / config.settings.maxMessagesPerMinute) * 100;
    
    return Math.max(hourlyActivity, minutelyActivity);
};

// Hàm middleware chính
global.antiDetectMiddleware = async (api, event, commandName) => {
    const config = readConfig();
    
    if (!config.enabled) return { proceed: true };
    
    const { threadID, senderID } = event;
    const now = Date.now();
    
    // Kiểm tra giới hạn
    const limitCheck = checkMessageLimits(config);
    if (!limitCheck.allowed) {
        return { 
            proceed: false, 
            message: `⚠️ ${limitCheck.reason}. Vui lòng thử lại sau.`,
            delay: 0
        };
    }
    
    // Kiểm tra mức độ hoạt động
    const activityLevel = calculateActivityLevel();
    if (config.settings.pauseOnHighActivity && activityLevel > config.settings.activityThreshold) {
        const pauseTime = createRandomDelay(30000, 120000); // Tạm dừng 30s-2phút
        config.statistics.pausedUntil = now + pauseTime;
        saveConfig(config);
        
        return {
            proceed: false,
            message: `🔄 Hệ thống đang nghỉ ngơi để tối ưu hiệu suất. Thử lại sau ${Math.round(pauseTime/1000)}s`,
            delay: 0
        };
    }
    
    // Tính delay
    let delay = 0;
    if (config.settings.randomizeDelay) {
        delay = createRandomDelay(config.settings.minDelay, config.settings.maxDelay);
    } else {
        delay = config.settings.minDelay;
    }
    
    // Cập nhật thống kê
    config.statistics.totalMessages++;
    config.statistics.messagesThisHour++;
    config.statistics.messagesThisMinute++;
    config.statistics.lastMessageTime = now;
    saveConfig(config);
    
    // Ghi log
    logActivity(threadID, commandName, senderID);
    
    return { proceed: true, delay };
};

module.exports.run = async ({ api, event, args }) => {
    const { threadID, senderID } = event;
    const adminBot = global.config.ADMINBOT || [];
    
    if (!adminBot.includes(senderID)) {
        return api.sendMessage("❌ Bạn không có quyền sử dụng lệnh này.", threadID);
    }
    
    const command = args[0]?.toLowerCase();
    let config = readConfig();
    
    switch (command) {
        case "on":
            config.enabled = true;
            saveConfig(config);
            return api.sendMessage("✅ Đã bật hệ thống chống phát hiện.", threadID);
            
        case "off":
            config.enabled = false;
            saveConfig(config);
            return api.sendMessage("❌ Đã tắt hệ thống chống phát hiện.", threadID);
            
        case "status":
            const activityLevel = calculateActivityLevel();
            const logs = readActivityLog();
            const recentLogs = logs.filter(log => Date.now() - log.timestamp < 3600000);
            
            let statusMsg = `📊 TRẠNG THÁI HỆ THỐNG CHỐNG PHÁT HIỆN\n`;
            statusMsg += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;
            statusMsg += `🔧 Trạng thái: ${config.enabled ? "✅ Đang hoạt động" : "❌ Đã tắt"}\n`;
            statusMsg += `📈 Mức độ hoạt động: ${activityLevel.toFixed(1)}%\n`;
            statusMsg += `📨 Tin nhắn giờ qua: ${recentLogs.length}/${config.settings.maxMessagesPerHour}\n`;
            statusMsg += `⏱️ Tin nhắn phút qua: ${config.statistics.messagesThisMinute}/${config.settings.maxMessagesPerMinute}\n`;
            statusMsg += `📊 Tổng tin nhắn: ${config.statistics.totalMessages}\n`;
            statusMsg += `⏰ Delay: ${config.settings.minDelay}-${config.settings.maxDelay}ms\n`;
            
            if (config.statistics.pausedUntil > Date.now()) {
                const remaining = Math.round((config.statistics.pausedUntil - Date.now()) / 1000);
                statusMsg += `⏸️ Tạm dừng: ${remaining}s\n`;
            }
            
            return api.sendMessage(statusMsg, threadID);
            
        case "clean":
            const cleaned = cleanupOldData();
            return api.sendMessage(`🧹 Đã dọn dẹp dữ liệu cũ. Còn lại ${cleaned} bản ghi log.`, threadID);
            
        case "config":
            const setting = args[1];
            const value = args[2];
            
            if (!setting || value === undefined) {
                let configMsg = `⚙️ CẤU HÌNH HỆ THỐNG\n`;
                configMsg += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;
                configMsg += `• minDelay: ${config.settings.minDelay}ms\n`;
                configMsg += `• maxDelay: ${config.settings.maxDelay}ms\n`;
                configMsg += `• maxMessagesPerMinute: ${config.settings.maxMessagesPerMinute}\n`;
                configMsg += `• maxMessagesPerHour: ${config.settings.maxMessagesPerHour}\n`;
                configMsg += `• randomizeDelay: ${config.settings.randomizeDelay}\n`;
                configMsg += `• pauseOnHighActivity: ${config.settings.pauseOnHighActivity}\n`;
                configMsg += `• activityThreshold: ${config.settings.activityThreshold}%\n`;
                configMsg += `• logRetentionDays: ${config.settings.logRetentionDays}\n\n`;
                configMsg += `💡 Sử dụng: antidetect config <tên> <giá trị>`;
                return api.sendMessage(configMsg, threadID);
            }
            
            // Cập nhật cấu hình
            if (config.settings.hasOwnProperty(setting)) {
                let newValue = value;
                
                // Chuyển đổi kiểu dữ liệu
                if (setting.includes('Delay') || setting.includes('Messages') || setting.includes('Threshold') || setting.includes('Days')) {
                    newValue = parseInt(value);
                    if (isNaN(newValue)) {
                        return api.sendMessage("❌ Giá trị phải là số.", threadID);
                    }
                } else if (setting.includes('randomize') || setting.includes('pause') || setting.includes('auto')) {
                    newValue = value.toLowerCase() === 'true';
                }
                
                config.settings[setting] = newValue;
                saveConfig(config);
                return api.sendMessage(`✅ Đã cập nhật ${setting} = ${newValue}`, threadID);
            } else {
                return api.sendMessage("❌ Tên cấu hình không hợp lệ.", threadID);
            }
            
        default:
            let helpMsg = `🛡️ HỆ THỐNG CHỐNG PHÁT HIỆN\n`;
            helpMsg += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;
            helpMsg += `📝 Các lệnh:\n`;
            helpMsg += `• antidetect on - Bật hệ thống\n`;
            helpMsg += `• antidetect off - Tắt hệ thống\n`;
            helpMsg += `• antidetect status - Xem trạng thái\n`;
            helpMsg += `• antidetect config - Xem/đổi cấu hình\n`;
            helpMsg += `• antidetect clean - Dọn dẹp dữ liệu cũ\n\n`;
            helpMsg += `🔧 Tính năng:\n`;
            helpMsg += `• Giới hạn tin nhắn/phút và /giờ\n`;
            helpMsg += `• Delay ngẫu nhiên giữa các lệnh\n`;
            helpMsg += `• Tạm dừng khi hoạt động cao\n`;
            helpMsg += `• Ghi log và thống kê hoạt động\n`;
            helpMsg += `• Tự động dọn dẹp dữ liệu cũ`;
            
            return api.sendMessage(helpMsg, threadID);
    }
};