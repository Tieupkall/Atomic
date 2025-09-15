
const fs = require('fs');
const path = require('path');

class RandomDelay {
    constructor() {
        this.configPath = path.join(__dirname, '../commands/cache/data/randomDelay.json');
        this.config = this.loadConfig();
        this.userDelayHistory = new Map(); // Lưu lịch sử delay của từng user
        this.threadActivity = new Map(); // Theo dõi hoạt động của thread
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
        } catch (error) {
            console.error('❌ [RandomDelay] Lỗi đọc config:', error.message);
        }
        
        // Config mặc định
        return {
            enabled: true,
            delays: {
                // Delay cơ bản cho các loại lệnh khác nhau
                normal: { min: 800, max: 2500 },      // Lệnh thông thường
                admin: { min: 500, max: 1500 },       // Lệnh admin (nhanh hơn)
                heavy: { min: 2000, max: 5000 },      // Lệnh nặng (search, download...)
                ai: { min: 1500, max: 4000 },         // Lệnh AI
                game: { min: 1000, max: 3000 }        // Lệnh game
            },
            factors: {
                // Các yếu tố ảnh hưởng đến delay
                messageLength: 0.02,      // +20ms mỗi ký tự
                threadActivity: 0.3,      // Giảm delay khi thread hoạt động nhiều
                userHistory: 0.2,         // Delay khác nhau cho mỗi user
                timeOfDay: 0.15,          // Delay khác theo giờ trong ngày
                commandFrequency: 0.25    // Tăng delay nếu spam lệnh
            },
            patterns: {
                // Mô phỏng pattern gõ của người thật
                typing: true,             // Gửi typing indicator
                typingDuration: { min: 800, max: 2500 },
                pauseBetweenMessages: 300, // Delay giữa các tin nhắn liên tiếp
                humanErrors: 0.05         // 5% chance có "lỗi" nhỏ (delay thêm)
            }
        };
    }

    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('❌ [RandomDelay] Lỗi lưu config:', error.message);
        }
    }

    // Tính toán delay dựa trên nhiều yếu tố
    calculateDelay(options = {}) {
        if (!this.config.enabled) return 0;

        const {
            commandType = 'normal',
            messageLength = 50,
            senderID,
            threadID,
            commandName,
            hasPermission = 0
        } = options;

        // Delay cơ bản theo loại lệnh
        let baseDelay = this.getBaseDelay(commandType, hasPermission);
        
        // Áp dụng các yếu tố
        baseDelay = this.applyMessageLengthFactor(baseDelay, messageLength);
        baseDelay = this.applyThreadActivityFactor(baseDelay, threadID);
        baseDelay = this.applyUserHistoryFactor(baseDelay, senderID);
        baseDelay = this.applyTimeOfDayFactor(baseDelay);
        baseDelay = this.applyCommandFrequencyFactor(baseDelay, senderID, commandName);
        
        // Thêm yếu tố random và human error
        baseDelay = this.addRandomness(baseDelay);
        
        // Lưu vào lịch sử
        this.updateUserHistory(senderID, baseDelay);
        this.updateThreadActivity(threadID);
        
        return Math.max(200, Math.round(baseDelay)); // Tối thiểu 200ms
    }

    getBaseDelay(commandType, hasPermission) {
        // Admin có delay ngắn hơn
        if (hasPermission >= 2) {
            const adminDelay = this.config.delays.admin;
            return this.randomBetween(adminDelay.min, adminDelay.max);
        }

        const delayConfig = this.config.delays[commandType] || this.config.delays.normal;
        return this.randomBetween(delayConfig.min, delayConfig.max);
    }

    applyMessageLengthFactor(delay, messageLength) {
        const factor = this.config.factors.messageLength;
        const lengthBonus = Math.min(messageLength * factor * 100, 1000); // Tối đa +1s
        return delay + lengthBonus;
    }

    applyThreadActivityFactor(delay, threadID) {
        if (!threadID) return delay;
        
        const activity = this.threadActivity.get(threadID) || { count: 0, lastUpdate: Date.now() };
        const timeSinceLastActivity = Date.now() - activity.lastUpdate;
        
        // Thread hoạt động nhiều = delay ngắn hơn (như người chat liên tục)
        if (timeSinceLastActivity < 60000 && activity.count > 3) { // 1 phút, >3 lệnh
            const reduction = delay * this.config.factors.threadActivity;
            return delay - reduction;
        }
        
        return delay;
    }

    applyUserHistoryFactor(delay, senderID) {
        if (!senderID) return delay;
        
        const history = this.userDelayHistory.get(senderID) || [];
        if (history.length === 0) return delay;
        
        // Mỗi user có pattern delay riêng
        const avgDelay = history.reduce((sum, d) => sum + d, 0) / history.length;
        const factor = this.config.factors.userHistory;
        
        return delay + (avgDelay - delay) * factor;
    }

    applyTimeOfDayFactor(delay) {
        const hour = new Date().getHours();
        const factor = this.config.factors.timeOfDay;
        
        // Buổi sáng sớm và khuya = delay dài hơn (người mệt mỏi)
        if (hour < 6 || hour > 22) {
            return delay * (1 + factor);
        }
        
        // Giờ cao điểm = delay ngắn hơn (người tỉnh táo)
        if (hour >= 9 && hour <= 11 || hour >= 14 && hour <= 16) {
            return delay * (1 - factor * 0.5);
        }
        
        return delay;
    }

    applyCommandFrequencyFactor(delay, senderID, commandName) {
        if (!senderID || !commandName) return delay;
        
        const key = `${senderID}_${commandName}`;
        const now = Date.now();
        
        if (!this.commandFrequency) this.commandFrequency = new Map();
        
        const lastUsed = this.commandFrequency.get(key) || 0;
        const timeSinceLastUse = now - lastUsed;
        
        this.commandFrequency.set(key, now);
        
        // Spam cùng lệnh = delay dài hơn
        if (timeSinceLastUse < 30000) { // 30 giây
            const penalty = delay * this.config.factors.commandFrequency;
            return delay + penalty;
        }
        
        return delay;
    }

    addRandomness(delay) {
        // Human error - đôi khi có delay bất thường
        if (Math.random() < this.config.patterns.humanErrors) {
            delay += this.randomBetween(1000, 3000);
        }
        
        // Random variance ±20%
        const variance = delay * 0.2;
        return delay + this.randomBetween(-variance, variance);
    }

    updateUserHistory(senderID, delay) {
        if (!senderID) return;
        
        if (!this.userDelayHistory.has(senderID)) {
            this.userDelayHistory.set(senderID, []);
        }
        
        const history = this.userDelayHistory.get(senderID);
        history.push(delay);
        
        // Chỉ giữ 10 delay gần nhất
        if (history.length > 10) {
            history.shift();
        }
    }

    updateThreadActivity(threadID) {
        if (!threadID) return;
        
        const activity = this.threadActivity.get(threadID) || { count: 0, lastUpdate: Date.now() };
        activity.count++;
        activity.lastUpdate = Date.now();
        
        this.threadActivity.set(threadID, activity);
        
        // Reset count sau 5 phút
        setTimeout(() => {
            const currentActivity = this.threadActivity.get(threadID);
            if (currentActivity && currentActivity.lastUpdate === activity.lastUpdate) {
                currentActivity.count = Math.max(0, currentActivity.count - 1);
            }
        }, 300000);
    }

    // Gửi typing indicator để mô phỏng việc gõ
    async sendTypingIndicator(api, threadID, duration) {
        if (!this.config.patterns.typing || !api || !threadID) return;
        
        try {
            // Bật typing indicator
            await api.sendTyping(threadID, true, { autoStop: false });
            
            // Tự động tắt sau duration
            setTimeout(() => {
                api.sendTyping(threadID, false).catch(() => {});
            }, duration);
            
        } catch (error) {
            console.log("RandomDelay typing error:", error.message);
        }
    }

    // Delay chính để sử dụng trong commands
    async delay(options = {}, api = null) {
        const delayTime = this.calculateDelay(options);
        const { threadID } = options;
        
        // Tính thời gian typing (80% của total delay)
        const typingDuration = this.config.patterns.typing ? 
            Math.min(
                this.randomBetween(
                    this.config.patterns.typingDuration.min,
                    this.config.patterns.typingDuration.max
                ),
                delayTime * 0.8
            ) : 0;
        
        // Gửi typing indicator và delay cùng lúc
        if (typingDuration > 0 && api && threadID) {
            this.sendTypingIndicator(api, threadID, typingDuration);
        }
        
        // Delay toàn bộ thời gian
        await this.sleep(delayTime);
        
        return delayTime;
    }

    // Utilities
    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Phân loại command type tự động
    detectCommandType(commandName) {
        const aiCommands = ['ai', 'chat', 'gpt', 'ask', 'search'];
        const heavyCommands = ['download', 'video', 'music', 'img', 'ytb', 'tiktok'];
        const gameCommands = ['game', 'play', 'slot', 'taixiu', 'xsmb'];
        const adminCommands = ['ban', 'unban', 'kick', 'admin', 'load', 'cmd'];
        
        const name = commandName.toLowerCase();
        
        if (aiCommands.some(cmd => name.includes(cmd))) return 'ai';
        if (heavyCommands.some(cmd => name.includes(cmd))) return 'heavy';
        if (gameCommands.some(cmd => name.includes(cmd))) return 'game';
        if (adminCommands.some(cmd => name.includes(cmd))) return 'admin';
        
        return 'normal';
    }

    // Enable/disable
    setEnabled(enabled) {
        this.config.enabled = enabled;
        this.saveConfig();
    }

    isEnabled() {
        return this.config.enabled;
    }

    // Cập nhật config
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }

    // Thống kê
    getStats() {
        return {
            enabled: this.config.enabled,
            totalUsers: this.userDelayHistory.size,
            activeThreads: this.threadActivity.size,
            config: this.config
        };
    }
}

// Export singleton instance
module.exports = new RandomDelay();
