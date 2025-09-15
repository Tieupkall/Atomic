module.exports.config = { 	
  name: "outall", 	
  version: "1.0.0", 	
  hasPermssion: 3, 	
  credits: "VInhdz", //mod by atomic	
  description: "Hiển thị danh sách và out all box", 	
  commandCategory: "Admin", 	
  usages: "outall", 	
  cooldowns: 5, 	
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID } = event;

    if (parseInt(senderID) !== parseInt(handleReply.author)) return;

    if (handleReply.type === "outall") {
        const confirm = event.body.toLowerCase().trim();

        if (confirm === "yes" || confirm === "có" || confirm === "y") {
            let successCount = 0;
            let failCount = 0;

            for (let thread of handleReply.threads) {
                try {
                    if (thread.threadID !== threadID) {
                        await api.removeUserFromGroup(api.getCurrentUserID(), thread.threadID);
                        successCount++;
                    }
                } catch (error) {
                    failCount++;
                }
            }

            const resultMsg = `✅ Đã out thành công khỏi ${successCount} cuộc trò chuyện\n` +
                            `${failCount > 0 ? `❌ Thất bại: ${failCount} cuộc trò chuyện` : ''}`;

            return api.sendMessage(resultMsg, threadID, messageID);
        } else {
            return api.sendMessage("❌ Đã hủy thao tác out all", threadID, messageID);
        }
    }
};

module.exports.run = async ({ api, event, args }) => { 	
    const { threadID, messageID, senderID } = event;

    if (!args[0] || args[0] === "list") {
        try {
            const threadList = await api.getThreadList(100, null, ["INBOX"]);

            if (!threadList || threadList.length === 0) {
                return api.sendMessage("❌ Không tìm thấy cuộc trò chuyện nào", threadID, messageID);
            }

            let groupCount = 0;
            let privateCount = 0;
            let msg = "📋 DANH SÁCH NHÓM BOT ĐANG THAM GIA\n";
            msg += "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n";

            // Nhóm
            msg += "👥 NHÓM:\n";
            threadList.forEach((thread, index) => {
                if (thread.isGroup === true && thread.threadID !== threadID) {
                    groupCount++;
                    const name = thread.name || "Nhóm không tên";
                    const memberCount = thread.participants ? thread.participants.length : 0;
                    msg += `${groupCount}. ${name}\n`;
                    msg += `   📌 TID: ${thread.threadID}\n`;
                    msg += `   👤 Thành viên: ${memberCount}\n\n`;
                }
            });

            if (groupCount === 0) {
                msg += "   Không có nhóm nào\n\n";
            }

            // Đoạn chat riêng và Page
            msg += "💬 ĐOẠN CHAT RIÊNG & PAGE:\n";
            threadList.forEach((thread, index) => {
                if ((thread.isGroup === false || !thread.isGroup) && thread.threadID !== threadID) {
                    privateCount++;
                    const name = thread.name || "Người dùng";

                    // Kiểm tra xem có phải page không dựa vào participants
                    let isPage = false;
                    if (thread.participants && thread.participants.length > 0) {
                        // Page thường có accountType là "Page" hoặc có thuộc tính đặc biệt
                        isPage = thread.participants.some(p => 
                            p.accountType === "Page" || 
                            p.isMessengerPlatformBot === true ||
                            p.acceptsMessengerUserFeedback === true
                        );
                    }

                    const type = isPage ? "📄 Page" : "👤 Chat riêng";
                    msg += `${privateCount}. ${name}\n`;
                    msg += `   ${type}\n`;
                    msg += `   📌 TID: ${thread.threadID}\n\n`;
                }
            });

            if (privateCount === 0) {
                msg += "   Không có đoạn chat riêng hoặc page nào\n\n";
            }

            const totalCount = groupCount + privateCount;
            msg += `📊 TỔNG KẾT:\n`;
            msg += `• Nhóm: ${groupCount}\n`;
            msg += `• Chat riêng/Page: ${privateCount}\n`;
            msg += `• Tổng cộng: ${totalCount}\n\n`;

            if (totalCount > 0) {
                msg += `⚠️ Reply "yes" hoặc "có" để out khỏi TẤT CẢ ${totalCount} cuộc trò chuyện\n`;
                msg += `(Trừ nhóm hiện tại)`;

                return api.sendMessage(msg, threadID, (err, info) => {
                    if (!err) {
                        global.client.handleReply.push({
                            name: this.config.name,
                            author: senderID,
                            messageID: info.messageID,
                            type: "outall",
                            threads: threadList.filter(t => t.threadID !== threadID)
                        });
                    }
                }, messageID);
            } else {
                return api.sendMessage(msg + "✅ Bot chỉ ở trong nhóm hiện tại", threadID, messageID);
            }

        } catch (error) {
            console.error("Lỗi khi lấy danh sách thread:", error);
            return api.sendMessage("❌ Có lỗi xảy ra khi lấy danh sách cuộc trò chuyện", threadID, messageID);
        }
    } else if (args[0] === "force") {
        // Chức năng out all cũ (tức thì) - chỉ khi dùng "force"
        return api.getThreadList(100, null, ["INBOX"], (err, list) => { 		
            if (err) throw err; 		
            list.forEach(item => (item.isGroup == true && item.threadID != event.threadID) ? 
                api.removeUserFromGroup(api.getCurrentUserID(), item.threadID) : ''); 		
            api.sendMessage('✅ Đã out all nhóm thành công', event.threadID); 	
        }); 
    } else {
        // Mặc định hiển thị danh sách
        try {
            const threadList = await api.getThreadList(100, null, ["INBOX"]);

            if (!threadList || threadList.length === 0) {
                return api.sendMessage("❌ Không tìm thấy cuộc trò chuyện nào", threadID, messageID);
            }

            let groupCount = 0;
            let privateCount = 0;
            let msg = "📋 DANH SÁCH CUỘC TRÒ CHUYỆN BOT ĐANG THAM GIA\n";
            msg += "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n";

            // Nhóm
            msg += "👥 NHÓM:\n";
            threadList.forEach((thread, index) => {
                if (thread.isGroup === true && thread.threadID !== threadID) {
                    groupCount++;
                    const name = thread.name || "Nhóm không tên";
                    const memberCount = thread.participants ? thread.participants.length : 0;
                    msg += `${groupCount}. ${name}\n`;
                    msg += `   📌 TID: ${thread.threadID}\n`;
                    msg += `   👤 Thành viên: ${memberCount}\n\n`;
                }
            });

            if (groupCount === 0) {
                msg += "   Không có nhóm nào\n\n";
            }

            // Đoạn chat riêng và Page
            msg += "💬 ĐOẠN CHAT RIÊNG & PAGE:\n";
            threadList.forEach((thread, index) => {
                if ((thread.isGroup === false || !thread.isGroup) && thread.threadID !== threadID) {
                    privateCount++;
                    const name = thread.name || "Người dùng";

                    // Kiểm tra xem có phải page không dựa vào participants
                    let isPage = false;
                    if (thread.participants && thread.participants.length > 0) {
                        // Page thường có accountType là "Page" hoặc có thuộc tính đặc biệt
                        isPage = thread.participants.some(p => 
                            p.accountType === "Page" || 
                            p.isMessengerPlatformBot === true ||
                            p.acceptsMessengerUserFeedback === true
                        );
                    }

                    const type = isPage ? "📄 Page" : "👤 Chat riêng";
                    msg += `${privateCount}. ${name}\n`;
                    msg += `   ${type}\n`;
                    msg += `   📌 TID: ${thread.threadID}\n\n`;
                }
            });

            if (privateCount === 0) {
                msg += "   Không có đoạn chat riêng hoặc page nào\n\n";
            }

            const totalCount = groupCount + privateCount;
            msg += `📊 TỔNG KẾT:\n`;
            msg += `• Nhóm: ${groupCount}\n`;
            msg += `• Chat riêng/Page: ${privateCount}\n`;
            msg += `• Tổng cộng: ${totalCount}\n\n`;

            if (totalCount > 0) {
                msg += `⚠️ Reply "yes" hoặc "có" để out khỏi TẤT CẢ ${totalCount} cuộc trò chuyện\n`;
                msg += `(Trừ nhóm hiện tại)`;

                return api.sendMessage(msg, threadID, (err, info) => {
                    if (!err) {
                        global.client.handleReply.push({
                            name: this.config.name,
                            author: senderID,
                            messageID: info.messageID,
                            type: "outall",
                            threads: threadList.filter(t => t.threadID !== threadID)
                        });
                    }
                }, messageID);
            } else {
                return api.sendMessage(msg + "✅ Bot chỉ ở trong nhóm hiện tại", threadID, messageID);
            }

        } catch (error) {
            console.error("Lỗi khi lấy danh sách thread:", error);
            return api.sendMessage("❌ Có lỗi xảy ra khi lấy danh sách cuộc trò chuyện", threadID, messageID);
        }
    }
}