module.exports.config = {
    name: "ban",
    version: "1.0.0",
    hasPermssion: 3,
    credits: "atomic",
    description: "Cấm người dùng sử dụng bot bằng cách reply tin nhắn",
    commandCategory: "Admin",
    usages: "Reply tin nhắn để ban người đó",
    cooldowns: 2
};

const fs = require("fs");
const path = require("path");

const bannedFilePath = path.join(__dirname, "..", "..", "data", "banned_users.json");

function loadBannedUsers() {
    try {
        if (fs.existsSync(bannedFilePath)) {
            return JSON.parse(fs.readFileSync(bannedFilePath, "utf8"));
        }
    } catch (error) {
        console.error("[Ban] Error loading banned users:", error);
    }
    return {};
}

function saveBannedUsers(data) {
    try {
        const dir = path.dirname(bannedFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(bannedFilePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error("[Ban] Error saving banned users:", error);
        return false;
    }
}

module.exports.run = async function({ api, event, Users }) {
    const { threadID, messageID, senderID } = event;

    // Chỉ hoạt động khi reply tin nhắn
    if (!event.messageReply) {
        return api.sendMessage(
            `❌ Vui lòng reply tin nhắn của người bạn muốn ban!\n\n` +
            `🔹 Cách sử dụng: Reply tin nhắn + gõ "ban"`,
            threadID, messageID
        );
    }

    const replyUserID = event.messageReply.senderID;

    // Kiểm tra quyền ban
    if (global.config.ADMINBOT.includes(replyUserID)) {
        return api.sendMessage("❌ Không thể ban admin bot!", threadID, messageID);
    }

    if (global.config.NDH.includes(replyUserID)) {
        return api.sendMessage("❌ Không thể ban người thuê bot!", threadID, messageID);
    }

    const bannedUsers = loadBannedUsers();
    if (bannedUsers[replyUserID]) {
        // Nếu đã bị ban, thực hiện unban
        try {
            const userName = await Users.getNameUser(replyUserID) || "Unknown";
            
            delete bannedUsers[replyUserID];
            
            if (saveBannedUsers(bannedUsers)) {
                if (global.data.userBanned && global.data.userBanned.has(replyUserID)) {
                    global.data.userBanned.delete(replyUserID);
                }
                
                return api.sendMessage(
                    `✅ Đã bỏ ban thành công!\n\n` +
                    `👤 Người dùng: ${userName}\n` +
                    `🆔 UserID: ${replyUserID}\n` +
                    `⏰ Thời gian: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
                    threadID, messageID
                );
            } else {
                return api.sendMessage("❌ Có lỗi khi lưu dữ liệu unban!", threadID, messageID);
            }
        } catch (error) {
            console.error("[Ban] Error unban:", error);
            return api.sendMessage("❌ Có lỗi xảy ra khi unban người dùng!", threadID, messageID);
        }
    }

    try {
        const userName = await Users.getNameUser(replyUserID) || "Unknown";
        const reason = "Banned by reply";

        bannedUsers[replyUserID] = {
            name: userName,
            reason: reason,
            bannedBy: senderID,
            dateAdded: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
        };

        if (saveBannedUsers(bannedUsers)) {
            if (!global.data.userBanned) {
                global.data.userBanned = new Map();
            }
            global.data.userBanned.set(replyUserID, {
                reason: reason,
                dateAdded: bannedUsers[replyUserID].dateAdded
            });

            api.sendMessage(
                `✅ Đã cấm thành công!\n\n` +
                `👤 Người dùng: ${userName}\n` +
                `🆔 UserID: ${replyUserID}\n` +
                `📝 Lý do: ${reason}\n` +
                `⏰ Thời gian: ${bannedUsers[replyUserID].dateAdded}`,
                threadID, messageID
            );
        } else {
            api.sendMessage("❌ Có lỗi khi lưu dữ liệu!", threadID, messageID);
        }
    } catch (error) {
        console.error("[Ban] Error:", error);
        api.sendMessage("❌ Có lỗi xảy ra khi ban người dùng!", threadID, messageID);
    }
};

module.exports.onLoad = function() {
    // Đồng bộ dữ liệu ban với global data khi khởi động
    const bannedUsers = loadBannedUsers();

    if (!global.data.userBanned) {
        global.data.userBanned = new Map();
    }

    Object.keys(bannedUsers).forEach(userID => {
        global.data.userBanned.set(userID, {
            reason: bannedUsers[userID].reason,
            dateAdded: bannedUsers[userID].dateAdded
        });
    });
};