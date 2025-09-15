
module.exports.config = {
    name: "userbanned",
    eventType: ["message", "message_reply"],
    version: "1.0.0",
    credits: "atomic", 
    description: "Thả reaction 🔒 khi người bị ban gửi tin nhắn"
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
        console.error("[UserBanned] Error loading banned users:", error);
    }
    return {};
}

module.exports.run = async function({ api, event }) {
    const { threadID, messageID, senderID } = event;
    
    // Bỏ qua nếu không có senderID hoặc là bot
    if (!senderID || senderID === api.getCurrentUserID()) return;
    
    // Bỏ qua admin bot và người thuê bot
    if (global.config.ADMINBOT.includes(senderID.toString()) || 
        global.config.NDH.includes(senderID.toString())) return;
    
    try {
        const bannedUsers = loadBannedUsers();
        
        // Kiểm tra user có bị ban không
        if (bannedUsers[senderID]) {
            // Thả reaction 🔒
            api.setMessageReaction("🔒", messageID, (err) => {
                if (err) {
                    console.error("[UserBanned] Error setting reaction:", err);
                }
            });
        }
    } catch (error) {
        console.error("[UserBanned] Error:", error);
    }
};
