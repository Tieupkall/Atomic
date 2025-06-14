module.exports.config = {
    name: 'resend',
    version: '2.1.0',
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
        
        // Khởi tạo global variables
        if (!global.logMessage) global.logMessage = new Map();
        if (!global.data.botID) global.data.botID = api.getCurrentUserID();
        
        // Lấy cài đặt nhóm
        const threadData = global.data.threadData.get(threadID) || {};
        const isResendEnabled = threadData.resend === true;
        
        // Bỏ qua nếu là bot hoặc resend chưa được bật
        if (senderID === global.data.botID) return;
        
        // Lưu tin nhắn thường
        if (type === 'message' || type === 'message_reply') {
            global.logMessage.set(messageID, {
                msgBody: body || '',
                attachment: attachments || [],
                senderID: senderID,
                threadID: threadID,
                timestamp: Date.now()
            });
            
            // Tự động xóa tin nhắn cũ sau 24h để tiết kiệm bộ nhớ
            setTimeout(() => {
                if (global.logMessage.has(messageID)) {
                    global.logMessage.delete(messageID);
                }
            }, 24 * 60 * 60 * 1000);
        }
        
        // Xử lý tin nhắn bị gỡ
        if (type === 'message_unsend' && isResendEnabled) {
            const loggedMessage = global.logMessage.get(messageID);
            
            if (!loggedMessage) {
                return api.sendMessage(
                    '⚠️ Không thể khôi phục tin nhắn này (có thể đã bị xóa khỏi bộ nhớ)',
                    threadID
                );
            }
            
            try {
                const userName = await Users.getNameUser(senderID);
                
                // Tin nhắn chỉ có text
                if (!loggedMessage.attachment || loggedMessage.attachment.length === 0) {
                    const message = loggedMessage.msgBody 
                        ? `🔄 ${userName} đã gỡ tin nhắn:\n"${loggedMessage.msgBody}"`
                        : `🔄 ${userName} đã gỡ một tin nhắn (không có nội dung)`;
                    
                    return api.sendMessage(message, threadID);
                }
                
                // Tin nhắn có file đính kèm
                await handleAttachments(loggedMessage, userName, senderID, threadID, api);
                
            } catch (error) {
                console.error('Error in resend handleEvent:', error);
                api.sendMessage('❌ Lỗi khi khôi phục tin nhắn', threadID);
            }
        }
        
    } catch (error) {
        console.error('Resend handleEvent error:', error);
    }
};

// Hàm xử lý file đính kèm
async function handleAttachments(loggedMessage, userName, senderID, threadID, api) {
    const axios = global.nodemodule.axios;
    const { writeFileSync, createReadStream, unlinkSync } = global.nodemodule['fs-extra'];
    
    try {
        let attachmentCount = 0;
        const messageData = {
            body: `🔄 ${userName} đã gỡ ${loggedMessage.attachment.length} file đính kèm${
                loggedMessage.msgBody ? `\n\nNội dung: "${loggedMessage.msgBody}"` : ''
            }`,
            attachment: []
        };
        
        const downloadPromises = loggedMessage.attachment.map(async (attachment, index) => {
            try {
                attachmentCount++;
                
                // Lấy extension từ URL
                let fileExtension = 'jpg'; // default
                if (attachment.url) {
                    const urlParts = attachment.url.split('.');
                    if (urlParts.length > 1) {
                        fileExtension = urlParts[urlParts.length - 1].split('?')[0];
                    }
                }
                
                const fileName = `${Date.now()}_${attachmentCount}.${fileExtension}`;
                const filePath = __dirname + `/cache/${fileName}`;
                
                // Download file
                const response = await axios({
                    method: 'GET',
                    url: attachment.url,
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                
                // Lưu file
                writeFileSync(filePath, Buffer.from(response.data));
                
                // Thêm vào attachment
                const fileStream = createReadStream(filePath);
                messageData.attachment.push(fileStream);
                
                // Tự động xóa file sau 30 giây
                setTimeout(() => {
                    try {
                        unlinkSync(filePath);
                    } catch (e) {
                        console.log('File already deleted:', fileName);
                    }
                }, 30000);
                
                return filePath;
                
            } catch (error) {
                console.error(`Error downloading attachment ${index}:`, error);
                return null;
            }
        });
        
        // Đợi tất cả file download xong
        await Promise.all(downloadPromises);
        
        // Gửi tin nhắn
        if (messageData.attachment.length > 0) {
            await api.sendMessage(messageData, threadID);
        } else {
            await api.sendMessage(
                `🔄 ${userName} đã gỡ tin nhắn có file đính kèm (không thể tải lại)${
                    loggedMessage.msgBody ? `\n\nNội dung: "${loggedMessage.msgBody}"` : ''
                }`,
                threadID
            );
        }
        
    } catch (error) {
        console.error('Error handling attachments:', error);
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
        // Lấy dữ liệu nhóm
        let threadData = (await Threads.getData(threadID)).data || {};
        
        // Xử lý argument
        const action = args[0]?.toLowerCase();
        
        if (action === 'on') {
            threadData.resend = true;
        } else if (action === 'off') {
            threadData.resend = false;
        } else {
            // Toggle nếu không có argument
            threadData.resend = !threadData.resend;
        }
        
        // Lưu cài đặt
        await Threads.setData(threadID, { data: threadData });
        global.data.threadData.set(threadID, threadData);
        
        // Thông báo với fallback text
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
        return api.sendMessage(
            `❌ Lỗi cài đặt resend:**\n${error.message}`,
            threadID,
            messageID
        );
    }
};