module.exports.config = {
  name: "logMessage",
  eventType: ["message"],
  version: "1.0",
  credits: "bùi ngọc anh",
  description: "Ghi log tin nhắn văn bản trong nhóm"
};

module.exports.run = async function({ event }) {
  console.debug("[🧪 DEBUG] logMessage.js đã được gọi!");
  
  if (!event.body) {
    console.debug("[🧪 DEBUG] Không có nội dung tin nhắn để log.");
    return;
  }

  console.log(`[📨 MSG] [${event.threadID}] ${event.senderID}: ${event.body}`);
};