module.exports = function ({ api, models, Users, Threads, Currencies }) {
    const fs = require("fs");
    const path = require("path");
    const logger = require("../../utils/log.js");

    return async function ({ event }) {
        const { threadID, logMessageType, logMessageData, messageID } = event;
        const { setData, getData, delData, createData } = Threads;

        // ✅ Chỉ xử lý log events
        if (!logMessageType || !logMessageType.startsWith('log:')) {
            return;
        }

        // ✅ Tạo event signature để tránh duplicate processing
        const eventSignature = `${threadID}_${logMessageType}_${messageID}_${Date.now()}`;

        // ✅ Kiểm tra global processed events (nếu có)
        if (!global.processedRefreshEvents) {
            global.processedRefreshEvents = new Map();
        }

        // ✅ Cleanup old processed events (older than 10 seconds)
        const now = Date.now();
        for (const [key, timestamp] of global.processedRefreshEvents.entries()) {
            if (now - timestamp > 10000) {
                global.processedRefreshEvents.delete(key);
            }
        }

        // ✅ Kiểm tra xem event đã được xử lý chưa
        if (global.processedRefreshEvents.has(eventSignature)) {
            console.log(`[handleRefresh] ⏭️ Event ${logMessageType} đã được xử lý, bỏ qua`);
            return;
        }

        // ✅ Đánh dấu event đã được xử lý
        global.processedRefreshEvents.set(eventSignature, now);

        try {
            let dataThread = (await getData(threadID)).threadInfo;

            switch (logMessageType) {
                case "log:thread-admins": {
                    if (logMessageData.ADMIN_EVENT == "add_admin") {
                        dataThread.adminIDs.push({ id: logMessageData.TARGET_ID });
                        logger(`Thêm admin ${logMessageData.TARGET_ID} tại nhóm ${threadID}`, 'UPDATE DATA');
                    } else if (logMessageData.ADMIN_EVENT == "remove_admin") {
                        dataThread.adminIDs = dataThread.adminIDs.filter(item => item.id != logMessageData.TARGET_ID);
                        logger(`Xóa admin ${logMessageData.TARGET_ID} tại nhóm ${threadID}`, 'UPDATE DATA');
                    }
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-name": {
                    logger(`Cập nhật tên nhóm "${logMessageData.name}" tại ${threadID}`, 'UPDATE DATA');
                    dataThread.threadName = logMessageData.name;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-icon": {
                    // Debug log để xem cấu trúc dữ liệu
                    console.log(`[handleRefresh] 🎯 DEBUG: logMessageData cho thread-icon:`, JSON.stringify(logMessageData, null, 2));

                    // Thử nhiều cách lấy emoji data
                    let newEmoji = logMessageData.thread_icon || 
                                   logMessageData.threadIcon || 
                                   logMessageData.emoji || 
                                   logMessageData.icon ||
                                   logMessageData.thread_emoji ||
                                   "";

                    // Nếu vẫn không có, thử lấy từ event trực tiếp
                    if (!newEmoji && event.logMessageData) {
                        newEmoji = event.logMessageData.thread_icon || 
                                   event.logMessageData.threadIcon || 
                                   event.logMessageData.emoji || 
                                   event.logMessageData.icon || "";
                    }

                    logger(`Cập nhật emoji nhóm "${newEmoji}" tại ${threadID}`, 'UPDATE DATA');
                    dataThread.emoji = newEmoji;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-color": {
                    // Debug log để xem cấu trúc dữ liệu  
                    console.log(`[handleRefresh] 🎨 DEBUG: logMessageData cho thread-color:`, JSON.stringify(logMessageData, null, 2));

                    let newColor = logMessageData.theme_color || 
                                   logMessageData.threadColor || 
                                   logMessageData.color ||
                                   logMessageData.thread_color ||
                                   "";

                    logger(`Cập nhật màu chủ đề nhóm "${newColor}" tại ${threadID}`, 'UPDATE DATA');
                    dataThread.color = newColor;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-image": {
                    console.log(`[handleRefresh] 🖼️ DEBUG: logMessageData cho thread-image:`, JSON.stringify(logMessageData, null, 2));

                    let newImageSrc = logMessageData.url || 
                                      logMessageData.image_url || 
                                      logMessageData.imageSrc ||
                                      logMessageData.src ||
                                      "";

                    logger(`Cập nhật ảnh nhóm tại ${threadID}`, 'UPDATE DATA');
                    dataThread.imageSrc = newImageSrc;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:subscribe": {
                    if (logMessageData.addedParticipants.some(i => i.userFbId == api.getCurrentUserID())) {
                        logger(`Bot được thêm vào nhóm ${threadID}`, 'UPDATE DATA');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            require('./handleCreateDatabase.js');
                        } catch (e) {
                            console.log(e);
                        }
                        return;
                    }

                    // Thêm thành viên mới vào database
                    for (const participant of logMessageData.addedParticipants) {
                        if (!dataThread.participantIDs.includes(participant.userFbId)) {
                            dataThread.participantIDs.push(participant.userFbId);
                            logger(`Thêm thành viên ${participant.userFbId} vào nhóm ${threadID}`, 'UPDATE DATA');
                        }
                    }
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:unsubscribe": {
                    console.log(`[handleRefresh] 🚪 Xử lý event unsubscribe tại nhóm ${threadID}`);

                    if (logMessageData.leftParticipantFbId == api.getCurrentUserID()) {
                        logger(`Bot bị kick khỏi nhóm ${threadID}`, 'DELETE DATA');
                        const index = global.data.allThreadID.findIndex(item => item == threadID);
                        if (index !== -1) {
                            global.data.allThreadID.splice(index, 1);
                        }
                        await delData(threadID);

                        // ✅ Xóa nhóm khỏi danh sách thuê bot nếu có
                        try {
                            const thuebotPath = path.join(__dirname, "../../modules/commands/cache/data/thuebot.json");
                            if (fs.existsSync(thuebotPath)) {
                                let thuebot = JSON.parse(fs.readFileSync(thuebotPath, "utf-8"));
                                thuebot = thuebot.filter(item => item.t_id !== threadID);
                                fs.writeFileSync(thuebotPath, JSON.stringify(thuebot, null, 2), "utf-8");
                                console.log(`🧹 [handleRefresh] Đã xóa nhóm ${threadID} khỏi danh sách thuê bot`);
                            }
                        } catch (err) {
                            console.error(`❌ [handleRefresh] Lỗi khi xóa nhóm ${threadID} khỏi thuebot.json:`, err);
                        }

                        return;
                    } else {
                        // Xóa thành viên khỏi participantIDs
                        const participantIndex = dataThread.participantIDs.findIndex(item => item == logMessageData.leftParticipantFbId);
                        if (participantIndex !== -1) {
                            dataThread.participantIDs.splice(participantIndex, 1);
                        }

                        // Xóa khỏi adminIDs nếu là admin
                        if (dataThread.adminIDs.find(i => i.id == logMessageData.leftParticipantFbId)) {
                            dataThread.adminIDs = dataThread.adminIDs.filter(item => item.id != logMessageData.leftParticipantFbId);
                        }

                        logger(`Xóa thành viên ${logMessageData.leftParticipantFbId} khỏi nhóm ${threadID}`, 'UPDATE DATA');
                        await setData(threadID, { threadInfo: dataThread });
                    }
                    break;
                }

                case "log:user-nickname": {
                    try {
                        console.log(`[handleRefresh] 👤 DEBUG: logMessageData cho user-nickname:`, JSON.stringify(logMessageData, null, 2));

                        logger(`Thay đổi biệt danh trong nhóm ${threadID}`, 'UPDATE DATA');

                        // Cập nhật nickname trong database nếu cần
                        if (logMessageData.participant_id && logMessageData.nickname !== undefined) {
                            // Tạo hoặc cập nhật nicknames object
                            if (!dataThread.nicknames) {
                                dataThread.nicknames = {};
                            }

                            if (logMessageData.nickname === "") {
                                // Xóa nickname
                                delete dataThread.nicknames[logMessageData.participant_id];
                            } else {
                                // Cập nhật nickname
                                dataThread.nicknames[logMessageData.participant_id] = logMessageData.nickname;
                            }

                            await setData(threadID, { threadInfo: dataThread });
                        }

                    } catch (err) {
                        console.error("[handleRefresh] ❌ Lỗi khi xử lý sự kiện đổi biệt danh:", err);
                    }
                    break;
                }

                case "log:thread-poll": {
                    logger(`Tạo/cập nhật poll trong nhóm ${threadID}`, 'UPDATE DATA');
                    console.log(`[handleRefresh] 📊 DEBUG: logMessageData cho thread-poll:`, JSON.stringify(logMessageData, null, 2));
                    break;
                }

                case "log:generic": {
                    logger(`Generic event trong nhóm ${threadID}`, 'UPDATE DATA');
                    console.log(`[handleRefresh] 🔧 DEBUG: logMessageData cho generic:`, JSON.stringify(logMessageData, null, 2));
                    break;
                }

                case "log:thread-call": {
                    logger(`Cuộc gọi trong nhóm ${threadID}`, 'UPDATE DATA');
                    console.log(`[handleRefresh] 📞 DEBUG: logMessageData cho thread-call:`, JSON.stringify(logMessageData, null, 2));
                    break;
                }

                case "log:link-status": {
                    logger(`Thay đổi link status trong nhóm ${threadID}`, 'UPDATE DATA');
                    console.log(`[handleRefresh] 🔗 DEBUG: logMessageData cho link-status:`, JSON.stringify(logMessageData, null, 2));
                    break;
                }

                case "log:magic-words": {
                    logger(`Magic words event trong nhóm ${threadID}`, 'UPDATE DATA');
                    console.log(`[handleRefresh] ✨ DEBUG: logMessageData cho magic-words:`, JSON.stringify(logMessageData, null, 2));
                    break;
                }

                default: {
                    // Log tất cả các event không được xử lý để debug
                    if (logMessageType && logMessageType.startsWith("log:")) {
                        console.log(`[handleRefresh] 🔍 Unhandled event type: ${logMessageType} in thread ${threadID}`);
                        console.log(`[handleRefresh] 📋 Full event data:`, JSON.stringify(event, null, 2));
                        console.log(`[handleRefresh] 📋 LogMessageData:`, JSON.stringify(logMessageData, null, 2));
                    }
                    break;
                }
            }

            // ✅ Chạy event handlers từ modules/events (chỉ cho log events)
            try {
                const eventDir = path.join(__dirname, "../../modules/events");
                if (fs.existsSync(eventDir)) {
                    const files = fs.readdirSync(eventDir).filter(file => file.endsWith(".js"));

                    for (const file of files) {
                        const filePath = path.join(eventDir, file);
                        try {
                            // ✅ Clear cache để đảm bảo module được load mới nhất
                            delete require.cache[require.resolve(filePath)];
                            const eventModule = require(filePath);

                            if (
                                eventModule.config &&
                                Array.isArray(eventModule.config.eventType) &&
                                eventModule.config.eventType.includes(logMessageType)
                            ) {
                                console.log(`[handleRefresh] ✅ Chạy event ${logMessageType} từ file: ${file}`);
                                await eventModule.run({ event, api, Threads, Users, Currencies });
                            }
                        } catch (moduleError) {
                            console.error(`[handleRefresh] ❌ Lỗi khi chạy module ${file}:`, moduleError);
                        }
                    }
                }
            } catch (eventError) {
                console.error("[handleRefresh] ❌ Lỗi khi xử lý event modules:", eventError);
            }

        } catch (e) {
            console.error(`[handleRefresh] ❌ Lỗi update data cho thread ${threadID}:`, e);
        }

        return;
    };
};