module.exports.config = {
    name: "kick",
    version: "1.3.3",
    hasPermssion: 0,
    credits: "D-Jukie - mod by Atomic",
    description: "Kick thành viên khỏi nhóm bằng tag, reply",
    commandCategory: "Quản Trị Viên",
    usages: "[tag/reply/all]",
    cooldowns: 0
};

module.exports.handleReply = async function ({ handleReply, api, event }) {
    if (handleReply.case === 'kickall_confirm') {
        const { threadID, senderID, body } = event;
        const { author, threadID: originalThreadID } = handleReply;

        if (senderID !== author) {
            return api.sendMessage("❌ Chỉ người gửi lệnh mới có thể xác nhận!", threadID);
        }

        if (threadID !== originalThreadID) {
            return api.sendMessage("❌ Lỗi xác thực thread!", threadID);
        }

        const choice = body.trim();

        if (choice === '1') {
            api.sendMessage("🔥 BẮT ĐẦU XÓA NHÓM...\n⚠️ Quá trình này không thể hoàn tác!", threadID);

            try {
                const threadInfo = await api.getThreadInfo(threadID);
                const botID = api.getCurrentUserID();
                const adminBot = global.config?.ADMINBOT || [];

                for (const participant of threadInfo.participantIDs) {
                    if (participant !== botID && !adminBot.includes(participant)) {
                        try {
                            await api.removeUserFromGroup(participant, threadID);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (err) {
                            console.error(`Lỗi khi kick ${participant}:`, err);
                        }
                    }
                }

                api.sendMessage("✅ Đã xóa nhóm thành công!\n🤖 Bot sẽ rời nhóm sau 5 giây...", threadID);

                setTimeout(() => {
                    api.removeUserFromGroup(botID, threadID);
                }, 5000);

            } catch (error) {
                console.error("Lỗi khi xóa nhóm:", error);
                api.sendMessage("❌ Có lỗi xảy ra khi xóa nhóm!", threadID);
            }

        } else if (choice === '2') {
            api.sendMessage("✅ Đã hủy lệnh xóa nhóm.", threadID);
        } else {
            api.sendMessage("❌ Lựa chọn không hợp lệ!\n─────────────────\n\n1. XÁC NHẬN\n2. HỦY BỎ\n─────────────────\nVui lòng chọn số 1 hoặc 2!\n⏰ Tự động hủy lệnh sau 30 giây không xác nhận", threadID);
            return;
        }

        const index = global.client.handleReply.findIndex(item => 
            item.messageID === handleReply.messageID && item.case === 'kickall_confirm'
        );
        if (index !== -1) {
            global.client.handleReply.splice(index, 1);
        }
    }
};

module.exports.run = async function ({ args, api, event, Threads }) {
    const threadID = event.threadID;
    const senderID = event.senderID;
    const botID = api.getCurrentUserID();
    const threadInfo = await api.getThreadInfo(threadID);
    const adminBot = global.config?.ADMINBOT || [];
    const botIsAdmin = threadInfo.adminIDs.some(item => item.id == botID);
    const senderIsAdmin = threadInfo.adminIDs.some(item => item.id == senderID);

    if (!botIsAdmin) {
        return api.sendMessage("⚠️ Bot cần quyền Quản trị viên để thực hiện lệnh kick.", threadID, event.messageID);
    }

    if (!args[0] || args[0] !== "all") {
        if (!senderIsAdmin && !adminBot.includes(senderID)) {
            return api.sendMessage("🚫 Bạn chưa phải QTV!", threadID, event.messageID);
        }
    }

    const preventKick = (uid) => {
        if (uid == botID) {
            api.sendMessage("🚫 Mày bảo tao tự kick tao á? Mày bị NGU à?", threadID);
            return true;
        }
        if (adminBot.includes(uid)) {
            api.sendMessage("🛡️ Mày chưa đủ tuổi 🙃", threadID);
            return true;
        }
        return false;
    }

    try {
        if (args.join().includes('@')) {
            const mentionIDs = Object.keys(event.mentions);
            for (let uid of mentionIDs) {
                if (uid == botID && adminBot.includes(senderID)) {
                    return api.sendMessage("🥺 Em yêu anh mà sao anh lại kick em 😢", threadID, event.messageID);
                }
                if (preventKick(uid)) continue;
                setTimeout(() => {
                    api.removeUserFromGroup(uid, threadID);
                }, 1000);
            }
        } else if (event.type == "message_reply") {
            const uid = event.messageReply.senderID;
            if (uid == botID && adminBot.includes(senderID)) {
                return api.sendMessage("🥺 Em yêu anh mà sao anh lại kick em 😢", threadID, event.messageID);
            }
            if (preventKick(uid)) return;
            return api.removeUserFromGroup(uid, threadID);
        } else if (args[0] == "all") {
            if (!adminBot.includes(senderID)) {
                if (preventKick(senderID)) return;
                return api.removeUserFromGroup(senderID, threadID);
            }

            const confirmMsg = await api.sendMessage("⚠️ BẠN CHẮC CHẮN MUỐN XÓA NHÓM NÀY ?─────────────────\n\n1. XÁC NHẬN\n2. HỦY BỎ\n─────────────────\n🔸 Nhóm sẽ bị xóa hoàn toàn\n⏰ Tự động hủy lệnh sau 30 giây không xác nhận", threadID);

            if (!global.client.handleReply) global.client.handleReply = [];
            global.client.handleReply.push({
                name: 'kick',
                messageID: confirmMsg.messageID,
                author: senderID,
                case: 'kickall_confirm',
                threadID: threadID,
                timestamp: Date.now()
            });

            setTimeout(() => {
                const index = global.client.handleReply.findIndex(item => 
                    item.messageID === confirmMsg.messageID && item.case === 'kickall_confirm'
                );
                if (index !== -1) {
                    global.client.handleReply.splice(index, 1);
                    api.sendMessage("⏰ Hết thời gian xác nhận. Hủy lệnh xóa nhóm.", threadID);
                }
            }, 30000);

            return;
        } else {
            return api.sendMessage("📌 Vui lòng tag hoặc reply người cần kick", threadID, event.messageID);
        }
    } catch (err) {
        console.error(err);
        return api.sendMessage("❌ Đã xảy ra lỗi khi thực hiện lệnh kick!", threadID, event.messageID);
    }
}