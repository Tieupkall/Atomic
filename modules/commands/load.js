module.exports.config = {
    name: "load",
    version: "1.0.1", 
    hasPermssion: 2,
    credits: "Atomic (refined by moorebenjaminpir295)",
    description: "Reload commands và events mà không cần khởi động lại bot",
    commandCategory: "Hệ thống",
    usages: "[cmd/evt/all] [tên file]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
    const fs = require("fs");
    const path = require("path");
    const { threadID, messageID } = event;

    // Thả cảm xúc ⏳ khi bắt đầu
    if (messageID) {
        try {
            await api.setMessageReaction("⏳", messageID);
        } catch (err) {
            console.log("Không thể thả reaction ⏳:", err.message);
        }
    }

    try {
        const type = args[0]?.toLowerCase() || "all"; // Mặc định là "all" nếu không có tham số
        const specificFile = args[1];

        if (!["cmd", "evt", "all", "command", "event"].includes(type)) {
            return api.sendMessage(
                `📋 𝗛𝗨̛𝗢̛́𝗡𝗚 𝗗𝗔̂̃𝗡 𝗦𝗨̛̉ 𝗗𝗨̣NG\n━━━━━━━━━━━━━━━\n` +
                `🔁 𝗧𝗮̉𝗶 𝗹𝗮̣𝗶 𝗧𝗮̂́𝘁 𝗰𝗮̉:\n• ${global.config.PREFIX}load\n\n` +
                `⚙️ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱:\n• ${global.config.PREFIX}load cmd [tên file]\n\n` +
                `🎯 𝗘𝘃𝗲𝗻𝘁:\n• ${global.config.PREFIX}load evt [tên file]`,
                threadID, messageID
            );
        }

        let result = `🔄 𝗧𝗔̉𝗜 𝗟𝗔̣𝗜 𝗠𝗢𝗗𝗨𝗟𝗘𝗦\n━━━━━━━━━━━━━━━\n`;
        let totalLoaded = 0, totalFailed = 0;

        // Lưu kết quả reload để tránh gọi lại
        let cmdResult = null;
        let evtResult = null;

        if (type === "cmd" || type === "command" || type === "all") {
            cmdResult = await reloadCommands(specificFile, type === "all");
            result += `⚙️ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n` +
                      `✅ ${cmdResult.loaded} | ❌ ${cmdResult.failed}`;
            if (cmdResult.skipped > 0) result += ` | ⏭️ ${cmdResult.skipped}`;
            if (cmdResult.failedList.length > 0)
                result += `\n🚫 Lỗi:\n• ` + cmdResult.failedList.slice(0, 3).join("\n• ");
            result += `\n📦 Tổng: ${global.client.commands.size}\n━━━━━━━━━━━━━━━\n`;
            totalLoaded += cmdResult.loaded;
            totalFailed += cmdResult.failed;
        }

        if (type === "evt" || type === "event" || type === "all") {
            evtResult = await reloadEvents(specificFile, type === "all");
            result += `🎯 𝗘𝗩𝗘𝗡𝗧𝗦\n` +
                      `✅ ${evtResult.loaded} | ❌ ${evtResult.failed}`;
            if (evtResult.skipped > 0) result += ` | ⏭️ ${evtResult.skipped}`;
            if (evtResult.failedList.length > 0)
                result += `\n🚫 Lỗi:\n• ` + evtResult.failedList.slice(0, 3).join("\n• ");
            result += `\n📦 Tổng: ${global.client.events.size}`;
            totalLoaded += evtResult.loaded;
            totalFailed += evtResult.failed;
        }

        if (type === "all") {
            result += `\n━━━━━━━━━━━━━━━\n📊 𝗧𝗢̂̉𝗡𝗚 𝗞𝗘̂́𝗧\n` +
                      `✅ Thành công: ${totalLoaded}\n❌ Thất bại: ${totalFailed}`;
        }

        // Chỉ gửi tin nhắn nếu có lỗi
        if (totalFailed > 0) {
            // Thu thập tất cả lỗi từ commands và events
            let allErrors = [];

            if (cmdResult && cmdResult.failedList.length > 0) {
                cmdResult.failedList.forEach(error => {
                    allErrors.push(`⚙️ COMMAND: ${error}`);
                });
            }

            if (evtResult && evtResult.failedList.length > 0) {
                evtResult.failedList.forEach(error => {
                    allErrors.push(`🎯 EVENT: ${error}`);
                });
            }

            // Tạo tin nhắn lỗi chi tiết giống cmd.js
            let errorMessage = `🔄 LOAD MODULES RESULT\n\n`;
            errorMessage += `❌ Thất bại (${totalFailed}):\n`;
            errorMessage += allErrors.slice(0, 3).join('\n');
            if (allErrors.length > 3) {
                errorMessage += `\n📋 Và ${allErrors.length - 3} lỗi khác...`;
            }
            errorMessage += `\n\n💡 Tip: Kiểm tra syntax, dependencies và cấu trúc module`;

            // Thả cảm xúc ⚠️ khi có lỗi
            if (messageID) {
                try {
                    await api.setMessageReaction("⚠️", messageID);
                } catch (err) {
                    console.log("Không thể thả reaction ⚠️:", err.message);
                }
            }

            return api.sendMessage(errorMessage, threadID, messageID);
        } else {
            // Chỉ thả reaction ✅ khi thành công hoàn toàn, không gửi tin nhắn
            if (messageID) {
                try {
                    await api.setMessageReaction("✅", messageID);
                } catch (err) {
                    console.log("Không thể thả reaction ✅:", err.message);
                }
            }
            // Không return gì để không gửi tin nhắn
        }

    } catch (err) {
        console.error("Load error:", err);
         // Thả cảm xúc ❌ khi có lỗi nghiêm trọng
        if (messageID) {
            try {
                await api.setMessageReaction("❌", messageID);
            } catch (err) {
                console.log("Không thể thả reaction ❌:", err.message);
            }
        }
        return api.sendMessage(
            `❌ 𝗟𝗢̂̃𝗜 𝗧𝗔̉𝗜 𝗟𝗔̣𝗜:\n${err.name}: ${err.message}\n` +
            `📥 Args: [${args.join(", ")}]\n` +
            `🛠 Hãy kiểm tra lại cú pháp và tên file.`,
            event.threadID, event.messageID
        );
    }
};

// Reload Commands với xử lý lỗi tốt hơn
async function reloadCommands(specificFile, isAll = false) {
    const fs = require("fs");
    const path = require("path");
    const commandsPath = __dirname;

    // Kiểm tra thư mục tồn tại
    if (!fs.existsSync(commandsPath)) {
        return { loaded: 0, failed: 1, skipped: 0, failedList: ["Commands directory not found"] };
    }

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js") && f !== "load.js");

    // Khởi tạo commands map nếu chưa có
    if (!global.client.commands) global.client.commands = new Map();

    let loaded = 0, failed = 0, skipped = 0, failedList = [];

    for (const file of files) {
        if (specificFile && !file.includes(specificFile.replace(".js", ""))) {
            skipped++;
            continue;
        }

        const fullPath = path.join(commandsPath, file);
        try {
            // Xóa cache cũ
            const resolvedPath = require.resolve(fullPath);
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }

            // Load module mới
            const command = require(fullPath);

            // Kiểm tra cấu trúc command
            if (!command.config || typeof command.run !== "function") {
                failed++;
                failedList.push(`${file} (thiếu config/run)`);
                continue;
            }

            // Kiểm tra tên command
            if (!command.config.name) {
                failed++;
                failedList.push(`${file} (thiếu tên command)`);
                continue;
            }

            const name = command.config.name;

            // Tạo object command hoàn chỉnh
            const commandObj = {
                config: command.config,
                run: command.run,
                path: fullPath,
                fileName: file
            };

            // Thêm các function tùy chọn nếu có
            if (command.onLoad && typeof command.onLoad === 'function') {
                commandObj.onLoad = command.onLoad;
            }

            if (command.handleReply && typeof command.handleReply === 'function') {
                commandObj.handleReply = command.handleReply;
            }

            if (command.handleEvent && typeof command.handleEvent === 'function') {
                commandObj.handleEvent = command.handleEvent;
            }

            if (command.handleReaction && typeof command.handleReaction === 'function') {
                commandObj.handleReaction = command.handleReaction;
            }

            // Lưu vào global commands
            global.client.commands.set(name, commandObj);

            // Chạy onLoad nếu có
            if (typeof command.onLoad === "function") {
                try {
                    await command.onLoad({
                        api: global.client.api,
                        models: global.models,
                        Users: global.data?.Users,
                        Threads: global.data?.Threads,
                        Currencies: global.data?.Currencies
                    });
                } catch (onLoadError) {
                    console.warn(`OnLoad error for ${name}:`, onLoadError.message);
                }
            }

            loaded++;

        } catch (err) {
            failed++;
            // Trích xuất thông tin chi tiết về lỗi
            let errorDetails = err.message;
            let lineInfo = "";

            // Tìm số dòng trong stack trace
            if (err.stack) {
                const stackLines = err.stack.split('\n');
                const relevantLine = stackLines.find(line => line.includes(file));
                if (relevantLine) {
                    const lineMatch = relevantLine.match(/:(\d+):\d+\)/);
                    if (lineMatch) {
                        lineInfo = ` (dòng ${lineMatch[1]})`;
                    }
                }
            }

            // Rút gọn error message nếu quá dài
            if (errorDetails.length > 60) {
                errorDetails = errorDetails.slice(0, 60) + "...";
            }

            failedList.push(`modules/commands/${file}${lineInfo}: ${errorDetails}`);
            console.error(`Error loading command ${file}:`, err);
        }
    }

    return { loaded, failed, skipped, failedList };
}

// Reload Events với xử lý lỗi tốt hơn
async function reloadEvents(specificFile, isAll = false) {
    const fs = require("fs");
    const path = require("path");
    const eventsPath = path.join(__dirname, "..", "events");

    // Kiểm tra thư mục events tồn tại
    if (!fs.existsSync(eventsPath)) {
        return { loaded: 0, failed: 1, skipped: 0, failedList: ["Events directory not found"] };
    }

    const files = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));

    // Khởi tạo events map nếu chưa có
    if (!global.client.events) global.client.events = new Map();

    let loaded = 0, failed = 0, skipped = 0, failedList = [];

    for (const file of files) {
        if (specificFile && !file.includes(specificFile.replace(".js", ""))) {
            skipped++;
            continue;
        }

        const fullPath = path.join(eventsPath, file);
        try {
            // Xóa cache cũ
            const resolvedPath = require.resolve(fullPath);
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }

            // Load module mới
            const event = require(fullPath);

            // Kiểm tra cấu trúc event
            if (!event.config) {
                failed++;
                failedList.push(`${file} (thiếu config)`);
                continue;
            }

            // Kiểm tra có ít nhất một function chính
            if (typeof event.run !== "function" && typeof event.handleEvent !== "function") {
                failed++;
                failedList.push(`${file} (thiếu run/handleEvent)`);
                continue;
            }

            const name = event.config.name || file.replace(".js", "");

            // Tạo object event hoàn chỉnh
            const eventObj = {
                config: event.config,
                path: fullPath,
                fileName: file
            };

            // Thêm các function nếu có
            if (event.run && typeof event.run === 'function') {
                eventObj.run = event.run;
            }

            if (event.handleEvent && typeof event.handleEvent === 'function') {
                eventObj.handleEvent = event.handleEvent;
            }

            if (event.onLoad && typeof event.onLoad === 'function') {
                eventObj.onLoad = event.onLoad;
            }

            // Lưu vào global events
            global.client.events.set(name, eventObj);

            // Chạy onLoad nếu có
            if (typeof event.onLoad === "function") {
                try {
                    await event.onLoad({
                        api: global.client.api,
                        models: global.models,
                        Users: global.data?.Users,
                        Threads: global.data?.Threads,
                        Currencies: global.data?.Currencies
                    });
                } catch (onLoadError) {
                    console.warn(`OnLoad error for event ${name}:`, onLoadError.message);
                }
            }

            loaded++;

        } catch (err) {
            failed++;
            // Trích xuất thông tin chi tiết về lỗi
            let errorDetails = err.message;
            let lineInfo = "";

            // Tìm số dòng trong stack trace
            if (err.stack) {
                const stackLines = err.stack.split('\n');
                const relevantLine = stackLines.find(line => line.includes(file));
                if (relevantLine) {
                    const lineMatch = relevantLine.match(/:(\d+):\d+\)/);
                    if (lineMatch) {
                        lineInfo = ` (dòng ${lineMatch[1]})`;
                    }
                }
            }

            // Rút gọn error message nếu quá dài
            if (errorDetails.length > 60) {
                errorDetails = errorDetails.slice(0, 60) + "...";
            }

            failedList.push(`modules/events/${file}${lineInfo}: ${errorDetails}`);
            console.error(`Error loading event ${file}:`, err);
        }
    }

    return { loaded, failed, skipped, failedList };
}