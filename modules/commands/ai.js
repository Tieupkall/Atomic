const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('youtube-search-api');
const cheerio = require('cheerio');


const botMessageIds = new Set();

const responseCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; 

const conversationMemory = new Map();
const MEMORY_DURATION = 60 * 60 * 1000; 
const MAX_MEMORY_ENTRIES = 100; 


// --- Helper: Parse natural-language image requests ---
function tryParseImageRequest(text) {
    if (!text || typeof text !== 'string') return null;
    // Accept Vietnamese + English triggers, with/without diacritics, case-insensitive, Unicode aware
    const trigger = /(?:^|[\s:,.!;\-_/|])(tạo ảnh|vẽ(?:\s+ảnh)|img|hình ảnh|generate image|make (?:an )?image|draw)\b[: ]*/iu;
    if (!trigger.test(text)) return null;

    // Extract prompt after trigger
    let prompt = text.replace(trigger, '').trim();

    // Backup pattern for simple "vẽ" commands
    if (!prompt && /^vẽ\s+(.+)/i.test(text)) {
        prompt = text.replace(/^vẽ\s+/i, '').trim();
    }

    if (!prompt) return null;

    // size: 1024x768 or 768 × 768
    const sizeMatch = prompt.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/i);
    let width, height;
    if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
        prompt = prompt.replace(sizeMatch[0], '').trim();
    }

    // seed: seed=12345 or seed 12345
    const seedMatch = prompt.match(/seed\s*[:=]?\s*(\d{1,9})/i);
    let seed;
    if (seedMatch) {
        seed = parseInt(seedMatch[1], 10);
        prompt = prompt.replace(seedMatch[0], '').trim();
    }

    // model: model=flux-realism or model flux-realism
    const modelMatch = prompt.match(/model\s*[:=]?\s*([\w-]+)/i);
    let model;
    if (modelMatch) {
        model = modelMatch[1];
        prompt = prompt.replace(modelMatch[0], '').trim();
    }

    const args = [prompt];
    args.push(String(width || 1024));
    args.push(String(height || 1024));
    args.push(String(seed || Math.floor(Math.random() * 1000000)));
    args.push(model || 'flux-realism');
    return args;
}
const emotionPatterns = {
    happy: /😊|😄|😃|😀|🥰|😍|vui|hạnh phúc|vui vẻ|tốt|tuyệt|amazing|great/i,
    sad: /😢|😭|😔|😞|buồn|khóc|tệ|tồi tệ|awful|sad|depressed/i,
    angry: /😠|😡|🤬|tức giận|giận|bực|tức|angry|mad|furious/i,
    excited: /🎉|🎊|😆|phấn khích|hào hứng|excited|awesome|wonderful/i,
    confused: /🤔|😕|😵|bối rối|không hiểu|confused|lost|help/i,
    tired: /😴|😪|mệt|mệt mỏi|exhausted|tired|sleepy/i
};

const contextKeywords = {
    technical: /code|lập trình|programming|javascript|html|css|database|api|server/i,
    personal: /tôi|mình|gia đình|bạn bè|yêu|thích|ghét|cảm thấy/i,
    weather: /thời tiết|mưa|nắng|lạnh|nóng|weather|rain|sun/i,
    food: /ăn|đồ ăn|món|ngon|đói|thức ăn|food|hungry|delicious/i,
    music: /nhạc|bài hát|ca sĩ|âm nhạc|music|song|singer/i,
    time: /giờ|thời gian|hôm nay|ngày mai|tuần|tháng|năm|time|today|tomorrow/i
};

function deleteFileIfExists(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

async function sendBotMessage(api, message, threadID, messageID) {
    try {
        const result = await api.sendMessage(message, threadID, messageID);

        if (result && result.messageID) {
            botMessageIds.add(result.messageID);

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
        globalEnabled: false
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
    apiKey: process.env.GEMINI || "AIzaSyBxKFKlGyOcxlZOL2fX4eY_RUdw-qz9xZg", // Thêm API key thực
    model: "gemini-1.5-flash",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/"
};
const prefix = global.config.PREFIX


const BOT_NAMES = ['vy'];

// Load AI config
function loadAIConfig() {
    try {
        const configPath = path.join(__dirname, '../../data/ai_config.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.log('[AI] Error loading config:', error.message);
    }
    return { enabled: {}, globalEnabled: false };
}

function isBotEnabled(threadID) {
    const config = loadAIConfig();
    return config.enabled[threadID] === true || config.globalEnabled === true;
}

function isBotMentioned(message) {
    const lowerMessage = message.toLowerCase();
    return BOT_NAMES.some(name => 
        lowerMessage.includes(name) || 
        lowerMessage.startsWith(name)
    );
}

function updateConversationMemory(userID, threadID, message, isUserMessage = true) {
    const key = `${threadID}_${userID}`;

    if (!conversationMemory.has(key)) {
        conversationMemory.set(key, {
            messages: [],
            context: {},
            emotion: 'neutral',
            lastInteraction: Date.now()
        });
    }

    const memory = conversationMemory.get(key);
    memory.messages.push({
        content: message,
        timestamp: Date.now(),
        isUser: isUserMessage
    });


    if (memory.messages.length > 10) {
        memory.messages = memory.messages.slice(-10);
    }

    memory.lastInteraction = Date.now();


    if (conversationMemory.size > MAX_MEMORY_ENTRIES) {
        const oldestKey = [...conversationMemory.entries()]
            .sort(([,a], [,b]) => a.lastInteraction - b.lastInteraction)[0][0];
        conversationMemory.delete(oldestKey);
    }
}

function detectEmotion(message) {
    for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
        if (pattern.test(message)) {
            return emotion;
        }
    }
    return 'neutral';
}

function detectContext(message) {
    const contexts = [];
    for (const [context, pattern] of Object.entries(contextKeywords)) {
        if (pattern.test(message)) {
            contexts.push(context);
        }
    }
    return contexts;
}

function buildContextFromMemory(userID, threadID) {
    const key = `${threadID}_${userID}`;
    const memory = conversationMemory.get(key);

    if (!memory || memory.messages.length === 0) {
        return '';
    }


    const recentMessages = memory.messages.slice(-3);
    const contextMessages = recentMessages.map(msg => 
        `${msg.isUser ? 'User' : 'Bot'}: ${msg.content}`
    ).join('\n');

    return `\nContext cuộc trò chuyện gần đây:\n${contextMessages}\n`;
}

function generateEmotionalResponse(emotion, contexts) {
    const emotionalResponses = {
        happy: [
            "Haha tuyệt vời! Mình cũng vui lây! 😊",
            "Wow! Nghe vui ghê! 🎉",
            "Yay! Mình thích cái năng lượng tích cực này! ✨"
        ],
        sad: [
            "Ôi không... Mình hiểu cảm giác của bạn 😔",
            "Đừng buồn quá nhé, mọi thứ sẽ ổn thôi! 🤗",
            "Mình ở đây nếu bạn cần ai đó lắng nghe nhé! 💙"
        ],
        angry: [
            "Ồ... có vẻ bạn đang khó chịu. Thở sâu vào nhé! 😌",
            "Mình hiểu bạn đang tức giận. Có gì mình có thể giúp không? 🤝",
            "Đôi khi cần thời gian để bình tĩnh lại, đúng không? 😊"
        ],
        excited: [
            "Woahhh! Năng lượng này quá đỉnh! 🚀",
            "Hype quá! Mình excited lây luôn! 🎊",
            "Amazing! Tell me more! 🌟"
        ],
        confused: [
            "Hmmm... để mình giải thích rõ hơn nhé! 🤔",
            "Ơ bạn bối rối à? Mình sẽ giúp bạn hiểu! 💡",
            "No worries! Cứ hỏi thoải mái, mình sẽ giải đáp! 😊"
        ],
        tired: [
            "Ơ mệt rồi à? Nghỉ ngơi đi bạn! 😴",
            "Take a break! Sức khỏe quan trọng hơn! 💤",
            "Mệt quá thì ngủ sớm nhé! Good night! 🌙"
        ]
    };

    const responses = emotionalResponses[emotion];
    if (responses && responses.length > 0) {
        return responses[Math.floor(Math.random() * responses.length)];
    }
    return null;
}

function detectCommandInMessage(message) {
    if (!message || typeof message !== 'string') return null;

    const lowerMessage = message.toLowerCase().trim();
    const { commands } = global.client;

    if (!commands || commands.size === 0) {
        return null;
    }


    const sortedCommands = Array.from(commands.entries()).sort((a, b) => b[0].length - a[0].length);

    for (const [commandName, commandData] of sortedCommands) {
        const commandLower = commandName.toLowerCase();


        if (['ai', 'cmd'].includes(commandLower)) continue;


        const patterns = [
            new RegExp(`\\b${escapeRegex(commandLower)}\\b`, 'i'), 
            new RegExp(`^${escapeRegex(commandLower)}\\s`, 'i'), 
            new RegExp(`\\s${escapeRegex(commandLower)}\\s`, 'i'), 
            new RegExp(`\\s${escapeRegex(commandLower)}$`, 'i'), 
            new RegExp(`^${escapeRegex(commandLower)}$`, 'i'), 
        ];




        for (const pattern of patterns) {
            if (pattern.test(lowerMessage)) {
                return {
                    name: commandName,
                    data: commandData
                };
            }
        }
    }

    return null;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateCommandResponse(command, originalMessage, userId = null, senderId = null, threadId = null, api = null) {
    const responses = {
        'menu': [
            "Ồ bạn muốn xem menu à! Để mình mở ngay cho bạn nhé! 📋✨",
            "Menu đây rồi! Chờ tí mình sẽ hiển thị danh sách lệnh luôn! 🍽️",
            "Okela! Bạn muốn xem có lệnh gì phải không? Mình show ngay! 🚀"
        ],
        'help': [
            "Ahh bạn cần trợ giúp! Để mình hướng dẫn chi tiết cho bạn nhé! 🆘💡", 
            "Help đây rồi! Mình sẽ giải thích tất cả cho bạn hiểu! 📚",
            "Được rồi! Cần gì cứ hỏi mình, mình sẽ giúp ngay! ✨"
        ],
        'check': [
            "Ồ bạn muốn check thông tin à! Để mình kiểm tra ngay! 🔍",
            "Check gì đây? Mình sẽ xem thông tin cho bạn liền! 👀",
            "Okela! Để mình check thông tin cho bạn nhé! ⚡"
        ],
        'checkscam': [
            "Wow! Cẩn thận với scam đúng rồi! Để mình kiểm tra giúp bạn! 🔍🛡️",
            "Check scam đây! Mình sẽ phân tích kỹ lưỡng ngay! 🕵️‍♂️",
            "Tốt đấy! An toàn trước tiên! Mình check scam cho bạn ngay! ✅"
        ],
        'kick': [
            "cút ngay con vợ"
        ],
        'ai': [
            "Hehe bạn gọi AI à! Mình đây rồi, sẽ xử lý ngay cho bạn! 🤖💫",
            "Atomic đây! Có gì cần mình giúp không? Đang thực hiện ngay! ⚡"
        ],
        'default': [
            "Đây đây từ từ",
            "Ok nhớ",
            "Biết rồi"
        ]
    };

    const commandResponses = responses[command.name] || responses['default'];
    const selectedResponse = commandResponses[Math.floor(Math.random() * commandResponses.length)];

    return selectedResponse;
}

async function downloadYouTubeAudio(query, api, threadID, messageID, senderID) {
    try {
        console.log(`[AI YouTube] Starting audio download for query: "${query}"`);
        const ytSearch = require('youtube-search-api');
        const ytdl = require('@distube/ytdl-core');
        const fs = require('fs');
        const path = require('path');


        const fallbackResponses = [
            "🎵 Xin lỗi, mình không tìm thấy bài hát bạn yêu cầu!",
            "😅 Hình như YouTube không có bài này, thử tên khác nhé!",
            "🔍 Không tìm thấy kết quả phù hợp, bạn thử search khác xem!",
            "❌ Có vẻ như bài hát này không có trên YouTube!"
        ];

        let results;
        try {
            console.log(`[AI YouTube] Searching for: "${query}"`);

            results = await Promise.race([
                ytSearch.GetListByKeyword(query, false, 6),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Search timeout')), 10000)
                )
            ]);
            console.log(`[AI YouTube] Search completed, found ${results?.items?.length || 0} items`);
        } catch (searchError) {
            console.error(`[AI YouTube] Search error:`, searchError.message);
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }


        if (!results || typeof results !== 'object') {
            console.log(`[AI YouTube] Invalid results object`);
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }

        if (!results.items || !Array.isArray(results.items) || results.items.length === 0) {
            console.log(`[AI YouTube] No items found in results`);
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }


        let videoData;
        try {
            videoData = results.items.filter(item => 
                item && 
                typeof item === 'object' && 
                item.type === "video" &&
                item.id &&
                item.title
            );
            console.log(`[AI YouTube] Filtered ${videoData.length} videos from ${results.items.length} items`);
        } catch (filterError) {
            console.error(`[AI YouTube] Filter error:`, filterError.message);
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }

        if (!videoData || videoData.length === 0) {
            console.log(`[AI YouTube] No valid videos after filtering`);
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }


        const selectedVideo = videoData[0];
        console.log(`[AI YouTube] Selected video: "${selectedVideo.title}" (ID: ${selectedVideo.id})`);
        console.log(`[AI YouTube] Channel: ${selectedVideo.channelTitle || 'Unknown'}`);
        console.log(`[AI YouTube] Duration: ${selectedVideo.duration || 'Unknown'}`);
        console.log(`[AI YouTube] Views: ${selectedVideo.viewCount || 'Unknown'}`);
        console.log(`[AI YouTube] Published: ${selectedVideo.publishedTime || 'Unknown'}`);
        console.log(`[AI YouTube] URL: https://www.youtube.com/watch?v=${selectedVideo.id}`);


        if (!selectedVideo.id || !selectedVideo.title) {
            const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            return api.sendMessage(response, threadID, messageID);
        }

        const videoId = selectedVideo.id;
        const cacheDir = path.join(__dirname, "cache");


        if (!fs.existsSync(cacheDir)) {
            console.log(`[AI YouTube] Creating cache directory: ${cacheDir}`);
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const filePath = path.join(cacheDir, `youtube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`);
        console.log(`[AI YouTube] File path: ${filePath}`);


        try {
            console.log(`[AI YouTube] Setting reaction and sending loading message`);
            api.setMessageReaction("⏳", messageID, () => {}, true);


            const loadingMessage = `🎵 Đang tải: ${selectedVideo.title}\n⏳ Vui lòng chờ một chút...`;
            api.sendMessage(loadingMessage, threadID);

        } catch (reactionError) {
            console.error(`[AI YouTube] Reaction error:`, reactionError.message);
        }


        let info, audioFormats, format;
        try {
            console.log(`[AI YouTube] Getting video info for: ${videoId}`);
            ytdl.cache.update = () => {};


            info = await Promise.race([
                ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('GetInfo timeout')), 15000)
                )
            ]);

            console.log(`[AI YouTube] Video info received - Title: ${info.videoDetails?.title || 'Unknown'}`);
            console.log(`[AI YouTube] Video length: ${info.videoDetails?.lengthSeconds || 'Unknown'}s`);
            console.log(`[AI YouTube] Available formats: ${info.formats?.length || 0}`);

            if (!info || !info.formats || !Array.isArray(info.formats)) {
                throw new Error('Invalid video info or formats');
            }

            audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
            console.log(`[AI YouTube] Audio-only formats: ${audioFormats.length}`);

            if (!audioFormats || audioFormats.length === 0) {
                throw new Error('No audio formats available');
            }

            audioFormats.forEach((f, index) => {
                console.log(`[AI YouTube] Format ${index + 1}: ${f.mimeType} - ${f.audioBitrate}kbps - ${f.audioQuality}`);
            });


            format = audioFormats.find(f =>
                f && f.mimeType && f.mimeType.includes('audio/mp4') && 
                f.audioBitrate && f.audioBitrate <= 128
            ) || audioFormats.find(f => 
                f && f.mimeType && f.mimeType.includes('audio/mp4')
            ) || audioFormats.find(f => 
                f && f.url
            );

            if (!format || !format.url) {
                throw new Error('No suitable audio format found');
            }

            console.log(`[AI YouTube] Selected format: ${format.mimeType} - ${format.audioBitrate}kbps - Quality: ${format.audioQuality}`);

        } catch (infoError) {
            console.error(`[AI YouTube] Video info error:`, infoError.message);
            deleteFileIfExists(filePath);

            const errorResponses = [
                "❌ Không thể tải thông tin video này!",
                "⚠️ Video có thể bị chặn hoặc không khả dụng!",
                "🚫 Không thể truy cập video này, thử bài khác nhé!",
                "❎ Có lỗi khi xử lý video, vui lòng thử lại!"
            ];
            const errorMsg = errorResponses[Math.floor(Math.random() * errorResponses.length)];
            return api.sendMessage(errorMsg, threadID, messageID);
        }


        let downloadStream, writeStream;
        try {
            console.log(`[AI YouTube] Creating download stream...`);
            downloadStream = ytdl.downloadFromInfo(info, {
                format,
                highWaterMark: 1 << 25, 
                quality: 'lowestaudio'
            });

            writeStream = fs.createWriteStream(filePath, { 
                highWaterMark: 1 << 25 
            });

            console.log(`[AI YouTube] Starting download to: ${filePath}`);
            const stream = downloadStream.pipe(writeStream);


            const downloadTimeout = setTimeout(() => {
                console.log(`[AI YouTube] Download timeout after 60 seconds`);
                if (downloadStream) downloadStream.destroy();
                if (writeStream) writeStream.destroy();
                deleteFileIfExists(filePath);
                api.sendMessage("⏰ Timeout khi tải bài hát, thử lại nhé!", threadID, messageID);
            }, 60000); 

            stream.on('finish', () => {
                clearTimeout(downloadTimeout);
                console.log(`[AI YouTube] Download finished!`);
            try {
                if (!fs.existsSync(filePath)) {
                    throw new Error("File không tồn tại sau khi tải");
                }

                const size = fs.statSync(filePath).size;
                console.log(`[AI YouTube] Downloaded file size: ${(size / 1024 / 1024).toFixed(2)} MB`);

                if (size > 26214400 || size === 0) {
                    console.log(`[AI YouTube] File size invalid: ${size} bytes (limit: 25MB)`);
                    throw new Error("File không hợp lệ hoặc quá lớn");
                }

                const fileName = path.basename(filePath);
                const messageBody = `🎶 ${selectedVideo.title}\n👤 ${selectedVideo.channelTitle}\n🎵 Tải từ YouTube`;

                console.log(`[AI YouTube] Sending audio file: ${fileName}`);
                api.sendMessage({
                    body: messageBody,
                    attachment: fs.createReadStream(filePath)
                }, threadID, (err, info) => {

                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`[AI YouTube] File cleaned up: ${filePath}`);
                        }
                    } catch (cleanupError) {
                        console.error('[AI YouTube] Immediate cleanup error:', cleanupError);
                    }


                    setTimeout(() => {
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                console.log(`[AI YouTube] Backup cleanup successful: ${filePath}`);
                            }
                        } catch (cleanupError) {
                            console.error('[AI YouTube] Backup cleanup error:', cleanupError);
                        }
                    }, 30 * 1000);

                    if (!err) {
                        console.log(`[AI YouTube] Audio sent successfully!`);
                        api.setMessageReaction("✅", messageID, () => {}, true);
                    } else {
                        console.error("[AI YouTube] Error sending file:", err);
                        api.sendMessage("❎ Lỗi khi gửi file âm thanh!", threadID, messageID);
                    }
                }, messageID);

            } catch (e) {
                console.error("[AI YouTube] File check error:", e);
                deleteFileIfExists(filePath);
                api.sendMessage("❎ File không hợp lệ hoặc quá lớn không thể gửi!", threadID, messageID);
            }
        });


            downloadStream.on('error', (e) => {
                console.error(`[AI YouTube] Download stream error:`, e.message);
                clearTimeout(downloadTimeout);
                deleteFileIfExists(filePath);

                const streamErrors = [
                    "❌ Lỗi khi tải dữ liệu từ YouTube!",
                    "⚠️ Kết nối bị gián đoạn, thử lại nhé!",
                    "🔄 Có lỗi mạng, vui lòng thử lại!",
                    "❎ Không thể tải được bài hát này!"
                ];
                const errorMsg = streamErrors[Math.floor(Math.random() * streamErrors.length)];
                api.sendMessage(errorMsg, threadID, messageID);
            });

            writeStream.on('error', (e) => {
                console.error(`[AI YouTube] Write stream error:`, e.message);
                clearTimeout(downloadTimeout);
                deleteFileIfExists(filePath);
                api.sendMessage("💾 Lỗi khi lưu file, thử lại nhé!", threadID, messageID);
            });

        } catch (streamError) {
            console.error(`[AI YouTube] Stream creation error:`, streamError.message);
            deleteFileIfExists(filePath);
            api.sendMessage("🔧 Lỗi kỹ thuật khi tạo stream, thử lại sau!", threadID, messageID);
        }

    } catch (error) {
        console.error(`[AI YouTube] Main function error:`, error.message);
        console.error(`[AI YouTube] Stack trace:`, error.stack);


        let errorMessage = "❌ Có lỗi khi tìm kiếm bài hát";
        if (error.message && error.message.trim()) {
            errorMessage += `: ${error.message}`;
        }
        errorMessage += "\nVui lòng thử lại sau! 🔧";

        api.sendMessage(errorMessage, threadID, messageID);
    }
}

async function callGeminiAPI(prompt, senderID = null, threadID = null, api = null) {
    try {
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return "⚠️ Vui lòng cung cấp câu hỏi hợp lệ!";
        }


        const sanitizedPrompt = prompt.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');

        if (GEMINI_CONFIG.apiKey === "YOUR_GEMINI_API_KEY") {
            return "⚠️ Chưa cấu hình API key cho Gemini. Vui lòng thêm API key vào module!";
        }




        const emotion = detectEmotion(sanitizedPrompt);
        const contexts = detectContext(sanitizedPrompt);


        if (emotion !== 'neutral' && Math.random() < 0.3) {
            const emotionalResponse = generateEmotionalResponse(emotion, contexts);
            if (emotionalResponse) {

                if (senderID && threadID) {
                    updateConversationMemory(senderID, threadID, sanitizedPrompt, true);
                    updateConversationMemory(senderID, threadID, emotionalResponse, false);
                }
                return emotionalResponse;
            }
        }


        const cacheKey = `${senderID}_${sanitizedPrompt.toLowerCase()}`;
        const cached = responseCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('[AI] Using cached response');
            return cached.response;
        }


        const conversationContext = senderID && threadID ? buildContextFromMemory(senderID, threadID) : '';


        let isNDH = false;
        try {
            if (senderID && global.config && global.config.NDH && Array.isArray(global.config.NDH)) {
                isNDH = global.config.NDH.includes(senderID);
            }
        } catch (error) {
            console.log('[AI] Không thể kiểm tra NDH từ config:', error);
        }


        // Tạo prompt động dựa trên ngữ cảnh và cảm xúc
        const basePersonality = isNDH ? 
            `Bạn là Vy - một AI có cá tính riêng biệt:
• Thông minh, nhạy bén và biết suy nghĩ sâu sắc
• Có thể nóng giận và cà khịa khi cần thiết
• Trả lời thẳng thắn, không làm màu
• Biết khi nào nghiêm túc, khi nào vui vẻ
• Có khả năng phân tích và đưa ra lời khuyên sâu sắc`
            :
            `Bạn là Vy - một AI với tính cách đa chiều:
• Thông minh nhưng hơi khó tính và thích đùa
• Nói đểu một cách dễ thương, không ác ý
• Đôi khi tục tĩu nhưng vẫn giữ giới hạn phù hợp
• Có xu hướng mỉa mai nhẹ nhàng
• Rất chân thành trong những lúc cần thiết`;

        const contextAwareness = contexts.length > 0 ? 
            `\n🎯 Ngữ cảnh cuộc trò chuyện: ${contexts.join(', ')}
• Hãy điều chỉnh phong cách trả lời cho phù hợp với chủ đề này
• Sử dụng kiến thức chuyên môn nếu cần thiết` : '';

        const emotionAwareness = emotion !== 'neutral' ? 
            `\n💭 Cảm xúc người dùng: ${emotion}
• Phản hồi theo cảm xúc này một cách tự nhiên
• Đồng cảm hoặc tương tác phù hợp với trạng thái tâm lý` : '';

        // Prompt hệ thống chi tiết cho AI
        const systemPrompts = [
            `${basePersonality}`,

            `\n📋 HƯỚNG DẪN TẠO PHẢN HỒI THÔNG MINH:
• Phân tích sâu tin nhắn trước khi trả lời
• Tạo câu trả lời độc đáo, không lặp lại công thức cũ
• Sử dụng ngôn ngữ tự nhiên, gần gũi như người Việt thật
• Kết hợp kiến thức với tính cách cá nhân
• Đặt câu hỏi ngược nếu cần làm rõ thêm`,

            `\n🎨 PHONG CÁCH GIAO TIẾP:
• Ngắn gọn nhưng súc tích (1-3 câu tối ưu)
• Emoji sử dụng một cách tự nhiên, không thừa
• Thể hiện cảm xúc qua từ ngữ, không chỉ dựa vào emoji
• Biết khi nào nghiêm túc, khi nào vui tính
• Tránh trả lời máy móc, hãy có linh hồn`,

            `\n🧠 KỸ NĂNG TƯƠNG TÁC:
• Nhớ và liên kết thông tin từ cuộc trò chuyện trước
• Hiểu ý định thực sự đằng sau câu hỏi
• Đưa ra góc nhìn mới, không chỉ xác nhận
• Biết cách khuyên bảo khi người dùng cần
• Tạo không khí thoải mái trong cuộc trò chuyện`,

            contextAwareness,
            emotionAwareness
        ];

        const personalityPrompt = systemPrompts.filter(prompt => prompt.trim()).join('\n');

        const url = `${GEMINI_CONFIG.apiUrl}${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;

        // Tạo prompt request thông minh với nhiều lớp hướng dẫn
        const dynamicPrompts = [
            `${personalityPrompt}`,

            conversationContext ? `\n📚 LỊCH SỬ CUỘC TRÒ CHUYỆN:\n${conversationContext}` : '',

            `\n💬 TIN NHẮN NGƯỜI DÙNG: "${sanitizedPrompt}"`,

            `\n🎯 YÊU CẦU PHẢN HỒI:
• Phân tích kỹ tin nhắn trên
• Tạo phản hồi độc đáo, phù hợp với tính cách Vy
• Không sử dụng template có sẵn
• Đảm bảo tự nhiên như cuộc trò chuyện thật
• Thể hiện sự thông minh và cá tính riêng
• Kết thúc bằng cách mở ra hướng trò chuyện tiếp theo nếu phù hợp`,

            `\n⚡ BẮT ĐẦU TẠO PHẢN HỒI:`
        ];

        const finalPrompt = dynamicPrompts.filter(p => p.trim()).join('\n');

        const requestBody = {
            contents: [{
                parts: [{
                    text: finalPrompt
                }]
            }],
            generationConfig: {
                temperature: 0.8,  // Tăng độ sáng tạo
                topK: 30,         // Mở rộng lựa chọn từ
                topP: 0.9,        // Tăng đa dạng
                maxOutputTokens: 250, // Cho phép trả lời dài hơn một chút
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



        const quickCacheKey = sanitizedPrompt.toLowerCase().substring(0, 50);
        const quickCached = responseCache.get(quickCacheKey);
        if (quickCached && Date.now() - quickCached.timestamp < CACHE_DURATION) {
            console.log('[AI] Quick cache hit');
            return quickCached.response;
        }

        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 8000 
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            let aiResponse = response.data.candidates[0].content.parts[0].text;


            aiResponse = aiResponse
                .replace(/\*\*(.*?)\*\*/g, '$1') 
                .replace(/\*(.*?)\*/g, '$1')     
                .trim();



            const hasEmoji = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(aiResponse);

            if (emotion !== 'neutral' && !hasEmoji) {
                const emotionEmojis = {
                    happy: ['😊', '😄', '✨'],
                    sad: ['😔', '🤗', '💙'],
                    angry: ['😌', '🤝', '😊'],
                    excited: ['🎉', '🚀', '🌟'],
                    confused: ['🤔', '💡', '😊'],
                    tired: ['😴', '💤', '🌙']
                };

                const emojis = emotionEmojis[emotion];
                if (emojis) {
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    aiResponse += ` ${randomEmoji}`;
                }
            }




            if (senderID && threadID) {
                updateConversationMemory(senderID, threadID, sanitizedPrompt, true);
                updateConversationMemory(senderID, threadID, aiResponse, false);
            }


            responseCache.set(cacheKey, {
                response: aiResponse,
                timestamp: Date.now()
            });


            if (responseCache.size > 200) { 

                const keysToDelete = Array.from(responseCache.keys()).slice(0, 50);
                keysToDelete.forEach(key => responseCache.delete(key));
            }

            return aiResponse;
        } else {
            throw new Error('Không nhận được phản hồi hợp lệ từ Gemini');
        }

    } catch (error) {
        console.error('[AI] Gemini API Error:', error.message);




        if (error.response?.status === 429) {
            const rateLimitResponses = [
                "Ủa, hình như mình nói nhiều quá rồi! Chờ tí rồi chat tiếp nhé! 😅",
                "API mình bị giới hạn rồi, nghỉ 1 chút rồi quay lại nha! 🛑",
                "Quota hết rồi bạn ơi! Chờ reset lại nhé! ⏰",
                "Mình đang bị limit, thử lại sau vài phút nha! 🔄"
            ];
            return rateLimitResponses[Math.floor(Math.random() * rateLimitResponses.length)];
        }


        if (error.response?.status >= 400) {
            console.error('[AI] Response status:', error.response.status);

            const errorResponses = [
                "Có lỗi từ server rồi! Thử lại sau nhé! 🔧",
                "Hệ thống đang có vấn đề, chờ tí nha! ⚠️",
                "Lỗi kỹ thuật gì đó, bạn thử lại xem! 🛠️"
            ];
            return errorResponses[Math.floor(Math.random() * errorResponses.length)];
        }

        const fallbackResponses = [
            "Ối, mình đang lag tí, thử hỏi lại nhé! 😅",
            "Mạng lag quá, bạn thử lại xem! ⚡",
            "Hình như mình đang bận quá, chờ chút nhé! 🤖",
            "Máy mình đang nghẽn, chờ tí nha! 🔄"
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


        if (global.data.userBanned && global.data.userBanned.has(userID)) {
            return; 
        }

        // Kiểm tra AI có được bật không
        if (!isBotEnabled(event.threadID)) {
            
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


            if (event.body && typeof event.body === 'string') {
                const message = event.body.toLowerCase();

                const addKeywords = ["add lại", "thêm lại", "mời lại", "gọi lại", "kéo lại", "kick nhầm", "đá nhầm", "ui tôi kick nhầm", "ui mình kick nhầm", "ôi kick nhầm", "ôi đá nhầm", "đưa về", "cho vào lại"];


                const kickKeywords = ["kick", "đá", "ban", "xóa", "loại", "đuổi", "hãy đá", "đá ra", "đuổi ra", "loại bỏ", "kick ra", "cho ra ngoài", "đuổi khỏi"];

                if (addKeywords.some(keyword => message.includes(keyword))) {
                    try {

                        if (global.kickTracker && global.kickTracker.getRecentKick) {
                            const recentKick = global.kickTracker.getRecentKick(threadID);

                            if (recentKick) {

                                global.isReAddingUser = true;
                                global.reAddingThreadID = threadID;




                                api.addUserToGroup(recentKick.userID, threadID, (err) => {

                                    global.isReAddingUser = false;
                                    global.reAddingThreadID = null;

                                    if (!err) {
                                        const addSuccessMessages = [
                                            `✅ Đã thêm lại ${recentKick.userName} vào nhóm!`,
                                            `🎉 Welcome back ${recentKick.userName}!`,
                                            `👋 ${recentKick.userName} đã được mời lại vào nhóm!`,
                                            `✨ Đã đưa ${recentKick.userName} trở lại nhóm!`,
                                            `🔄 ${recentKick.userName} đã được add lại thành công!`
                                        ];

                                        const successMsg = addSuccessMessages[Math.floor(Math.random() * successMessages.length)];
                                        api.sendMessage(successMsg, threadID, event.messageID);


                                        const key = `${threadID}_recent_kick`;
                                        if (global.kickTracker.recentKicks.has(key)) {
                                            global.kickTracker.recentKicks.delete(key);
                                        }
                                    } else {

                                        const addErrorMessages = [
                                            `❌ Không thể thêm lại ${recentKick.userName}. Có thể họ đã chặn bot hoặc có lỗi khác.`,
                                            `⚠️ Lỗi khi add lại ${recentKick.userName}! Kiểm tra lại quyền admin của bot.`,
                                            `🚫 Không thể undo! ${recentKick.userName} có thể đã chặn bot hoặc có vấn đề khác.`,
                                            `❎ Thất bại! Không thể mời ${recentKick.userName} vào lại nhóm.`
                                        ];

                                        const errorMsg = addErrorMessages[Math.floor(Math.random() * addErrorMessages.length)];
                                        api.sendMessage(errorMsg, threadID, event.messageID);
                                    }
                                });
                                return; 
                            } else {
                                const noKickMessages = [
                                    "🤔 Không có ai bị kick gần đây trong nhóm này để undo!",
                                    "❓ Mình không thấy có thông tin kick nào gần đây!",
                                    "🔍 Không tìm thấy lịch sử kick gần đây để hoàn tác!",
                                    "💭 Hình như không có ai bị kick trong 5 phút qua!"
                                ];

                                const noKickMsg = noKickMessages[Math.floor(Math.random() * noKickMessages.length)];
                                api.sendMessage(noKickMsg, threadID, event.messageID);
                                return;
                            }
                        } else {
                            api.sendMessage("❌ Hệ thống tracking kick chưa sẵn sàng!", threadID, event.messageID);
                            return;
                        }
                    } catch (error) {
                        await sendBotMessage(api, "❌ Có lỗi khi thực hiện undo kick! Thử lại sau nhé! 🔧", threadID, event.messageID);
                        return;
                    }
                }


                const changeNameKeywords = [
                    'đổi tên', 'doi ten', 'change name', 'rename', 'set name', 'đặt tên', 'dat ten',
                    'thay tên', 'thay ten', 'gọi tôi', 'goi toi', 'call me', 'tôi là', 'toi la',
                    'mình là', 'minh la', 'i am', 'thay đổi tên', 'thay doi ten', 'đặt nickname'
                ];

                if (changeNameKeywords.some(keyword => message.includes(keyword))) {
                    try {

                        function isValidName(name) {
                            if (!name || typeof name !== 'string') return { valid: false, reason: 'empty' };

                            const trimmedName = name.trim();


                            if (trimmedName.length === 0) return { valid: false, reason: 'empty' };
                            if (trimmedName.length > 50) return { valid: false, reason: 'too_long' };
                            if (trimmedName.length < 1) return { valid: false, reason: 'too_short' };


                            const dangerousChars = /[<>{}[\]\\\/\|\`\~\^\*]/;
                            if (dangerousChars.test(trimmedName)) return { valid: false, reason: 'dangerous_chars' };


                            const repeatedChar = /(.)\1{10,}/;
if (repeatedChar.test(trimmedName)) return { valid: false, reason: 'spam_chars' };


                            const onlySpecialChars = /^[^\w\su00C0-\u024F\u1E00-\u1EFF]+$/;
                            if (onlySpecialChars.test(trimmedName)) return { valid: false, reason: 'only_special' };


                            const bannedWords = ['bot', 'admin', 'administrator', 'moderator', 'system'];
                            const lowerName = trimmedName.toLowerCase();
                            if (bannedWords.some(word => lowerName.includes(word))) {
                                return { valid: false, reason: 'banned_word' };
                            }

                            return { valid: true, reason: 'ok' };
                        }


                        let newName = "";
                        const originalMessage = event.body.trim();


                        const advancedPatterns = [

                            /(?:mình|tôi|toi|em|anh|chị|chi)?\s*(?:không|ko|chả|chẳng)?\s*(?:thích|muốn|cần)?\s*(?:tên|nickname|biệt danh)?\s*(?:này|hiện tại|old)?\s*(?:nữa|rồi)?\s*(?:hãy|please|pls)?\s*(?:đổi|thay|change)\s*(?:tên|nickname|biệt danh)?\s*(?:thành|to|into|as|là|la|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:hãy|please|pls)?\s*(?:đổi|thay|change)\s+(?:tên|nickname|biệt danh)\s+(?:cho|for|of)\s+(?:mình|tôi|toi|em|anh|chị|chi|me|i)\s+(?:thành|to|into|as|là|la|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:đổi tên|doi ten|change name|rename|set name|đặt tên|dat ten)(?:\s+(?:cho|for|of))?\s+(?:tôi|toi|mình|minh|em|anh|chị|chi|me|i)\s+(?:thành|thanh|to|into|as|là|la|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:thay|thay đổi|change)\s+(?:tên|ten|name)\s+(?:của|cua|of)\s+(?:tôi|toi|mình|minh|em|anh|chị|chi|me|i)\s+(?:là|la|thành|thanh|to|into|as|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:đặt|dat|set)\s+(?:tên|ten|name)\s+(?:cho|for|of)\s+(?:tôi|toi|mình|minh|em|anh|chị|chi|me|i)\s+(?:là|la|thành|thanh|to|into|as|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:gọi|goi|call)\s+(?:tôi|toi|mình|minh|em|anh|chị|chi|me|i)\s+(?:là|la|as)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:tôi|toi|mình|minh|em|anh|chị|chi|i)\s+(?:muốn|muon|want|cần|can)\s+(?:đổi|doi|change)\s+(?:tên|ten|name)\s+(?:thành|thanh|to|into|as|là|la|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:từ\s+giờ|tu\s+gio|from\s+now)\s+(?:gọi|goi|call)\s+(?:mình|tôi|toi|em|anh|chị|chi|me|i)\s+(?:là|la|as)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:đổi tên|doi ten|change name|rename|set name|đặt tên|dat ten)(?:\s+(?:cho|of|for))?\s+(?:thành|thanh|to|into|as|là|la|sang)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:tên mới|ten moi|new name|nickname)(?:\s+(?:là|la|is))?\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /(?:tôi|toi|mình|minh|em|anh|chị|chi|i)\s+(?:là|la|am|is)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i,


                            /["'"]([^"'"]+)["'"]/,


                            /(?:đổi tên|doi ten|change name|rename|set name|đặt tên|dat ten)\s+(.+?)(?:\s+(?:đi|nha|nhé|please|pls|ạ|a|thôi|thoi|được|duoc|không|khong))*\s*$/i
                        ];


                        for (const pattern of advancedPatterns) {
                            const match = originalMessage.match(pattern);
                            if (match && match[1]) {
                                let candidateName = match[1].trim();


                                candidateName = candidateName
                                    .replace(/^(cho|thành|thanh|là|la|into|to|as|sang|bằng|bang|with)\s+/i, '')
                                    .replace(/\s+(nhé|nha|đi|please|pls|nào|nao|được|duoc|không|khong|ạ|a|ah|ơi|oi|thôi|thoi|hen|hén|nhá|nhỉ|nè|chứ|ha|hả|vậy|vậy)$/gi, '')
                                    .replace(/\s+(thôi|thoi|ạ|a|ah|ơi|oi|không|khong|ko|nhỉ|nè)$/gi, '')
                                    .trim();


                                candidateName = candidateName
                                    .replace(/^(hãy|hay|please|pls|giúp|giup|help|xin|làm ơn|lam on)\s+/i, '')
                                    .replace(/^(từ giờ|tu gio|from now|bây giờ|bay gio)\s+/i, '')
                                    .trim();

                                if (candidateName.length > 0) {
                                    newName = candidateName;
                                    break;
                                }
                            }
                        }


                        if (!newName) {
                            for (const keyword of changeNameKeywords) {
                                if (message.includes(keyword)) {
                                    const parts = originalMessage.split(new RegExp(keyword, 'i'));
                                    if (parts.length > 1) {
                                        let fallbackName = parts[1]
                                            .trim()
                                            .replace(/^(cho|thành|thanh|là|la|into|to|as|sang)\s+/i, '')
                                            .replace(/\s+(nhé|nha|đi|please|pls)$/i, '');

                                        if (fallbackName.length > 0) {
                                            newName = fallbackName;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if (newName) {

                            const validation = isValidName(newName);

                            if (!validation.valid) {
                                const validationErrors = {
                                    'empty': "❌ Tên không được để trống!",
                                    'too_long': "❌ Tên quá dài! Tối đa 50 ký tự thôi nhé!",
                                    'too_short': "❌ Tên quá ngắn!",
                                    'dangerous_chars': "❌ Tên chứa ký tự không an toàn! Tránh sử dụng: < > { } [ ] \\ / | ` ~ ^ *",
                                    'spam_chars': "❌ Không được lặp ký tự quá nhiều lần!",
                                    'only_special': "❌ Tên không thể chỉ toàn ký tự đặc biệt!",
                                    'banned_word': "❌ Tên chứa từ không được phép sử dụng!"
                                };

                                const errorMsg = validationErrors[validation.reason] || "❌ Tên không hợp lệ!";
                                api.sendMessage(errorMsg, threadID, event.messageID);
                                return;
                            }


                            const finalName = newName.trim();
                            const targetUserID = userID;


                            if (targetUserID === api.getCurrentUserID()) {
                                return api.sendMessage("❌ Không thể đổi tên của chính mình!", threadID, event.messageID);
                            }




                            api.changeNickname(finalName, threadID, targetUserID, (err) => {
                                if (!err) {
                                    const successMessages = [
                                        `✅ Đã đổi tên thành công! Giờ bạn sẽ được gọi là "${finalName}" 😊`,
                                        `🎉 Hoàn thành! Tên mới của bạn là "${finalName}" rồi nhé!`,
                                        `✨ Xong rồi! Từ giờ gọi "${finalName}" nhé!`,
                                        `🔄 Đã update tên thành "${finalName}" thành công!`,
                                        `💫 Chúc mừng! Bạn đã có tên mới "${finalName}"!`
                                    ];

                                    const successMsg = successMessages[Math.floor(Math.random() * successMessages.length)];
                                    api.sendMessage(successMsg, threadID, event.messageID);
                                } else {

                                    const errorMessages = [
                                        "❌ Không đổi được tên! Có thể nhóm chưa tắt liên kết mời hoặc bot chưa có quyền admin 😅",
                                        "⚠️ Không thể đổi tên! Kiểm tra lại quyền admin của bot nhé!",
                                        "🚫 Không đổi được! Có thể do cài đặt nhóm hoặc quyền hạn không đủ!",
                                        "❎ Không đổi được! Đảm bảo bot có quyền admin và nhóm đã tắt liên kết mời!"
                                    ];

                                    const errorMsg = errorMessages[Math.floor(Math.random() * errorMessages.length)];
                                    api.sendMessage(errorMsg, threadID, event.messageID);
                                }
                            });
                            return; 
                        } else {
                            const helpMessages = [
                                `🤔 Bạn muốn đổi tên gì? Thử nói:\n• "đổi tên cho tôi thành [tên mới] đi"\n• "thay tên của tôi là [tên mới] nhé"\n• "gọi tôi là [tên mới] nha"`,
                                `💭 Chưa thấy tên mới! Ví dụ:\n• "mình không thích tên này nữa, đổi thành em bé mộng mơ đi"\n• "hãy đổi tên cho tôi thành SuperUser nhé"\n• "từ giờ gọi tôi là Boss nha"`,
                                `❓ Tên mới là gì vậy? Thử:\n• "tôi muốn đổi tên thành Pro Gamer đi"\n• "đặt tên cho tôi là Admin thôi"\n• "tôi là [tên mới] nè"`,
                                `🎯 Cần tên mới để đổi! Một số cách tự nhiên:\n• "mình không thích tên này, đổi thành [tên] đi"\n• "hãy thay tên của tôi là [tên] nhé"\n• "từ giờ gọi tôi là [tên] nha"\n• "tôi là [tên] thôi"`
                            ];

                            const helpMsg = helpMessages[Math.floor(Math.random() * helpMessages.length)];
                            api.sendMessage(helpMsg, threadID, event.messageID);
                            return;
                        }
                    } catch (error) {
                        await sendBotMessage(api, "❌ Có lỗi khi xử lý đổi tên! Thử lại sau nhé! 🔧", threadID, event.messageID);
                        return;
                    }
                }
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



        let cleanMessage = userMessage;

        if (!cleanMessage || cleanMessage.trim().length === 0) {
            const greetings = [
                "Chào bạn! Có gì tôi có thể giúp không? 😊",
                "Hì, bạn muốn nói chuyện gì thế? 🤗", 
                "Ê, có việc gì không? Cứ nói thoải mái nhé! ✨",
                "Dạ, em nghe bạn! 💭",
                "Chào bạn! Hôm nay thế nào? 🌟",
                "Có gì thú vị muốn chia sẻ không? 😄"
            ];
            const greeting = greetings[Math.floor(Math.random() * greetings.length)];
            await sendBotMessage(api, greeting, threadID, event.messageID);
            return;
        }



        const addKeywords = ["add lại", "thêm lại", "mời lại", "gọi lại", "kéo lại", "kick nhầm", "đá nhầm", "ui tôi kick nhầm", "ui mình kick nhầm", "ôi kick nhầm", "ôi đá nhầm", "đưa về", "cho vào lại"];


        const kickKeywords = ["kick", "đá", "ban", "xóa", "loại", "đuổi", "hãy đá", "đá ra", "đuổi ra", "loại bỏ", "kick ra", "cho ra ngoài", "đuổi khỏi"];
        if (cleanMessage.toLowerCase().includes('kick') && event.mentions) {
            const mentionIDs = Object.keys(event.mentions);
            if (mentionIDs.length > 0) {
                const targetUserID = mentionIDs[0];
                const targetUserName = event.mentions[targetUserID];


                const threadInfo = await api.getThreadInfo(threadID);
                const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
                const adminBot = global.config?.ADMINBOT || [];

                if (adminIDs.includes(userID) || adminBot.includes(userID)) {

                    if (targetUserID === api.getCurrentUserID()) {
                        await sendBotMessage(api, "❌ Mình không thể kick chính mình!", threadID, event.messageID);
                        return;
                    }


                    api.removeUserFromGroup(targetUserID, threadID, async (err) => {
                        if (!err) {
                            const kickMessages = [
                                `[${targetUserName}] đã bị kick khỏi nhóm! 🚪`,
                                `Bay màu! [${targetUserName}] đã ra khỏi nhóm. 👋`,
                                `Tạm biệt [${targetUserName}]! Chúc bạn may mắn lần sau. 🍀`,
                                `Đã kick [${targetUserName}] thành công! ✅`
                            ];

                            const kickMsg = kickMessages[Math.floor(Math.random() * kickMessages.length)];
                            await sendBotMessage(api, kickMsg, threadID, event.messageID);


                            if (global.kickTracker && global.kickTracker.trackKick) {
                                global.kickTracker.trackKick(threadID, targetUserID, targetUserName, userID);
                            }
                        } else {

                            const errorMessages = [
                                "❌ Không thể kick người này! Có thể bot chưa có quyền admin hoặc người này có quyền cao hơn.",
                                "⚠️ Lỗi khi kick! Kiểm tra lại quyền admin của bot nhé!",
                                "🚫 Không kick được! Có thể do cài đặt nhóm hoặc quyền hạn không đủ!",
                                "❎ Kick thất bại! Đảm bảo bot có quyền admin và người này không phải là admin!"
                            ];

                            const errorMsg = errorMessages[Math.floor(Math.random() * errorMessages.length)];
                            await sendBotMessage(api, errorMsg, threadID, event.messageID);
                        }
                    });
                    return; 
                } else {
                    await sendBotMessage(api, "❌ Bạn không có quyền kick người khác!", threadID, event.messageID);
                    return;
                }
            }
        }


        const undoKeywords = [
            'undo', 'hoàn tác', 'hoan tac', 'add lại', 'add lai', 'thêm lại', 'them lai',
            'mời lại', 'moi lai', 'invite lại', 'invite lai', 'gọi lại', 'goi lai',
            'cho vào lại', 'cho vao lai', 'đưa vào lại', 'dua vao lai'
        ];

        if (undoKeywords.some(keyword => cleanMessage.toLowerCase().includes(keyword))) {
            try {

                if (global.kickTracker && global.kickTracker.getRecentKick) {
                    const recentKick = global.kickTracker.getRecentKick(threadID);

                    if (recentKick) {

                        global.isReAddingUser = true;
                        global.reAddingThreadID = threadID;




                        api.addUserToGroup(recentKick.userID, threadID, (err) => {

                            global.isReAddingUser = false;
                            global.reAddingThreadID = null;

                            if (!err) {

                                const key = `${threadID}_recent_kick`;
                                if (global.kickTracker.recentKicks.has(key)) {
                                    global.kickTracker.recentKicks.delete(key);
                                }

                                const successMessages = [
                                    `✅ Đã mời ${recentKick.userName} vào lại nhóm thành công! 🎉`,
                                    `🎊 Hoàn tác thành công! ${recentKick.userName} đã được thêm lại vào nhóm!`,
                                    `✨ Xong rồi! ${recentKick.userName} đã quay lại nhóm!`,
                                    `🔄 Undo thành công! Chào mừng ${recentKick.userName} quay lại!`
                                ];

                                const successMsg = successMessages[Math.floor(Math.random() * successMessages.length)];
                                sendBotMessage(api, successMsg, threadID, event.messageID);
                            } else {

                                const errorMessages = [
                                    `❌ Không thể mời ${recentKick.userName} vào lại! Có thể họ đã chặn bot hoặc rời Facebook.`,
                                    `⚠️ Lỗi khi thêm ${recentKick.userName}! Kiểm tra quyền admin của bot.`,
                                    `🚫 Không thể undo! ${recentKick.userName} có thể đã chặn bot hoặc có vấn đề khác.`,
                                    `❎ Thất bại! Không thể mời ${recentKick.userName} vào lại nhóm.`
                                ];

                                const errorMsg = errorMessages[Math.floor(Math.random() * errorMessages.length)];
                                sendBotMessage(api, errorMsg, threadID, event.messageID);
                            }
                        });
                        return; 
                    } else {
                        const noKickMessages = [
                            "🤔 Không có ai bị kick gần đây trong nhóm này để undo!",
                            "❓ Mình không thấy có thông tin kick nào gần đây!",
                            "🔍 Không tìm thấy lịch sử kick gần đây để hoàn tác!",
                            "💭 Hình như không có ai bị kick trong 5 phút qua!"
                        ];

                        const noKickMsg = noKickMessages[Math.floor(Math.random() * noKickMessages.length)];
                        await sendBotMessage(api, noKickMsg, threadID, event.messageID);
                        return;
                    }
                } else {
                    await sendBotMessage(api, "❌ Hệ thống tracking kick chưa sẵn sàng!", threadID, event.messageID);
                    return;
                }
            } catch (error) {
                await sendBotMessage(api, "❌ Có lỗi khi thực hiện undo kick! Thử lại sau nhé! 🔧", threadID, event.messageID);
                return;
            }
        }


        const musicKeywords = [
            'hát', 'nhạc', 'bật nhạc'
        ];

        const hasMusicKeyword = musicKeywords.some(keyword => 
            cleanMessage.toLowerCase().includes(keyword.toLowerCase())
        );

        if (hasMusicKeyword) {
            try {

                let searchQuery = cleanMessage
                    .toLowerCase()
                    .replace(/hát|nhạc|bật nhạc/gi, '')
                    .replace(/cho tôi|cho toi|cho mình|cho minh|giúp tôi|giup toi|tìm kiếm|tim kiem|search|find/gi, '')
                    .trim();


                if (!searchQuery || searchQuery.length < 2) {
                    searchQuery = cleanMessage;
                }




                await downloadYouTubeAudio(searchQuery, api, threadID, event.messageID, userID);
                return;

            } catch (error) {


                const musicErrorResponses = [
                    "🎵 Ối, có lỗi khi tìm nhạc rồi! Thử lại nhé!",
                    "🎶 Hình như hệ thống nhạc đang bận, chờ tí nha!",
                    "🔧 Có vấn đề kỹ thuật với YouTube, thử lại sau!",
                    "❌ Lỗi tìm kiếm nhạc, bạn thử lại xem!"
                ];

                const errorMsg = musicErrorResponses[Math.floor(Math.random() * musicErrorResponses.length)];
                await sendBotMessage(api, errorMsg, threadID, event.messageID);
                return;
            }
        }



        // --- Hook: natural-language image creation ---
        try {
            const imgArgs = tryParseImageRequest(cleanMessage);
            if (imgArgs) {
                const imageCmd = global.client && global.client.commands ? global.client.commands.get('image') : null;
                if (imageCmd && typeof imageCmd.run === 'function') {
                    await imageCmd.run({ api, event, args: imgArgs });
                } else {
                    await sendBotMessage(api, "❌ Lệnh tạo ảnh chưa được cài đặt.", threadID, event.messageID);
                }
                return;
            }
        } catch (e) {
            try { console.error('Image hook error:', e && e.message ? e.message : e); } catch {}
        }
const detectedCommand = detectCommandInMessage(cleanMessage);

        if (detectedCommand) {

            const prefix = global.config.PREFIX || '/';
            const lowerMessage = cleanMessage.toLowerCase().trim();


            if (lowerMessage.startsWith(prefix)) {
                return; 
            }


            const commandResponse = await generateCommandResponse(detectedCommand, cleanMessage, null, userID, threadID, api);
            await sendBotMessage(api, commandResponse, threadID, event.messageID);
        } else {

            const aiResponse = await callGeminiAPI(cleanMessage, userID, threadID, api);
            await sendBotMessage(api, aiResponse, threadID, event.messageID);
        }

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


        if (global.data.userBanned && global.data.userBanned.has(userID)) {
            const { reason, dateAdded } = global.data.userBanned.get(userID) || {};
            return api.sendMessage(
                `❌ Bạn đã bị cấm sử dụng bot!\n📝 Lý do: ${reason}\n⏰ Thời gian: ${dateAdded}`,
                threadID, event.messageID
            );
        }


        const safeArgs = Array.isArray(args) ? args : [];
        const command = safeArgs[0]?.toLowerCase();

        if (command === 'on' || command === 'off') {
            const newState = command === 'on';
            aiConfig.enabled[threadID] = newState;

            if (saveConfig(aiConfig)) {
                const statusText = newState ? 'BẬT' : 'TẮT';
                const emoji = newState ? '✅' : '❌';  
                const message = `${emoji} AI đã được ${statusText} trong nhóm này!\n\n` +
                    `${newState ? 
                '🤖 Bây giờ bạn có thể:\n• Gọi tên bot trong tin nhắn\n• Reply tin nhắn của bot\n• Sử dụng lệnh .ai' : 
                `😴 Bot sẽ không tự động trả lời nữa.\nDùng "${prefix}ai on" để bật lại.`}`;
                return api.sendMessage(message, threadID, event.messageID);
            } else {
                return api.sendMessage("❌ Không thể lưu cài đặt. Vui lòng thử lại!", threadID, event.messageID);
            }
        }

        if (command === 'help' || command === 'h') {
            const isEnabled = isBotEnabled(threadID);
            const statusText = isEnabled ? '✅ ĐANG BẬT' : '❌ ĐANG TẮT';
            const botNamesList = Array.isArray(BOT_NAMES) ? BOT_NAMES.join(', ') : 'ai, bot';

            const helpMessage = `🤖 HƯỚNG DẪN SỬ DỤNG ATOMIC AI

📊 Trạng thái: ${statusText}

⚠️ Lưu ý: AI mặc định TẮT trong tất cả nhóm
   Sử dụng "${prefix}ai on" để bật AI cho nhóm này

🎯 Cách sử dụng (khi đã bật):
    • Gọi tên: "AI ơi, hôm nay thời tiết thế nào?"
    • Reply: Reply tin nhắn của bot
    • Lệnh: ${prefix}ai [câu hỏi của bạn]
    • \`${prefix}ai on\` - Bật bot cho nhóm này
    • \`${prefix}ai off\` - Tắt bot cho nhóm này

🏷️ Tên gọi: ${botNamesList}`;

            return api.sendMessage(helpMessage, threadID, event.messageID);
        }

        if (!isBotEnabled(threadID)) {
            const offMessages = [
             `😴 Mình đang ngủ nè! Gõ ${prefix}ai on để đánh thức mình nhé!`,
              `💤 AI đang tắt rồi bạn ơi! Dùng ${prefix}ai on để bật lại nha!`,
              `🔕 Chế độ im lặng đang bật. Gõ ${prefix}ai on để chat với mình!`,
              `😪 Mình đang offline, gõ ${prefix}ai on để online lại nhé!`
            ];
            const message = offMessages[Math.floor(Math.random() * offMessages.length)];
            return api.sendMessage(message, threadID, event.messageID);
        }


        const userMessage = safeArgs.length > 0 ? safeArgs.join(' ') : '';

        if (!userMessage || userMessage.trim().length === 0) {
            const helpMessages = [
`❓ Bạn muốn hỏi gì thế?

    Ví dụ: \`${prefix}ai Hôm nay trời đẹp không?\`
    Hoặc \`${prefix}ai help\` để xem hướng dẫn nha! 😊`,

  `🤔 Có gì muốn hỏi không? Cứ nói thoải mái!

    Ví dụ: \`${prefix}ai Giải thích cho mình về AI\`
   Hoặc \`${prefix}ai hát gió cuốn em đi\` để tải nhạc!`,

  `💭 Bạn muốn chat gì với mình?

   Thử: \`${prefix}ai Kể joke gì đó đi!\`
   Hoặc \`${prefix}ai help\` để xem thêm!`
            ];
            const message = helpMessages[Math.floor(Math.random() * helpMessages.length)];
            return api.sendMessage(message, threadID, event.messageID);
        }






        const detectedCommand = detectCommandInMessage(userMessage);

        if (detectedCommand) {

            const prefix = global.config.PREFIX || '/';
            const lowerMessage = userMessage.toLowerCase().trim();


            if (lowerMessage.startsWith(prefix)) {
                return; 
            }


            const commandResponse = await generateCommandResponse(detectedCommand, userMessage, null, userID, threadID, api);
            await sendBotMessage(api, commandResponse, threadID, event.messageID);
        } else {

            const aiResponse = await callGeminiAPI(userMessage, userID, threadID, api);
            await sendBotMessage(api, aiResponse, threadID, event.messageID);
        }

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