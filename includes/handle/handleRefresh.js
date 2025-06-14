module.exports = function ({ api, models, Users, Threads, Currencies }) {
    const fs = require("fs");
    const path = require("path");
    const logger = require("../../utils/log.js");

    return async function ({ event }) {
        const { threadID, logMessageType, logMessageData } = event;
        const { setData, getData, delData, createData } = Threads;

        try {
            let dataThread = (await getData(threadID)).threadInfo;

            switch (logMessageType) {
                case "log:thread-admins": {
                    if (logMessageData.ADMIN_EVENT == "add_admin") {
                        dataThread.adminIDs.push({ id: logMessageData.TARGET_ID });
                    } else if (logMessageData.ADMIN_EVENT == "remove_admin") {
                        dataThread.adminIDs = dataThread.adminIDs.filter(item => item.id != logMessageData.TARGET_ID);
                    }
                    logger('Làm mới list admin tại nhóm ' + threadID, 'UPDATE DATA');
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:thread-name": {
                    logger('Cập nhật tên tại nhóm ' + threadID, 'UPDATE DATA');
                    dataThread.threadName = logMessageData.name;
                    await setData(threadID, { threadInfo: dataThread });
                    break;
                }

                case "log:subscribe": {
                    if (logMessageData.addedParticipants.some(i => i.userFbId == api.getCurrentUserID())) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            require('./handleCreateDatabase.js');
                        } catch (e) {
                            console.log(e);
                        }
                        return;
                    }
                    break;
                }

                case "log:unsubscribe": {
                    if (logMessageData.leftParticipantFbId == api.getCurrentUserID()) {
                        logger('Thực hiện xóa data của nhóm ' + threadID, 'DELETE DATA');
                        const index = global.data.allThreadID.findIndex(item => item == threadID);
                        global.data.allThreadID.splice(index, 1);
                        await delData(threadID);
                        return;
                    } else {
                        const index = dataThread.participantIDs.findIndex(item => item == logMessageData.leftParticipantFbId);
                        dataThread.participantIDs.splice(index, 1);
                        if (dataThread.adminIDs.find(i => i.id == logMessageData.leftParticipantFbId)) {
                            dataThread.adminIDs = dataThread.adminIDs.filter(item => item.id != logMessageData.leftParticipantFbId);
                        }
                        logger('Thực hiện xóa user ' + logMessageData.leftParticipantFbId, 'DELETE DATA');
                        await setData(threadID, { threadInfo: dataThread });
                    }
                    break;
                }

                    case "log:user-nickname": {
                        try {
                            const eventDir = path.join(__dirname, "../../modules/events");
                            const files = fs.readdirSync(eventDir).filter(file => file.endsWith(".js"));
                            console.log(`[handleEvent] 📦 Tìm thấy ${files.length} file trong modules/events`);

                            for (const file of files) {
                                const filePath = path.join(eventDir, file);
                                const eventModule = require(filePath);

                                // Ghi log cho từng file
                                console.log(`[handleEvent] 📝 Đang kiểm tra file: ${file}`);

                                if (
                                    eventModule.config &&
                                    Array.isArray(eventModule.config.eventType) &&
                                    eventModule.config.eventType.includes("log:user-nickname")
                                ) {
                                    console.log(`[handleEvent] ✅ Đang chạy event từ file: ${file}`);
                                    await eventModule.run({ event, api, Threads, Users });
                                } else {
                                    console.log(`[handleEvent] ⏭️ Bỏ qua file: ${file}`);
                                }
                            }
                        } catch (err) {
                            console.error("[handleEvent] ❌ Lỗi khi xử lý sự kiện đổi biệt danh:", err);
                        }
                        break;
                    }
            }
        } catch (e) {
            console.log('Đã xảy ra lỗi update data: ' + e);
        }
        return;
    };
};