module.exports.config = {
    name: "antichange",
    version: "1.0.0",
    hasPermssion: 1,
    credits: "Atomic",
    description: "Chống thay đổi thông tin nhóm (tên, ảnh đại diện, emoji, theme)",
    commandCategory: "Quản Trị Viên",
    usages: "",
    cooldowns: 0,
    dependencies: {}
};

const fs = require('fs-extra');
const path = require('path');

// Lưu trữ thông tin nhóm gốc
let originalGroupInfo = {};

module.exports.run = async function({ api, event }) {
    const { threadID, logMessageType, logMessageData, author } = event;
    
    try {
        // Import module anti để kiểm tra trạng thái
        const antiModule = require('../commands/anti');
        
        // Kiểm tra xem module có được bật không
        if (!antiModule.isEnabled('antichange', threadID)) {
            return; // Module bị tắt, không xử lý
        }
        
        // Lấy thông tin admin/moderator của nhóm
        const threadInfo = await api.getThreadInfo(threadID);
        const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
        const isAdmin = adminIDs.includes(author);
        const isBotAdmin = adminIDs.includes(api.getCurrentUserID());
        
        // Nếu là admin thay đổi hoặc bot không có quyền admin thì không can thiệp
        if (isAdmin || !isBotAdmin) {
            // Cập nhật thông tin gốc nếu admin thay đổi
            if (isAdmin) {
                originalGroupInfo[threadID] = {
                    threadName: threadInfo.threadName,
                    imageSrc: threadInfo.imageSrc,
                    emoji: threadInfo.emoji,
                    color: threadInfo.color,
                    theme: threadInfo.theme,
                    lastUpdate: Date.now()
                };
            }
            return;
        }
        
        let shouldRevert = false;
        let changeType = "";
        let changeDetails = "";
        
        // Xử lý các loại thay đổi khác nhau
        switch (logMessageType) {
            case "log:thread-name":
                shouldRevert = true;
                changeType = "Tên nhóm";
                changeDetails = `"${logMessageData.name}"`;
                
                // Khôi phục tên nhóm cũ
                if (originalGroupInfo[threadID]?.threadName) {
                    await api.setTitle(originalGroupInfo[threadID].threadName, threadID);
                } else {
                    // Nếu không có thông tin gốc, lấy từ API
                    const currentInfo = await api.getThreadInfo(threadID);
                    await api.setTitle(currentInfo.threadName, threadID);
                }
                break;
                
            case "log:thread-image":
                shouldRevert = true;
                changeType = "Ảnh đại diện nhóm";
                changeDetails = "đã thay đổi";
                
                // Khôi phục ảnh nhóm cũ (khó thực hiện, chỉ thông báo)
                // Facebook API không hỗ trợ khôi phục ảnh cũ dễ dàng
                break;
                
            case "log:thread-color":
                shouldRevert = true;
                changeType = "Màu theme";
                changeDetails = `sang ${logMessageData.theme_color || 'mặc định'}`;
                
                // Khôi phục màu cũ
                if (originalGroupInfo[threadID]?.color) {
                    await api.changeThreadColor(originalGroupInfo[threadID].color, threadID);
                }
                break;
                
            case "log:thread-emoji":
                shouldRevert = true;
                changeType = "Emoji nhóm";
                changeDetails = `thành "${logMessageData.thread_emoji || 'mặc định'}"`;
                
                // Khôi phục emoji cũ
                if (originalGroupInfo[threadID]?.emoji) {
                    await api.changeThreadEmoji(originalGroupInfo[threadID].emoji, threadID);
                } else {
                    // Đặt về emoji mặc định
                    await api.changeThreadEmoji("👍", threadID);
                }
                break;
                
            default:
                // Các loại thay đổi khác
                if (logMessageType.includes("thread")) {
                    shouldRevert = true;
                    changeType = "Thông tin nhóm";
                    changeDetails = "đã thay đổi";
                }
                break;
        }
        
        // Gửi thông báo nếu có thay đổi bị chặn
        if (shouldRevert) {
            const userName = await getUserName(api, author);
            
            const warningMsg = `🛡️ **ANTI CHANGE GROUP INFO**\n\n` +
                             `⚠️ Phát hiện thay đổi thông tin nhóm không được phép!\n\n` +
                             `👤 **Người thực hiện:** ${userName}\n` +
                             `🎯 **Loại thay đổi:** ${changeType}\n` +
                             `📝 **Chi tiết:** ${changeDetails}\n` +
                             `🔄 **Trạng thái:** ${changeType === "Ảnh đại diện nhóm" ? "Đã thông báo (không thể tự động khôi phục ảnh)" : "Đã khôi phục"}\n\n` +
                             `💡 **Lưu ý:** Chỉ admin mới được thay đổi thông tin nhóm!`;
            
            api.sendMessage(warningMsg, threadID);
            
            // Log để debug
            console.log(`[ANTICHANGE] Blocked change in thread ${threadID} by user ${author}: ${changeType}`);
        }
        
    } catch (error) {
        console.error("[ANTICHANGE] Module error:", error);
        
        // Thông báo lỗi
        const errorMsg = `🛡️ **ANTI CHANGE GROUP INFO**\n\n` +
                       `❌ Phát hiện thay đổi thông tin nhóm nhưng có lỗi xảy ra!\n\n` +
                       `🐛 **Lỗi:** ${error.message}\n\n` +
                       `💡 **Khuyến nghị:** Kiểm tra quyền của bot hoặc liên hệ admin`;
        
        api.sendMessage(errorMsg, threadID);
    }
};

// Hàm lấy tên người dùng
async function getUserName(api, userID) {
    try {
        const userInfo = await api.getUserInfo(userID);
        return userInfo[userID]?.name || "Không xác định";
    } catch (error) {
        return "Không xác định";
    }
}

// Hàm khởi tạo thông tin nhóm gốc
module.exports.initGroupInfo = async function(api, threadID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        originalGroupInfo[threadID] = {
            threadName: threadInfo.threadName,
            imageSrc: threadInfo.imageSrc,
            emoji: threadInfo.emoji,
            color: threadInfo.color,
            theme: threadInfo.theme,
            lastUpdate: Date.now()
        };
        return originalGroupInfo[threadID];
    } catch (error) {
        console.error(`[ANTICHANGE] Error initializing group info for ${threadID}:`, error);
        return null;
    }
};

// Hàm cập nhật thông tin gốc (gọi khi admin thay đổi hợp lệ)
module.exports.updateGroupInfo = async function(api, threadID) {
    return await this.initGroupInfo(api, threadID);
};

// Hàm lấy thông tin gốc
module.exports.getOriginalInfo = function(threadID) {
    return originalGroupInfo[threadID] || null;
};

// Hàm reset thông tin gốc
module.exports.resetGroupInfo = function(threadID) {
    if (threadID) {
        delete originalGroupInfo[threadID];
    } else {
        originalGroupInfo = {};
    }
};

// Export để có thể test từ bên ngoài
module.exports.handleGroupChange = async function(api, threadID, changeType, changeData, authorID) {
    // Function riêng để xử lý thay đổi nhóm - có thể gọi từ bên ngoài để test
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
        const isAuthorAdmin = adminIDs.includes(authorID);
        const isBotAdmin = adminIDs.includes(api.getCurrentUserID());
        
        if (!isAuthorAdmin && isBotAdmin) {
            // Thực hiện khôi phục tùy theo loại thay đổi
            switch (changeType) {
                case "name":
                    if (originalGroupInfo[threadID]?.threadName) {
                        await api.setTitle(originalGroupInfo[threadID].threadName, threadID);
                    }
                    break;
                case "color":
                    if (originalGroupInfo[threadID]?.color) {
                        await api.changeThreadColor(originalGroupInfo[threadID].color, threadID);
                    }
                    break;
                case "emoji":
                    if (originalGroupInfo[threadID]?.emoji) {
                        await api.changeThreadEmoji(originalGroupInfo[threadID].emoji, threadID);
                    }
                    break;
            }
            return true; // Đã khôi phục thành công
        }
        
        return false; // Không cần khôi phục
        
    } catch (error) {
        console.error("[ANTICHANGE] Error in handleGroupChange:", error);
        return false;
    }
};