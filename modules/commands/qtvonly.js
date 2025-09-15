module.exports.config = {
    name: "qtvonly",
    version: "1.0.0",
    hasPermssion: 3,
    credits: "YourName",
    description: "Bật/tắt chế độ chỉ admin và qtv có thể sử dụng bot",
    commandCategory: "Admin",
    usages: "adminonly [on/off]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(__dirname, "..", "..", "config.json");

    try {
        let config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        if (!config.qtvonly) config.qtvonly = {}; // Khởi tạo nếu chưa có phần qtvonly

        if (!args[0]) {
            const status = config.qtvonly[threadID]?.adminOnly === true ? "🟢 BẬT" : "🔴 TẮT";
            return api.sendMessage(
                `🔧 TRẠNG THÁI ADMIN ONLY\n` +
                `─────────────────\n` +
                `📊 Hiện tại: ${status}\n` +
                `📝 Cách dùng: ${global.config.PREFIX}adminonly [on/off]\n` +
                `\n💡 Khi BẬT: Chỉ admin và qtv nhóm mới được dùng lệnh\n` +
                `💡 Khi TẮT: Tất cả người dùng được dùng lệnh`,
                threadID, messageID
            );
        }

        const option = args[0].toLowerCase();

        switch(option) {
            case "on":
            case "bật":
            case "1":
            case "true":
                if (config.qtvonly[threadID]?.adminOnly === true) {
                    return api.sendMessage("⚠️ Chế độ admin only đã được BẬT rồi!", threadID, messageID);
                }

                config.qtvonly[threadID] = config.qtvonly[threadID] || {}; // Khởi tạo nhóm nếu chưa có
                config.qtvonly[threadID].adminOnly = true;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

                return api.sendMessage(
                    `✅ ĐÃ BẬT CHẾ ĐỘ ADMIN ONLY\n` +
                    `─────────────────\n` +
                    `🚫 Từ giờ chỉ admin và qtv nhóm mới được sử dụng lệnh!\n` +
                    `👥 Admin bot: ${config.ADMINBOT ? config.ADMINBOT.length : 0} người\n` +
                    `💡 Để tắt, dùng: ${global.config.PREFIX}adminonly off`,
                    threadID, messageID
                );

            case "off":
            case "tắt":
            case "0":
            case "false":
                if (config.qtvonly[threadID]?.adminOnly === false || config.qtvonly[threadID] === undefined) {
                    return api.sendMessage("⚠️ Chế độ admin only đã được TẮT rồi!", threadID, messageID);
                }

                config.qtvonly[threadID].adminOnly = false;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

                return api.sendMessage(
                    `✅ ĐÃ TẮT CHẾ ĐỘ ADMIN ONLY\n` +
                    `─────────────────\n` +
                    `🎉 Tất cả người dùng đã có thể sử dụng bot!\n` +
                    `💡 Để bật lại, dùng: ${global.config.PREFIX}adminonly on`,
                    threadID, messageID
                );

            default:
                return api.sendMessage(
                    `❌ THAM SỐ KHÔNG HỢP LỆ\n` +
                    `─────────────────\n` +
                    `📝 Cách dùng: ${global.config.PREFIX}adminonly [on/off]\n` +
                    `\n🟢 Bật: on, bật, 1, true\n` +
                    `🔴 Tắt: off, tắt, 0, false`,
                    threadID, messageID
                );
        }

    } catch (error) {
        console.error("Lỗi adminonly command:", error);
        return api.sendMessage(
            `❌ LỖI KHI XỬ LÝ LỆNH\n` +
            `─────────────────\n` +
            `💥 Chi tiết: ${error.message}\n` +
            `🔧 Vui lòng kiểm tra file config.json`,
            threadID, messageID
        );
    }
};