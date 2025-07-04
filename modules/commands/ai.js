const axios = require('axios');
const fs = require('fs');
const path = require('path');

let BotProtectionClass;
try {
    BotProtectionClass = require('../utils/BotProtection');
} catch (error) {
    BotProtectionClass = class {
        constructor() {
            this.userInteractions = new Map();
        }
        
        shouldRespond(userID, message) {
            return { allow: true, reason: null };
        }
        
        getPoliteDeclineMessage(reason) {
            return null;
        }
        
        async sendNaturalResponse(api, message, threadID, messageID) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
            return api.sendMessage(message, threadID, messageID);
        }
    };
}

const aiProtection = new BotProtectionClass();
const botMessageIds = new Set();

async function sendBotMessage(api, message, threadID, messageID) {
    try {
        const result = await aiProtection.sendNaturalResponse(api, message, threadID, messageID);
        
        if (result && result.messageID) {
            botMessageIds.add(result.messageID);
            
            // Cleanup old entries
            if (botMessageIds.size > 100) {
                const firstId = botMessageIds.values().next().value;
                botMessageIds.delete(firstId);
            }
        }
        
        return result;
    } catch (error) {
        throw error;
    }
}

const configPath = path.join(__dirname, '..', '..', 'data', 'ai_config.json');

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('[AI Config] Error loading config:', error);
    }
    return { 
        enabled: {}, 
        globalEnabled: true
    };
}

function saveConfig(config) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('[AI Config] Error saving config:', error);
        return false;
    }
}

let aiConfig = loadConfig();

module.exports.config = {
    name: "ai",
    version: "2.5.0",
    hasPermssion: 3,
    credits: "atomic",
    description: "AI thông minh với reply và bật/tắt",
    commandCategory: "Admin",
    usages: "[câu hỏi] | on/off | help",
    cooldowns: 2
};

const GEMINI_CONFIG = {
    apiKey: "AIzaSyAdFEcglp3j761bY31gJ4NAJSfjNx1ot04",
    model: "gemini-1.5-flash",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/"
};

const BOT_NAMES = ['bot', 'ai', 'gemini', 'assistant', 'trợ lý', 'em yêu', 'hoài'];

function isBotMentioned(message) {
    if (!message || typeof message !== 'string') return false;
    const lowerMessage = message.toLowerCase();
    return BOT_NAMES.some(name => 
        lowerMessage.includes(name) || 
        lowerMessage.startsWith(name)
    );
}

function isBotEnabled(threadID) {
    if (!aiConfig.globalEnabled) return false;
    return aiConfig.enabled[threadID] !== false;
}

async function callGeminiAPI(prompt) {
    try {
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return "⚠️ Vui lòng cung cấp câu hỏi hợp lệ!";
        }

        if (GEMINI_CONFIG.apiKey === "YOUR_GEMINI_API_KEY") {
            return "⚠️ Chưa cấu hình API key cho Gemini. Vui lòng thêm API key vào module!";
        }

        const url = `${GEMINI_CONFIG.apiUrl}${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [{
                    text: `Bạn là một AI assistant thông minh và hữu ích. Trả lời một cách tự nhiên, thân thiện và ngắn gọn: ${prompt}`
                }]
            }],
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 800,
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH", 
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Không nhận được phản hồi hợp lệ từ Gemini');
        }

    } catch (error) {
        console.error('[AI] Gemini API Error:', error);
        const fallbackResponses = [
            "Xin lỗi, tôi đang gặp chút vấn đề kỹ thuật. Thử lại sau nhé! 😅",
            "Oops! Có lỗi xảy ra với hệ thống. Bạn hãy hỏi lại sau ít phút! 🔧",
            "Kết nối không ổn định, vui lòng thử lại! ⚡",
            "Tôi đang bận xử lý yêu cầu khác, chờ chút nhé! 🤖"
        ];
        
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
}

module.exports.handleEvent = async function({ api, event, Users, Threads, Currencies, models }) {
    try {
        if (event.type !== "message" && event.type !== "message_reply") {
            return;
        }
        
        if (event.senderID === api.getCurrentUserID()) {
            return;
        }
        
        const threadID = event.threadID;
        const userID = event.senderID;
        
        if (!isBotEnabled(threadID)) {
            return;
        }
        
        let shouldProcess = false;
        let userMessage = "";
        
        if (event.messageReply) {
            const botUserID = api.getCurrentUserID();
            let isReplyToBot = false;
            
            if (event.messageReply.senderID == botUserID) {
                isReplyToBot = true;
            }
            
            if (event.messageReply.messageID && botMessageIds.has(event.messageReply.messageID)) {
                isReplyToBot = true;
            }
            
            if (event.messageReply.body && typeof event.messageReply.body === 'string' &&
                (event.messageReply.body.includes('🤖') || 
                 event.messageReply.body.includes('AI') ||
                 event.messageReply.body.includes('Bot') ||
                 event.messageReply.body.includes('Gemini'))) {
                isReplyToBot = true;
            }
            
            if (isReplyToBot) {
                shouldProcess = true;
                userMessage = event.body || "";
            }
        } 
        else if (event.body && isBotMentioned(event.body)) {
            shouldProcess = true;
            userMessage = event.body.trim();
            
            BOT_NAMES.forEach(name => {
                const regex = new RegExp(`\\b${name}\\b`, 'gi');
                userMessage = userMessage.replace(regex, '').trim();
            });
        }
        
        if (!shouldProcess) {
            return;
        }
        
        const shouldRespond = aiProtection.shouldRespond(userID, userMessage);
        
        if (!shouldRespond.allow) {
            const declineMessage = aiProtection.getPoliteDeclineMessage(shouldRespond.reason);
            if (declineMessage) {
                await aiProtection.sendNaturalResponse(api, declineMessage, threadID, event.messageID);
            }
            return;
        }
        
        let cleanMessage = userMessage;
        
        if (!cleanMessage || cleanMessage.trim().length === 0) {
            const greetings = [
                "Xin chào! Tôi có thể giúp gì cho bạn? 😊",
                "Hi! Bạn muốn hỏi gì không? 🤖", 
                "Chào bạn! Tôi đang sẵn sàng trò chuyện! ✨",
                "Có gì tôi có thể hỗ trợ bạn không? 💭"
            ];
            const greeting = greetings[Math.floor(Math.random() * greetings.length)];
            await sendBotMessage(api, greeting, threadID, event.messageID);
            return;
        }
        
        const aiResponse = await callGeminiAPI(cleanMessage);
        await sendBotMessage(api, aiResponse, threadID, event.messageID);
        
    } catch (error) {
        console.error('[AI HandleEvent] Error:', error);
        const errorMessage = "Đã có lỗi xảy ra! Vui lòng thử lại sau. 🔧";
        try {
            await sendBotMessage(api, errorMessage, event.threadID, event.messageID);
        } catch (sendError) {
            console.error('[AI HandleEvent] Send Error:', sendError);
        }
    }
};

module.exports.run = async function({ api, event, args }) {
    try {
        const threadID = event.threadID;
        const userID = event.senderID;
        
        // Đảm bảo args luôn là array
        const safeArgs = Array.isArray(args) ? args : [];
        const command = safeArgs[0]?.toLowerCase();
        
        if (command === 'on' || command === 'off') {
            const newState = command === 'on';
            aiConfig.enabled[threadID] = newState;
            
            if (saveConfig(aiConfig)) {
                const statusText = newState ? 'BẬT' : 'TẮT';
                const emoji = newState ? '✅' : '❌';  
                const message = `${emoji} AI đã được ${statusText} trong nhóm này!\n\n` +
                              `${newState ? '🤖 Bây giờ bạn có thể:\n• Gọi tên bot trong tin nhắn\n• Reply tin nhắn của bot\n• Sử dụng lệnh .ai' : 
                               '😴 Bot sẽ không tự động trả lời nữa.\nDùng ".ai on" để bật lại.'}`;
                return api.sendMessage(message, threadID, event.messageID);
            } else {
                return api.sendMessage("❌ Không thể lưu cài đặt. Vui lòng thử lại!", threadID, event.messageID);
            }
        }
        
        if (command === 'help' || command === 'h') {
            const isEnabled = isBotEnabled(threadID);
            const statusText = isEnabled ? '✅ ĐANG BẬT' : '❌ ĐANG TẮT';
            const botNamesList = Array.isArray(BOT_NAMES) ? BOT_NAMES.join(', ') : 'ai, bot';
            
            const helpMessage = `🤖 HƯỚNG DẪN SỬ DỤNG AI BOT v2.5.0\n\n` +
                              `📊 Trạng thái: ${statusText}\n\n` +
                              `🎯 Cách sử dụng:\n` +
                              `• Gọi tên: "AI ơi, hôm nay thời tiết thế nào?"\n` +
                              `• Reply: Reply tin nhắn của bot\n` +
                              `• Lệnh: .ai [câu hỏi của bạn]\n\n` +
                              `⚙️ Điều khiển:\n` +
                              `• \`.ai on/off\` - Bật/tắt bot\n` +
                              `• \`.ai help\` - Xem hướng dẫn\n\n` +
                              `🏷️ Tên gọi: ${botNamesList}\n\n` +
                              `💡 Mẹo: Hãy thử gọi tên bot hoặc reply tin nhắn này!`;
            
            return api.sendMessage(helpMessage, threadID, event.messageID);
        }
        
        if (!isBotEnabled(threadID)) {
            return api.sendMessage("😴 AI Bot đang tắt trong nhóm này.\n\n" +
                                 "Sử dụng `.ai on` để bật bot.", threadID, event.messageID);
        }
        
        // Xử lý tin nhắn người dùng an toàn
        const userMessage = safeArgs.length > 0 ? safeArgs.join(' ') : '';
        
        if (!userMessage || userMessage.trim().length === 0) {
            return api.sendMessage("❓ Bạn muốn hỏi gì?\n\n" +
                                 "Ví dụ: `.ai Hôm nay thời tiết thế nào?`\n" +
                                 "Hoặc gõ `.ai help` để xem hướng dẫn chi tiết.", threadID, event.messageID);
        }
        
        const shouldRespond = aiProtection.shouldRespond(userID, userMessage);
        
        if (!shouldRespond.allow) {
            const declineMessage = aiProtection.getPoliteDeclineMessage(shouldRespond.reason);
            if (declineMessage) {
                await aiProtection.sendNaturalResponse(api, declineMessage, threadID, event.messageID);
            }
            return;
        }
        
        const aiResponse = await callGeminiAPI(userMessage);
        await sendBotMessage(api, aiResponse, threadID, event.messageID);
        
    } catch (error) {
        console.error('[AI Run] Error:', error);
        console.error('[AI Run] Error Details:', {
            message: error.message,
            stack: error.stack,
            args: args,
            eventType: event?.type,
            threadID: event?.threadID
        });
        return api.sendMessage("❌ Đã có lỗi xảy ra!\nVui lòng thử lại sau. 🔧", event.threadID, event.messageID);
    }
};

module.exports.onLoad = function() {
    aiConfig = loadConfig();
    
    if (GEMINI_CONFIG.apiKey === "YOUR_GEMINI_API_KEY") {
        console.warn('⚠️  [AI Module] CẢNH BÁO: Chưa cấu hình API key cho Gemini!');
    }
};