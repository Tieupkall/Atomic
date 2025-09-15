
module.exports.config = {
    name: "kicktracker",
    eventType: ["log:unsubscribe"],
    version: "1.0.0",
    credits: "Assistant",
    description: "Track kicked members for undo functionality"
};

module.exports.run = async({ event, api, Threads, Users }) => {
    try {
        // Kiểm tra xem có phải là kick không (không phải tự rời)
        if (event.logMessageData && event.logMessageData.leftParticipantFbId) {
            const kickedUserID = event.logMessageData.leftParticipantFbId;
            const kickedBy = event.author;
            const threadID = event.threadID;
            
            // Không track nếu là bot bị kick hoặc người tự rời
            if (kickedUserID === api.getCurrentUserID()) {
                console.log('[KickTracker] Bot was kicked, not tracking as it cannot re-add itself');
                return;
            }
            if (kickedBy === kickedUserID) return; // Tự rời
            
            // Kiểm tra tổng quát nếu đang trong quá trình re-add trong thread này
            if (global.isReAddingUser && global.reAddingThreadID === threadID) {
                return;
            }

            // Kiểm tra nếu người bị kick cũng là người thực hiện kick (tự rời)
            if (kickedBy === kickedUserID) {
                return;
            }
            
            // Lấy tên người bị kick
            let kickedUserName = '';
            try {
                kickedUserName = global.data.userName.get(kickedUserID) || await Users.getNameUser(kickedUserID);
            } catch (error) {
                kickedUserName = 'Thành viên';
            }
            
            // Lưu thông tin kick vào global tracker
            if (!global.kickTracker) {
                global.kickTracker = {
                    recentKicks: new Map(),
                    addKick: function(threadID, userID, userName, kickedBy) {
                        const key = `${threadID}_recent_kick`;
                        const kickInfo = {
                            userID: userID,
                            userName: userName,
                            kickedBy: kickedBy,
                            timestamp: Date.now(),
                            threadID: threadID
                        };
                        this.recentKicks.set(key, kickInfo);
                        
                        // Tự động xóa sau 5 phút
                        setTimeout(() => {
                            if (this.recentKicks.has(key)) {
                                this.recentKicks.delete(key);
                            }
                        }, 5 * 60 * 1000);
                    },
                    getRecentKick: function(threadID) {
                        const key = `${threadID}_recent_kick`;
                        return this.recentKicks.get(key) || null;
                    },
                    clearRecentKick: function(threadID) {
                        const key = `${threadID}_recent_kick`;
                        return this.recentKicks.delete(key);
                    },
                    hasRecentKick: function(threadID) {
                        const key = `${threadID}_recent_kick`;
                        return this.recentKicks.has(key);
                    },
                    getAllRecentKicks: function() {
                        return Array.from(this.recentKicks.entries());
                    }
                };
            }
            
            // Lưu thông tin kick
            global.kickTracker.addKick(threadID, kickedUserID, kickedUserName, kickedBy);
            
        }
    } catch (error) {
        // Silent error handling
    }
};
