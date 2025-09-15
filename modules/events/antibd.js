const fs = require('fs-extra');
const path = require('path');
const pathData = path.join(__dirname, '../commands/antibd/antinickname.json');

module.exports.config = {
    name: "antibd",
    eventType: ["log:user-nickname"],
    version: "1.0.6",
    credits: "atomic",
    description: "Ngăn đổi biệt danh trái phép, kể cả admin bot.",
};

module.exports.run = async function ({ event, api }) {
    const { threadID, logMessageData, author, messageID } = event;
    const botID = api.getCurrentUserID();
    const changedUserID = logMessageData.participant_id;
    const newNickname = logMessageData.nickname;

    // Tạo signature để tránh xử lý trùng lặp
    const eventSignature = `${threadID}_${changedUserID}_${newNickname}_${Date.now()}`;
    
    if (!global.processedAntibdEvents) {
        global.processedAntibdEvents = new Map();
    }
    
    // Cleanup old events (older than 5 seconds)
    const now = Date.now();
    for (const [key, timestamp] of global.processedAntibdEvents.entries()) {
        if (now - timestamp > 5000) {
            global.processedAntibdEvents.delete(key);
        }
    }
    
    // Kiểm tra xem event đã được xử lý chưa
    if (global.processedAntibdEvents.has(eventSignature)) {
        console.log(`[antibd] ⏭️ Event đã được xử lý, bỏ qua`);
        return;
    }
    
    // Đánh dấu event đã được xử lý
    global.processedAntibdEvents.set(eventSignature, now);

    const isBot = changedUserID === botID;
    const adminBotIDs = global.config?.ADMIN || [];
    const isTargetAdminBot = adminBotIDs.includes(changedUserID);

    try {
        let antiData = await fs.readJSON(pathData).catch(() => []);
        let threadEntry = antiData.find(entry => entry.threadID === threadID);
        if (!threadEntry) return;

        // Lấy thông tin nhóm
        const threadInfo = await api.getThreadInfo(threadID);
        const currentParticipants = threadInfo.participantIDs || [];
        const groupAdmins = threadInfo.adminIDs.map(a => a.id);
        const isAuthorGroupAdmin = groupAdmins.includes(author);
        const isTargetGroupAdmin = groupAdmins.includes(changedUserID);

        let originalNicknames = threadEntry.data || {};
        let changed = false;

        // 🧹 Xoá biệt danh người đã rời nhóm
        for (let userID of Object.keys(originalNicknames)) {
            if (!currentParticipants.includes(userID)) {
                delete originalNicknames[userID];
                changed = true;
                console.log(`[antibd] Xoá biệt danh người đã rời nhóm: ${userID}`);
            }
        }

        // ❌ QTV không được đổi biệt danh admin bot
        if (isAuthorGroupAdmin && isTargetAdminBot && author !== changedUserID) {
            const oldNick = originalNicknames[changedUserID] || "";
            if (newNickname !== oldNick) {
                api.changeNickname(oldNick, threadID, changedUserID, (err) => {
                    if (!err) {
                        api.sendMessage("⚠️ Bạn không được phép đổi biệt danh của admin bot.", threadID);
                        console.log(`[antibd] Ngăn QTV đổi biệt danh admin bot: ${changedUserID}`);
                    }
                });
            }
            return;
        }

        // ❌ Không ai được đổi biệt danh của bot (trừ bot)
        if (!isBot && changedUserID === botID) {
            const oldNick = originalNicknames[botID] || "";
            if (newNickname !== oldNick) {
                api.changeNickname(oldNick, threadID, botID, (err) => {
                    if (!err) {
                        api.sendMessage("⚠️ Không được phép đổi biệt danh của bot.", threadID);
                        console.log(`[antibd] Khôi phục biệt danh bot vì bị đổi trái phép.`);
                    }
                });
            }
            return;
        }

        // ✅ Bot tự đổi biệt danh của chính nó → ghi lại
        if (isBot && changedUserID === botID) {
            originalNicknames[botID] = newNickname;
            changed = true;
            console.log(`[antibd] Bot tự đổi biệt danh: ${newNickname}`);
        }

        // ✅ Admin đổi biệt danh cho người khác (kể cả bot) → ghi lại
        if (isAuthorGroupAdmin && author !== changedUserID) {
            originalNicknames[changedUserID] = newNickname;
            changed = true;
            console.log(`[antibd] Admin đổi biệt danh: ${changedUserID} -> ${newNickname}`);
        }

        // ❌ Thành viên thường tự đổi biệt danh → khôi phục
        if (!isAuthorGroupAdmin && author === changedUserID && !isBot) {
            const oldNick = originalNicknames[changedUserID] || "";
            if (newNickname !== oldNick) {
                api.changeNickname(oldNick, threadID, changedUserID, (err) => {
                    if (!err) {
                        api.sendMessage("✅ Đã khôi phục biệt danh cũ cho bạn.", threadID);
                        console.log(`[antibd] Khôi phục biệt danh người tự đổi: ${changedUserID}`);
                    }
                });
            }
        }

        // 💾 Ghi lại file nếu có thay đổi
        if (changed) {
            threadEntry.data = originalNicknames;
            await fs.writeJSON(pathData, antiData, { spaces: 2 });
        }

    } catch (error) {
        console.error("❌ Lỗi trong antibd:", error);
    }
};