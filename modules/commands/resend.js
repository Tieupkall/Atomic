const fs = require('fs');
const path = require('path');

// Rate limiting để tránh spam
const requestLimiter = new Map();

function checkRateLimit(threadID, userId, maxRequests = 5, timeWindow = 60000) {
    const now = Date.now();
    const key = `${threadID}_${userId}`;
    
    if (!requestLimiter.has(key)) {
        requestLimiter.set(key, []);
    }
    
    const requests = requestLimiter.get(key);
    
    // Xóa các request cũ
    const validRequests = requests.filter(time => now - time < timeWindow);
    
    if (validRequests.length >= maxRequests) {
        return false; // Rate limited
    }
    
    validRequests.push(now);
    requestLimiter.set(key, validRequests);
    
    return true;
}

// Hàm tạo delay ngẫu nhiên để tránh detection
function randomDelay(min = 1000, max = 3000) {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

// Hàm tạo User-Agent ngẫu nhiên
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Hàm retry với backoff
async function downloadWithRetry(axios, url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await randomDelay(500, 2000); // Delay trước mỗi request
            
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 500 // Retry trên 5xx errors
            });

            if (response.data && response.data.byteLength > 0) {
                return response;
            }
        } catch (error) {
            console.warn(`Download attempt ${attempt} failed:`, error.message);
            if (attempt === maxRetries) throw error;
            
            // Exponential backoff
            await randomDelay(1000 * attempt, 3000 * attempt);
        }
    }
    throw new Error('Max retries exceeded');
}

// Tạo thư mục và file JSON lưu dữ liệu tin nhắn bị gỡ 
const dataPath = path.resolve(__dirname, '../../data');
const imagePath = path.join(dataPath, 'anh');
const logFile = path.join(dataPath, 'resend.json');

if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
if (!fs.existsSync(imagePath)) fs.mkdirSync(imagePath, { recursive: true });
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '{}');

module.exports.config = {
    name: 'resend',
    version: '2.1.1',
    hasPermssion: 1,
    credits: 'atomic',
    description: 'Xem lại tin nhắn bị gỡ trong nhóm',
    commandCategory: 'Quản Trị Viên',
    usages: 'resend [on/off]',
    cooldowns: 3,
    hide: false,
    dependencies: {
        'fs-extra': '',
        'axios': ''
    }
};

module.exports.handleEvent = async function ({ event, api, Users }) {
    try {
        const { messageID, senderID, threadID, body, type, attachments } = event;

        if (!global.logMessage) global.logMessage = new Map();
        if (!global.data.botID) global.data.botID = api.getCurrentUserID();

        const threadData = global.data.threadData.get(threadID) || {};
        const isResendEnabled = threadData.resend === true;

        if (senderID === global.data.botID) return;

        if (type === 'message' || type === 'message_reply') {
            global.logMessage.set(messageID, {
                msgBody: body || '',
                attachment: attachments || [],
                senderID: senderID,
                threadID: threadID,
                timestamp: Date.now()
            });

            // Tự động xóa sau 24h để tiết kiệm bộ nhớ
            setTimeout(() => {
                if (global.logMessage.has(messageID)) {
                    global.logMessage.delete(messageID);
                }
            }, 24 * 60 * 60 * 1000);
        }

        if (type === 'message_unsend' && isResendEnabled) {
            // Kiểm tra rate limit để tránh spam
            if (!checkRateLimit(threadID, senderID, 3, 30000)) {
                console.warn(`Rate limited for user ${senderID} in thread ${threadID}`);
                return;
            }
            
            const loggedMessage = global.logMessage.get(messageID);

            if (!loggedMessage) {
                return api.sendMessage('⚠️ Không thể khôi phục tin nhắn này (có thể đã bị xóa khỏi bộ nhớ)', threadID);
            }

            try {
                // Delay ngẫu nhiên trước khi xử lý để tránh detection
                await randomDelay(500, 1500);
                
                const userName = await Users.getNameUser(senderID);

                // Kiểm tra xem có attachment không
                const hasAttachments = loggedMessage.attachment && 
                                     Array.isArray(loggedMessage.attachment) && 
                                     loggedMessage.attachment.length > 0;

                if (!hasAttachments) {
                    const message = loggedMessage.msgBody 
                        ? `🔄 ${userName} đã gỡ tin nhắn:\n"${loggedMessage.msgBody}"`
                        : `🔄 ${userName} đã gỡ một tin nhắn (không có nội dung)`;

                    saveToJSON(messageID, loggedMessage, userName);
                    
                    // Delay trước khi gửi tin nhắn
                    await randomDelay(300, 800);
                    return api.sendMessage(message, threadID);
                }

                // Xử lý tin nhắn có đính kèm
                await handleAttachments(loggedMessage, userName, senderID, threadID, api, messageID);

            } catch (error) {
                console.error('Error in resend handleEvent:', error);
                await randomDelay(1000, 2000);
                api.sendMessage('❌ Lỗi khi khôi phục tin nhắn', threadID);
            }
        }

    } catch (error) {
        console.error('Resend handleEvent error:', error);
    }
};

function saveToJSON(id, data, userName) {
    try {
        let db = {};
        if (fs.existsSync(logFile)) {
            const fileContent = fs.readFileSync(logFile, 'utf8');
            if (fileContent.trim()) {
                db = JSON.parse(fileContent);
            }
        }
        
        db[id] = {
            user: userName,
            message: data.msgBody || '',
            timestamp: data.timestamp,
            threadID: data.threadID,
            hasAttachment: Array.isArray(data.attachment) && data.attachment.length > 0
        };
        
        fs.writeFileSync(logFile, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('❌ Không thể lưu JSON resend:', err);
    }
}

async function handleAttachments(loggedMessage, userName, senderID, threadID, api, messageID) {
    // Kiểm tra xem có axios và fs-extra không
    if (!global.nodemodule || !global.nodemodule.axios || !global.nodemodule['fs-extra']) {
        return api.sendMessage(`🔄 ${userName} đã gỡ tin nhắn có file đính kèm (không thể khôi phục do thiếu module)`, threadID);
    }

    const axios = global.nodemodule.axios;
    const { writeFileSync, createReadStream } = global.nodemodule['fs-extra'];

    try {
        const attachments = loggedMessage.attachment;
        
        if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
            return api.sendMessage(`🔄 ${userName} đã gỡ một tin nhắn đính kèm nhưng không thể khôi phục do không có dữ liệu.`, threadID);
        }

        // Delay trước khi bắt đầu xử lý để tránh spam
        await randomDelay(1000, 2500);

        const messageData = {
            body: `🔄 ${userName} đã gỡ ${attachments.length} file đính kèm${
                loggedMessage.msgBody ? `\n\nNội dung: "${loggedMessage.msgBody}"` : ''
            }`,
            attachment: []
        };

        let successCount = 0;
        
        // Xử lý từng attachment một cách tuần tự để tránh rate limit
        for (let index = 0; index < attachments.length; index++) {
            const attachment = attachments[index];
            
            try {
                if (!attachment || typeof attachment !== 'object' || !attachment.url) {
                    console.warn(`Attachment ${index} is invalid:`, attachment);
                    continue;
                }

                // Tạo tên file unique
                let fileExtension = 'jpg';
                try {
                    const urlParts = attachment.url.split('.');
                    if (urlParts.length > 1) {
                        const lastPart = urlParts[urlParts.length - 1];
                        const cleanExtension = lastPart.split('?')[0].split('#')[0];
                        if (cleanExtension && cleanExtension.length <= 5) {
                            fileExtension = cleanExtension;
                        }
                    }
                } catch (e) {
                    console.warn('Error parsing file extension:', e);
                }

                const fileName = `resend_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
                const savePath = path.join(imagePath, fileName);

                // Download file với retry và anti-detection
                const response = await downloadWithRetry(axios, attachment.url);

                if (!response.data || response.data.byteLength === 0) {
                    console.warn(`Empty response for attachment ${index}`);
                    continue;
                }

                writeFileSync(savePath, Buffer.from(response.data));
                
                // Kiểm tra file đã được tạo thành công
                if (fs.existsSync(savePath) && fs.statSync(savePath).size > 0) {
                    messageData.attachment.push(createReadStream(savePath));
                    successCount++;
                    
                    // Tự động xóa file sau 1 giờ để tiết kiệm dung lượng
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(savePath)) {
                                fs.unlinkSync(savePath);
                            }
                        } catch (e) {
                            console.warn('Error deleting temp file:', e);
                        }
                    }, 60 * 60 * 1000);
                } else {
                    console.warn(`Failed to save file ${savePath}`);
                }

                // Delay giữa các download để tránh rate limit
                if (index < attachments.length - 1) {
                    await randomDelay(800, 2000);
                }

            } catch (error) {
                console.error(`Error downloading attachment ${index}:`, error.message);
                continue;
            }
        }

        // Delay trước khi gửi tin nhắn
        await randomDelay(500, 1500);

        if (messageData.attachment.length > 0) {
            await api.sendMessage(messageData, threadID);
        } else {
            await api.sendMessage(`🔄 ${userName} đã gỡ tin nhắn có ${attachments.length} file đính kèm (không thể tải lại)${
                loggedMessage.msgBody ? `\n\nNội dung: "${loggedMessage.msgBody}"` : ''
            }`, threadID);
        }

        saveToJSON(messageID, loggedMessage, userName);

    } catch (error) {
        console.error('Error handling attachments:', error);
        // Delay trước khi gửi error message
        await randomDelay(1000, 2000);
        api.sendMessage(`❌ Lỗi khi tải file đính kèm: ${error.message}`, threadID);
    }
}

module.exports.languages = {
    vi: {
        on: 'BẬT',
        off: 'TẮT',
        successText: 'Cài đặt resend thành công!'
    },
    en: {
        on: 'ON',
        off: 'OFF',
        successText: 'Resend setting updated successfully!'
    }
};

module.exports.run = async function ({ api, event, Threads, getText, args }) {
    const { threadID, messageID, senderID } = event;

    try {
        let threadData = (await Threads.getData(threadID)).data || {};
        const action = args[0]?.toLowerCase();

        if (action === 'on') {
            threadData.resend = true;
        } else if (action === 'off') {
            threadData.resend = false;
        } else {
            threadData.resend = !threadData.resend;
        }

        await Threads.setData(threadID, { data: threadData });
        global.data.threadData.set(threadID, threadData);

        const getTextSafe = (key) => {
            try {
                const text = getText(key);
                return text && text !== 'undefined' ? text : null;
            } catch {
                return null;
            }
        };

        const statusText = threadData.resend 
            ? (getTextSafe('on') || 'BẬT') 
            : (getTextSafe('off') || 'TẮT');
        const successText = getTextSafe('successText') || 'Cài đặt thành công!';

        const message = `🔄 RESEND SYSTEM\n\n` +
                       `📍 Trạng thái: ${statusText}\n` +
                       `✅ Kết quả: ${successText}\n` +
                       `🔧 Chức năng: ${threadData.resend ? 'Đang bật - Bot sẽ hiển thị tin nhắn bị gỡ' : 'Đang tắt - Bot sẽ không hiển thị tin nhắn bị gỡ'}\n\n` +
                       `💡 Hướng dẫn:\n` +
                       `• \`resend on\` - Bật chức năng\n` +
                       `• \`resend off\` - Tắt chức năng\n` +
                       `• \`resend\` - Chuyển đổi trạng thái`;

        return api.sendMessage(message, threadID, messageID);

    } catch (error) {
        console.error('Resend run error:', error);
        return api.sendMessage(`❌ Lỗi cài đặt resend: ${error.message}`, threadID, messageID);
    }
};