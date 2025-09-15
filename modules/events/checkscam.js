
const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "checkscam",
    eventType: ["message", "message_reply", "message_unsend"],
    version: "2.0.0",
    credits: "Atomic",
    description: "Tự động kiểm tra scam khi có tin nhắn, reply bot hoặc thu hồi tin nhắn"
};

module.exports.run = async function({ api, event }) {
    const { threadID, messageID, senderID, body, messageReply, type } = event;
    
    // Bỏ qua nếu không có nội dung hoặc là event không mong muốn
    if (!body && type !== "message_unsend") return;
    
    const botID = api.getCurrentUserID();
    if (senderID === botID) return;

    // Bỏ qua các tin nhắn hệ thống
    if (event.isGroup === false && threadID === senderID) return;

    let isReplyToBot = false;
    let isUnsendMessage = false;
    
    // Kiểm tra loại event
    if (type === "message_unsend") {
        isUnsendMessage = true;
        // Removed checkscam console log
        return; // Có thể thêm logic xử lý thu hồi tin nhắn ở đây
    }
    
    if (messageReply && messageReply.senderID == botID) {
        isReplyToBot = true;
    }

    // Sử dụng đường dẫn đúng đến file scamData.json
    const scamDataPath = path.join(__dirname, '../../data/scamData.json');
    
    // Rate limiting - tránh spam check
    const cacheKey = `${senderID}_${threadID}`;
    if (!global.checkScamCache) {
        global.checkScamCache = new Map();
    }
    
    const lastCheck = global.checkScamCache.get(cacheKey);
    const now = Date.now();
    
    // Chỉ check mỗi 5 giây một lần cho mỗi user trong mỗi thread
    if (lastCheck && (now - lastCheck) < 5000) {
        return;
    }
    
    global.checkScamCache.set(cacheKey, now);

    // Đọc dữ liệu scam từ JSON file mới
    function readScamData() {
        try {
            if (fs.existsSync(scamDataPath)) {
                const data = fs.readFileSync(scamDataPath, 'utf8');
                const parsedData = JSON.parse(data);
                // Đảm bảo format đúng với cấu trúc mới
                return parsedData;
            }
        } catch (error) {
            console.error('Lỗi đọc file scamData.json:', error);
        }
        return { scammers: [] };
    }

    // Hàm validate số điện thoại Việt Nam
    function isValidVietnamesePhone(phone) {
        const cleanPhone = phone.replace(/[\s-]/g, '');
        const phoneRegex = /^(\+84|84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])\d{7}$/;
        return phoneRegex.test(cleanPhone);
    }

    // Hàm trích xuất Facebook ID từ link
    function extractFacebookId(url) {
        const normalizedUrl = url.trim().toLowerCase();

        const patterns = [
            /(?:facebook\.com|fb\.com|m\.facebook\.com)\/profile\.php\?id=(\d+)/i,
            /(?:facebook\.com|fb\.com|m\.facebook\.com)\/(\d+)(?:\/|$|\?)/i,
            /facebook\.com\/people\/[^\/]+\/(\d+)/i,
            /(?:facebook\.com|fb\.com)\/(?:pages|pg)\/[^\/]+\/(\d+)/i,
            /[?&]id=(\d+)/i,
        ];

        // Thử extract ID số từ URL
        for (const pattern of patterns) {
            const match = normalizedUrl.match(pattern);
            if (match && match[1] && /^\d+$/.test(match[1])) {
                return {
                    id: match[1],
                    type: 'id',
                    original: match[1],
                    method: 'url_parse'
                };
            }
        }

        // Thử extract username từ URL
        const usernamePattern = /(?:facebook\.com|fb\.com|m\.facebook\.com)\/([a-zA-Z0-9._-]+)(?:\/|$|\?)/i;
        const usernameMatch = normalizedUrl.match(usernamePattern);
        if (usernameMatch && usernameMatch[1]) {
            const username = usernameMatch[1];
            const excludedPaths = ['profile.php', 'people', 'pages', 'pg', 'groups', 'events', 'marketplace', 'watch', 'gaming', 'share'];
            if (!excludedPaths.includes(username)) {
                return {
                    username: username,
                    type: 'username',
                    original: username,
                    method: 'url_parse'
                };
            }
        }

        return null;
    }

    // Hàm extract thông tin từ tin nhắn
    function extractInfoFromMessage(message) {
        const extracted = {
            phones: [],
            facebookUrls: [],
            facebookIds: [],
            usernames: [],
            bankNumbers: []
        };

        // Extract phone numbers (Vietnamese format)
        const phoneRegex = /(\+84|84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])\d{7}/g;
        let phoneMatch;
        while ((phoneMatch = phoneRegex.exec(message)) !== null) {
            const cleanPhone = phoneMatch[0].replace(/[\s-]/g, '');
            if (!extracted.phones.includes(cleanPhone)) {
                extracted.phones.push(cleanPhone);
            }
        }

        // Extract Facebook URLs
        const fbUrlRegex = /(https?:\/\/)?(www\.)?(facebook\.com|fb\.com|m\.facebook\.com)\/[^\s]+/gi;
        let urlMatch;
        
        while ((urlMatch = fbUrlRegex.exec(message)) !== null) {
            const fullUrl = urlMatch[0];
            if (!extracted.facebookUrls.includes(fullUrl)) {
                extracted.facebookUrls.push(fullUrl);

                // Extract ID/username từ URL
                const fbInfo = extractFacebookId(fullUrl);
                if (fbInfo) {
                    if ((fbInfo.type === 'id') && fbInfo.id && !extracted.facebookIds.includes(fbInfo.id)) {
                        extracted.facebookIds.push(fbInfo.id);
                    }
                    if (fbInfo.username && !extracted.usernames.includes(fbInfo.username)) {
                        extracted.usernames.push(fbInfo.username);
                    }
                }
            }
        }

        // Extract standalone Facebook IDs (sequences of 8+ digits)
        const idRegex = /\b\d{8,}\b/g;
        let idMatch;
        while ((idMatch = idRegex.exec(message)) !== null) {
            const id = idMatch[0];
            if (id.length >= 10 && !extracted.facebookIds.includes(id)) {
                extracted.facebookIds.push(id);
            }
        }

        // Extract bank account numbers (8-20 digits)
        const bankRegex = /\b\d{8,20}\b/g;
        let bankMatch;
        while ((bankMatch = bankRegex.exec(message)) !== null) {
            const bankNum = bankMatch[0];
            if (bankNum.length >= 8 && bankNum.length <= 20 && !extracted.bankNumbers.includes(bankNum)) {
                extracted.bankNumbers.push(bankNum);
            }
        }

        return extracted;
    }

    // Hàm kiểm tra scam từ tin nhắn
    function checkScamInMessage(message) {
        const data = readScamData();
        const extracted = extractInfoFromMessage(message);

        const matches = [];
        const matchedTypes = new Set();

        // Kiểm tra với cấu trúc JSON mới
        if (data.scammers && Array.isArray(data.scammers)) {
            data.scammers.forEach(scammer => {
                let isMatch = false;
                let matchInfo = [];

                // Kiểm tra Facebook ID
                if (scammer.userId && extracted.facebookIds.includes(scammer.userId)) {
                    isMatch = true;
                    matchInfo.push(`Facebook ID: ${scammer.userId}`);
                    matchedTypes.add('facebook_id');
                }

                // Kiểm tra username
                if (scammer.username && extracted.usernames.some(u => u.toLowerCase() === scammer.username.toLowerCase())) {
                    isMatch = true;
                    matchInfo.push(`Username: ${scammer.username}`);
                    matchedTypes.add('username');
                }

                // Kiểm tra link Facebook
                if (scammer.link && extracted.facebookUrls.some(url => url.toLowerCase().includes(scammer.link.toLowerCase()))) {
                    isMatch = true;
                    matchInfo.push(`Link: ${scammer.link}`);
                    matchedTypes.add('link');
                }

                // Kiểm tra số điện thoại
                if (scammer.phone && extracted.phones.includes(scammer.phone)) {
                    isMatch = true;
                    matchInfo.push(`SĐT: ${scammer.phone}`);
                    matchedTypes.add('phone');
                }

                // Kiểm tra STK
                if (scammer.stk && extracted.bankNumbers.includes(scammer.stk)) {
                    isMatch = true;
                    matchInfo.push(`STK: ${scammer.stk}`);
                    matchedTypes.add('bank');
                }

                if (isMatch) {
                    matches.push({
                        ...scammer,
                        matchInfo: matchInfo.join(', ')
                    });
                }
            });
        }

        return { 
            matches, 
            extracted, 
            hasCheckableInfo: extracted.phones.length > 0 || 
                             extracted.facebookUrls.length > 0 || 
                             extracted.facebookIds.length > 0 || 
                             extracted.usernames.length > 0 || 
                             extracted.bankNumbers.length > 0 
        };
    }

    // Đọc dữ liệu scam
    const scamData = readScamData();
    if (!scamData.scammers || scamData.scammers.length === 0) return;

    // Kiểm tra scam trong tin nhắn
    const checkResult = checkScamInMessage(body);

    if (checkResult.matches.length > 0) {
        let warningMessage = isReplyToBot 
            ? `🚨 CẢNH BÁO SCAM - PHÁT HIỆN KHI REPLY BOT!\n`
            : `🚨 CẢNH BÁO SCAM - PHÁT HIỆN TRONG TIN NHẮN!\n`;
        warningMessage += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        warningMessage += `👤 Người gửi: ${senderID}\n`;
        
        // Hiển thị thông tin chi tiết về scammer
        checkResult.matches.forEach((scammer, i) => {
            warningMessage += `\n⚠️ Phát hiện ${i + 1}:\n`;
            warningMessage += `🔍 Khớp với: ${scammer.matchInfo}\n`;
            if (scammer.description) warningMessage += `📝 Mô tả: ${scammer.description}\n`;
            if (scammer.bankName) warningMessage += `🏦 Ngân hàng: ${scammer.bankName}\n`;
        });
        
        warningMessage += `\n⚠️ Hãy cẩn thận và xác minh thông tin trước khi giao dịch!`;

        // Gửi cảnh báo công khai trong nhóm và thu hồi sau 30 giây
        api.sendMessage(warningMessage, threadID, (err, info) => {
            if (err) return console.error("[CHECKSCAM] ❌ Gửi cảnh báo nhóm thất bại:", err);

            setTimeout(() => {
                api.unsendMessage(info.messageID, (unsendErr) => {
                    if (unsendErr) {
                        console.error("[CHECKSCAM] ❌ Lỗi khi thu hồi tin nhắn nhóm:", unsendErr);
                    } else {
                        console.log("[CHECKSCAM] ✅ Đã thu hồi tin nhắn cảnh báo nhóm.");
                    }
                });
            }, 30 * 1000);
        }, messageID);

        // Gửi cảnh báo riêng cho admin
        const adminIds = global.config.ADMINBOT || [];

        adminIds.forEach(adminId => {
            if (adminId !== senderID.toString()) {
                const alertType = isReplyToBot ? "REPLY BOT" : "MESSAGE";
                let adminWarningMessage = isReplyToBot 
                    ? `🚨 CẢNH BÁO SCAM - PHÁT HIỆN KHI REPLY BOT!\n`
                    : `🚨 CẢNH BÁO SCAM - PHÁT HIỆN TRONG TIN NHẮN!\n`;
                adminWarningMessage += `━━━━━━━━━━━━━━━━━━━━━━\n`;
                adminWarningMessage += `📍 Nhóm: ${threadID}\n`;
                adminWarningMessage += `👤 Người gửi: ${senderID}\n\n`;
                
                // Thêm thông tin chi tiết cho admin
                checkResult.matches.forEach((scammer, i) => {
                    adminWarningMessage += `⚠️ Phát hiện ${i + 1}:\n`;
                    adminWarningMessage += `🔍 Khớp với: ${scammer.matchInfo}\n`;
                    if (scammer.userId) adminWarningMessage += `🆔 User ID: ${scammer.userId}\n`;
                    if (scammer.username) adminWarningMessage += `👤 Username: ${scammer.username}\n`;
                    if (scammer.phone) adminWarningMessage += `📱 SĐT: ${scammer.phone}\n`;
                    if (scammer.stk) adminWarningMessage += `💳 STK: ${scammer.stk}\n`;
                    if (scammer.bankName) adminWarningMessage += `🏦 Ngân hàng: ${scammer.bankName}\n`;
                    if (scammer.link) adminWarningMessage += `🔗 Link: ${scammer.link}\n`;
                    if (scammer.description) adminWarningMessage += `📝 Mô tả: ${scammer.description}\n`;
                    if (scammer.dateAdded) adminWarningMessage += `📅 Ngày thêm: ${new Date(scammer.dateAdded).toLocaleDateString('vi-VN')}\n`;
                    adminWarningMessage += `━━━━━━━━━━━━━━━━━━━━━━\n`;
                });
                
                adminWarningMessage += `⚠️ Hãy cẩn thận và xác minh thông tin trước khi giao dịch!`;

                api.sendMessage(adminWarningMessage, adminId, (err, info) => {
                    if (err) return console.error(`[CHECKSCAM] ❌ Gửi cảnh báo tới admin ${adminId} thất bại:`, err);

                    setTimeout(() => {
                        api.unsendMessage(info.messageID, (unsendErr) => {
                            if (unsendErr) {
                                console.error(`[CHECKSCAM] ❌ Lỗi khi thu hồi tin nhắn của admin ${adminId}:`, unsendErr);
                            } else {
                                console.log(`[CHECKSCAM] ✅ Đã thu hồi tin nhắn cảnh báo gửi tới admin ${adminId}.`);
                            }
                        });
                    }, 30 * 1000);
                });
            }
        });

        // Log lại
        const messageType = isReplyToBot ? "reply bot" : "tin nhắn thường";
        console.log(`[CHECKSCAM EVENT] 🚨 Phát hiện scam từ user ${senderID} trong thread ${threadID} (${messageType})`);
        console.log(`[CHECKSCAM EVENT] Số lượng scammer phát hiện: ${checkResult.matches.length}`);
        checkResult.matches.forEach((scammer, index) => {
            console.log(`[CHECKSCAM EVENT] Scammer ${index + 1}: ${scammer.matchInfo}`);
        });
    }
};
