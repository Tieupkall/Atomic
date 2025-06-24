module.exports.config = {
    name: "tid",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Atomic",
    description: "Lấy Thread ID của nhóm/cuộc trò chuyện hiện tại",
    commandCategory: "Tiện ích",
    usages: "tid",
    cooldowns: 3
};

module.exports.run = async function({ api, event }) {
    try {
        const input = event.body?.trim().toLowerCase();

        // Chỉ xử lý khi người dùng gõ đúng /tid
        if (input !== "tid" && input !== "/tid") return;

        const threadID = event.threadID;
        return api.sendMessage(threadID, threadID);

    } catch (error) {
        console.error("Lỗi trong lệnh tid:", error);
        return api.sendMessage("❌ Có lỗi xảy ra!", event.threadID);
    }
};