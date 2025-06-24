module.exports.config = {
    name: "uid",
    version: "1.1.1",
    hasPermssion: 0,
    credits: "Atomic (mod by bạn)",
    description: "Lấy UID người dùng/tag/reply (chỉ gửi UID)",
    commandCategory: "Tiện ích",
    usages: "uid (tag hoặc reply nếu muốn)",
    cooldowns: 3
};

module.exports.run = async function({ api, event }) {
    try {
        const input = event.body?.trim().toLowerCase();
        if (!input.startsWith("uid") && !input.startsWith("/uid")) return;

        let targetID;

        // Trường hợp tag (mention)
        if (event.mentions && Object.keys(event.mentions).length > 0) {
            targetID = Object.keys(event.mentions)[0];
        }

        // Trường hợp reply tin nhắn
        else if (event.type === "message_reply") {
            targetID = event.messageReply.senderID;
        }

        // Mặc định: lấy UID người gửi
        else {
            targetID = event.senderID;
        }

        return api.sendMessage(`${targetID}`, event.threadID);

    } catch (error) {
        console.error("Lỗi trong lệnh uid:", error);
        return api.sendMessage("❌ Lỗi khi lấy UID!", event.threadID);
    }
};