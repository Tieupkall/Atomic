module.exports.config = {
  name: "uid",
  version: "1.1.8",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Lấy UID người dùng/tag/reply",
  commandCategory: "Tiện ích",
  usages: "uid (tag hoặc reply nếu muốn)",
  cooldowns: 3
};

function getTargetID(event) {
  if (event.mentions && Object.keys(event.mentions).length > 0) return Object.keys(event.mentions)[0];
  if (event.type === "message_reply" && event.messageReply && event.messageReply.senderID) return event.messageReply.senderID;
  return event.senderID;
}

module.exports.run = async function ({ api, event }) {
  try {
    const targetID = getTargetID(event);
    return api.sendMessage(String(targetID), event.threadID);
  } catch {
    return api.sendMessage("❌ Lỗi khi lấy UID!", event.threadID);
  }
};