module.exports = function ({ api, models, Users, Threads, Currencies }) {
    const fs = require("fs");
    const path = require("path");
    const logger = require("../../utils/log.js");

    return async function ({ event }) {
        const { threadID, logMessageType, logMessageData, messageID } = event;
        const { setData, getData, delData, createData } = Threads;

        // ✅ Xử lý log events và reaction events
        if (!logMessageType && event.type !== 'message_reaction') {
            return;
        }
        
        // ✅ Xử lý reaction events
        if (event.type === 'message_reaction') {
            try {
                const { handleReaction, commands } = global.client;
                const { messageID } = event;
                
                if (handleReaction.length !== 0) {
                    const indexOfHandle = handleReaction.findIndex(e => e.messageID == messageID);
                    if (indexOfHandle >= 0) {
                        const indexOfMessage = handleReaction[indexOfHandle];
                        const handleNeedExec = commands.get(indexOfMessage.name);

                        if (handleNeedExec && handleNeedExec.handleReaction) {
                            try {
                                var getText2;
                                if (handleNeedExec.languages && typeof handleNeedExec.languages == 'object') 
                                    getText2 = (...value) => {
                                    const react = handleNeedExec.languages || {};
                                    if (!react.hasOwnProperty(global.config.language)) 
                                        return api.sendMessage(global.getText('handleCommand', 'notFoundLanguage', handleNeedExec.config.name), threadID, messageID);
                                    var lang = handleNeedExec.languages[global.config.language][value[0]] || '';
                                    for (var i = value.length; i > 0x2 * -0xb7d + 0x2111 * 0x1 + -0xa17; i--) {
                                        const expReg = RegExp('%' + i, 'g');
                                        lang = lang.replace(expReg, value[i]);
                                    }
                                    return lang;
                                };
                                else getText2 = () => {};
                                
                                const Obj = {};
                                Obj.api = api 
                                Obj.event = event 
                                Obj.models = models
                                Obj.Users = Users
                                Obj.Threads = Threads
                                Obj.Currencies = Currencies
                                Obj.handleReaction = indexOfMessage
                                Obj.models = models 
                                Obj.getText = getText2
                                
                                await handleNeedExec.handleReaction(Obj);
                            } catch (error) {
                                api.sendMessage(`❌ Lỗi khi xử lý reaction: ${error}`, threadID, messageID);
                            }
                        }
                    }
                }
            } catch (error) {
            }
            
            // ✅ Chạy event handlers từ modules/events cho message_reaction
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
                                eventModule.config.eventType.includes("message_reaction")
                            ) {
                                await eventModule.run({ event, api, Threads, Users, Currencies });
                            }
                        } catch (moduleError) {
                        }
                    }
                }
            } catch (eventError) {
            }
            
            return;
        }

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
                    dataThread.threadName = logMessageData.name;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-icon": {

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
                        await new Promise(resolve => setTimeout(resolve, 4000));
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

                    // Kiểm tra xem có phải đang trong quá trình re-add user không
                    if (global.isReAddingUser && 
                        global.reAddingUserID === logMessageData.leftParticipantFbId && 
                        global.reAddingThreadID === threadID) {
                        return;
                    }

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
                            }
                        } catch (err) {
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
                    }
                    break;
                }

                case "log:thread-poll": {
                    logger(`Tạo/cập nhật poll trong nhóm ${threadID}`, 'UPDATE DATA');
                    break;
                }

                case "log:generic": {
                    logger(`Generic event trong nhóm ${threadID}`, 'UPDATE DATA');
                    break;
                }

                case "log:thread-call": {
                    logger(`Cuộc gọi trong nhóm ${threadID}`, 'UPDATE DATA');
                    break;
                }

                case "log:link-status": {
                    logger(`Thay đổi link status trong nhóm ${threadID}`, 'UPDATE DATA');
                    break;
                }

                case "log:magic-words": {
                    logger(`Magic words event trong nhóm ${threadID}`, 'UPDATE DATA');
                    break;
                }

                default: {
                    break;
                }
            }

            // ✅ Chạy event handlers từ modules/events (cho cả log events và message_reaction)
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
                                await eventModule.run({ event, api, Threads, Users, Currencies });
                            }
                        } catch (moduleError) {
                        }
                    }
                }
            } catch (eventError) {
            }

        } catch (e) {
        }

        return;
    };
};