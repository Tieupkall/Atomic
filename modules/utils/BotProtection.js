/* 
📁 Cấu trúc thư mục Mirai Bot:
mirai-bot/
├── modules/
│   ├── commands/          # Các lệnh bot (ai.js, music.js, etc.)
│   ├── events/           # Xử lý sự kiện (join, leave, etc.)
│   └── utils/            # Thư mục tiện ích (ĐẶT BOTPROTECTION Ở ĐÂY)
│       └── BotProtection.js
├── includes/
├── appstate.json
└── index.js
*/

// =================== FILE: modules/utils/BotProtection.js ===================
const fs = require('fs');
const path = require('path');

class BotProtection {
    constructor() {
        this.messageCount = new Map();
        this.lastActivity = new Map();
        this.responseDelays = [1500, 2500, 3500, 4500];
        this.dailyLimit = 150;
        this.hourlyLimit = 25;
        this.activeHours = { start: 7, end: 22 };
        this.loadData();
    }

    // Load dữ liệu từ file khi khởi động
    loadData() {
        try {
            const dataFile = path.join(__dirname, 'protection_data.json');
            if (fs.existsSync(dataFile)) {
                const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                this.messageCount = new Map(data.messageCount || []);
                this.lastActivity = new Map(data.lastActivity || []);
            }
        } catch (error) {
            console.log('Không thể load dữ liệu protection:', error);
        }
    }

    // Lưu dữ liệu xuống file
    saveData() {
        try {
            const dataFile = path.join(__dirname, 'protection_data.json');
            const data = {
                messageCount: Array.from(this.messageCount.entries()),
                lastActivity: Array.from(this.lastActivity.entries()),
                lastSave: Date.now()
            };
            fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.log('Không thể lưu dữ liệu protection:', error);
        }
    }

    getRandomDelay(messageLength = 50) {
        const baseDelay = this.responseDelays[Math.floor(Math.random() * this.responseDelays.length)];
        const lengthFactor = Math.min(messageLength * 30, 3000);
        const randomFactor = Math.random() * 0.4 + 0.8;
        return Math.floor((baseDelay + lengthFactor) * randomFactor);
    }

    isActiveHours() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = Chủ nhật, 6 = Thứ 7
        
        // Giảm hoạt động cuối tuần
        if (currentDay === 0 || currentDay === 6) {
            return currentHour >= this.activeHours.start + 1 && currentHour <= this.activeHours.end - 1;
        }
        
        return currentHour >= this.activeHours.start && currentHour <= this.activeHours.end;
    }

    checkMessageLimit(userID) {
        const now = Date.now();
        const userKey = userID.toString();
        
        if (!this.messageCount.has(userKey)) {
            this.messageCount.set(userKey, {
                daily: 0,
                hourly: 0,
                lastReset: now,
                lastHourReset: now
            });
        }

        const userData = this.messageCount.get(userKey);
        
        // Reset hàng ngày
        if (now - userData.lastReset > 24 * 60 * 60 * 1000) {
            userData.daily = 0;
            userData.lastReset = now;
        }
        
        // Reset hàng giờ  
        if (now - userData.lastHourReset > 60 * 60 * 1000) {
            userData.hourly = 0;
            userData.lastHourReset = now;
        }
        
        if (userData.daily >= this.dailyLimit || userData.hourly >= this.hourlyLimit) {
            return false;
        }
        
        userData.daily++;
        userData.hourly++;
        this.saveData(); // Lưu sau khi thay đổi
        
        return true;
    }

    checkSpamProtection(userID) {
        const now = Date.now();
        const userKey = userID.toString();
        
        if (this.lastActivity.has(userKey)) {
            const timeDiff = now - this.lastActivity.get(userKey);
            if (timeDiff < 2000) { // 2 giây
                return false;
            }
        }
        
        this.lastActivity.set(userKey, now);
        return true;
    }

    async sendNaturalResponse(api, message, threadID, messageID) {
        return new Promise(async (resolve) => {
            // Typing indicator
            api.sendTypingIndicator(threadID);
            
            const delay = this.getRandomDelay(message.length);
            
            setTimeout(() => {
                api.sendMessage(message, threadID, messageID);
                resolve();
            }, delay);
        });
    }

    shouldRespond(userID, messageContent) {
        // Kiểm tra giờ hoạt động
        if (!this.isActiveHours()) {
            return { allow: false, reason: 'outside_active_hours' };
        }

        // Kiểm tra spam
        if (!this.checkSpamProtection(userID)) {
            return { allow: false, reason: 'spam_protection' };
        }

        // Kiểm tra giới hạn
        if (!this.checkMessageLimit(userID)) {
            return { allow: false, reason: 'message_limit_exceeded' };
        }

        // Random skip 3%
        if (Math.random() < 0.03) {
            return { allow: false, reason: 'random_skip' };
        }

        return { allow: true };
    }

    getPoliteDeclineMessage(reason) {
        const messages = {
            outside_active_hours: [
                "Tôi đang nghỉ ngơi, mai hãy chat nhé! 😴",
                "Hơi muộn rồi, sáng mai nói chuyện tiếp nha! 🌙",
                "Tôi cần nghỉ ngơi, hẹn gặp lại vào ngày mai! 💤"
            ],
            spam_protection: [
                "Chậm lại một chút nha, để tôi kịp suy nghĩ! 🤔",
                "Bạn nói hơi nhanh quá, mình từ từ thôi! 😅"
            ],
            message_limit_exceeded: [
                "Hôm nay chat khá nhiều rồi, ngày mai tiếp tục nhé! 😊",
                "Mình cần nghỉ ngơi một chút, mai nói chuyện tiếp! 🙂"
            ]
        };

        const messageList = messages[reason];
        if (!messageList) return null;
        
        return messageList[Math.floor(Math.random() * messageList.length)];
    }
}

module.exports = BotProtection;

// =================== FILE: modules/commands/ai.js (TÍCH HỢP) ===================
const axios = require('axios');
const BotProtection = require('../utils/BotProtection'); // Import từ utils

// Khởi tạo protection (chỉ 1 instance cho toàn bộ bot)
const protection = new BotProtection();

module.exports.config = {
    name: "ai",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "AI Gemini Protected",
    description: "AI thông minh với bảo vệ chống phát hiện",
    commandCategory: "AI",
    usages: "Gọi tên bot trong tin nhắn",
    cooldowns: 2
};

const GEMINI_CONFIG = {
    apiKey: "YOUR_GEMINI_API_KEY",
    model: "gemini-1.5-flash",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/"
};

const BOT_NAMES = ['ai', 'bot', 'gemini', 'assistant'];

function isBotMentioned(message) {
    const lowerMessage = message.toLowerCase();
    return BOT_NAMES.some(name => 
        lowerMessage.includes(name) || 
        lowerMessage.startsWith(name)
    );
}

async function callGeminiAPI(prompt) {
    try {
        const url = `${GEMINI_CONFIG.apiUrl}${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
        
        const response = await axios.post(url, {
            contents: [{
                parts: [{
                    text: `Bạn là AI trợ lý thân thiện. Trả lời ngắn gọn, tự nhiên: ${prompt}`
                }]
            }],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 800,
            }
        }, {
            timeout: 30000
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return response.data.candidates[0].content.parts[0].text;
        }
        
        throw new Error('Invalid response');

    } catch (error) {
        console.error('Gemini API Error:', error.message);
        
        const fallbacks = [
            "Xin lỗi, tôi đang gặp chút vấn đề. Thử lại sau nhé! 😅",
            "Oops! Có lỗi xảy ra. Bạn hãy hỏi lại sau ít phút! 🔧",
            "Hệ thống đang bận, vui lòng thử lại! ⚡"
        ];
        
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}

// Xử lý tin nhắn không prefix
module.exports.handleEvent = async function({ api, event, Users }) {
    try {
        if (event.type !== "message" || !event.body) return;
        if (event.senderID === api.getCurrentUserID()) return;
        
        const userMessage = event.body.trim();
        const userID = event.senderID;
        
        if (!isBotMentioned(userMessage)) return;
        
        // ✅ SỬ DỤNG PROTECTION
        const shouldRespond = protection.shouldRespond(userID, userMessage);
        
        if (!shouldRespond.allow) {
            const declineMessage = protection.getPoliteDeclineMessage(shouldRespond.reason);
            if (declineMessage) {
                await protection.sendNaturalResponse(api, declineMessage, event.threadID, event.messageID);
            }
            return;
        }
        
        // Xử lý tin nhắn
        let cleanMessage = userMessage;
        BOT_NAMES.forEach(name => {
            const regex = new RegExp(`\\b${name}\\b`, 'gi');
            cleanMessage = cleanMessage.replace(regex, '').trim();
        });
        
        if (!cleanMessage || cleanMessage.length < 2) {
            await protection.sendNaturalResponse(api, "Xin chào! Tôi có thể giúp gì cho bạn? 😊", event.threadID, event.messageID);
            return;
        }
        
        // Gọi Gemini API
        const aiResponse = await callGeminiAPI(cleanMessage);
        
        // ✅ GỬI PHẢN HỒI TỰ NHIÊN
        await protection.sendNaturalResponse(api, aiResponse, event.threadID, event.messageID);
        
    } catch (error) {
        console.error('Error in handleEvent:', error);
        await protection.sendNaturalResponse(api, "Đã có lỗi xảy ra! 🔧", event.threadID, event.messageID);
    }
};

module.exports.run = async function({ api, event, args }) {
    try {
        const userMessage = args.join(' ');
        if (!userMessage) {
            return api.sendMessage("Chỉ cần gọi tên 'AI' trong tin nhắn là tôi sẽ trả lời! 🤖", event.threadID);
        }
        
        const aiResponse = await callGeminiAPI(userMessage);
        await protection.sendNaturalResponse(api, aiResponse, event.threadID, event.messageID);
        
    } catch (error) {
        console.error('Error in run function:', error);
        return api.sendMessage("Đã có lỗi xảy ra! 🔧", event.threadID, event.messageID);
    }
};

module.exports.onLoad = function() {
    console.log('🛡️ Module AI với bảo vệ đã được tải!');
};