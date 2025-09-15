module.exports.config = {
    name: "autoban",
    eventType: ["message", "message_reply"],
    version: "1.0.0", 
    credits: "atomic",
    description: "Tự động ban người dùng vi phạm"
};

module.exports.run = async function({ api, event, Users, Threads, Currencies }) {
  const { threadID, messageID, body } = event;
  const senderID = event.senderID || event.author || event.userID;

  // Bỏ qua nếu không có senderID hoặc là bot
  if (!senderID || senderID === api.getCurrentUserID()) return;

  // Bỏ qua xử lý nếu bot vừa bị kick
  if (global.botWasKicked && global.botWasKicked.threadID === threadID) {
    console.log('[AutoBan] Skipping autoban - bot was kicked in thread:', threadID);
    return;
  }

  // Bỏ qua xử lý nếu đang trong quá trình re-add user
  if (global.isReAddingUser && global.reAddingThreadID === threadID) {
    console.log('[AutoBan] Skipping autoban during re-add process in thread:', threadID);
    return;
  }
}