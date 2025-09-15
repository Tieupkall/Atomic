module.exports.config = {
    name: "add",
    version: "1.1.1",
    hasPermssion: 1,
    credits: "Atomic",
    description: "Thêm thành viên vào nhóm qua ID Facebook",
    commandCategory: "Admin",
    usages: "[ID Facebook]",
    cooldowns: 5,
    dependencies: {}
};

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID } = event;

    try {
        if (!args[0] || !/^\d+$/.test(args[0])) {
            return api.sendMessage("❌ Vui lòng nhập ID Facebook!", threadID, messageID);
        }

        const targetID = args[0];
        const threadInfo = await api.getThreadInfo(threadID);

        if (threadInfo.participantIDs.includes(targetID)) {
            return api.sendMessage("⚠️ Người này đã có trong nhóm rồi!", threadID, messageID);
        }

        let userName = "Người dùng Facebook";
        const userInfo = await Users.getData(targetID);

        if (userInfo && userInfo.name) {
            userName = userInfo.name;
        } else {
            try {
                const info = await api.getUserInfo(targetID);
                if (info[targetID]) {
                    userName = info[targetID].name;
                }
            } catch (e) {}
        }

        api.sendTypingIndicator && api.sendTypingIndicator(threadID, true);

        api.addUserToGroup(targetID, threadID, (err) => {
            if (err) {
                let errorMessage = "❌ Không thể thêm thành viên này! ";
                if (err.error && typeof err.error === 'string') {
                    if (err.error.includes('Cannot add user')) {
                        errorMessage += "Người này có thể đã chặn bot hoặc không cho phép được thêm vào nhóm.";
                    } else if (err.error.includes('User is already in group')) {
                        errorMessage += "Người này đã có trong nhóm rồi.";
                    } else if (err.error.includes('User not found')) {
                        errorMessage += "Không tìm thấy người dùng với ID này.";
                    } else {
                        errorMessage += "Lỗi: " + err.error;
                    }
                } else {
                    errorMessage += "Có thể do người này đã chặn bot, không cho phép được thêm vào nhóm, hoặc ID không tồn tại.";
                }
                return api.sendMessage(errorMessage, threadID, messageID);
            }

            api.sendMessage(`✅ Đã thêm thành công ${userName} (ID: ${targetID}) vào nhóm!`, threadID, messageID);
        });

    } catch (error) {
        return api.sendMessage("❌ Đã xảy ra lỗi khi thực hiện lệnh!", threadID, messageID);
    }
};