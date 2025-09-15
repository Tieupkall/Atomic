
module.exports.config = {
    name: "kickall",
    eventType: ["message_reaction"],
    version: "1.0.0",
    credits: "Atomic",
    description: "Xử lý reaction xác nhận kick all"
};

module.exports.run = async function({ api, event }) {
    if (!global.kickallPending) return;
    
    const { threadID, messageID, senderID, reaction } = event;
    const confirmKey = `${threadID}_${messageID}`;
    
    // Kiểm tra xem có request kick all nào đang chờ không
    const pendingRequest = global.kickallPending.get(confirmKey);
    if (!pendingRequest) return;
    
    // Kiểm tra reaction phải là 👍 và từ người đã gửi lệnh
    if (reaction !== "👍" || senderID !== pendingRequest.senderID) return;
    
    // Xóa request khỏi pending
    global.kickallPending.delete(confirmKey);
    
    try {
        const botID = api.getCurrentUserID();
        const threadInfo = await api.getThreadInfo(threadID);
        const members = threadInfo.participantIDs.filter(id => id !== botID);
        
        await api.sendMessage("🚨 BẮT ĐẦU XÓA NHÓM...", threadID);
        
        for (let memberID of members) {
            try {
                await api.removeUserFromGroup(memberID, threadID);
                console.log(`[Kick All] Kicked user ${memberID}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1s giữa các lần kick
            } catch (err) {
                console.error(`[Kick All] Error kicking ${memberID}:`, err);
            }
        }
        
        await api.sendMessage("✅ Đã xóa nhóm thành công!", threadID);
    } catch (err) {
        console.error("[Kick All] Error:", err);
        await api.sendMessage("❌ Có lỗi xảy ra khi xóa nhóm!", threadID);
    }
};
