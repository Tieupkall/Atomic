module.exports.config = {
  name: "tucam",
  eventType: ["message", "message_reply"],
  version: "1.1.0",
  credits: "Atomic",
  description: "Kick khi phân biệt vùng miền, chửi bot hoặc chửi admin"
};

const regionWords = [
  "bắc kỳ","bac ky","pảkky","pảky","parky","parkyyy",
  "nam kỳ","nam kì","namky","namki","namkiii",
  "trung kỳ","trung ky","trungkiii","trungky"
];

const insultBotWords = [
  "bot ngu","bot lồn","bot óc chó","botoccho","botngu"
];

const insultAdminWords = [
  "admin ngu","admin óc","chó admin", "admin lồn", "admin ngu vl"
];

function matchAny(text, list) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  for (const w of list) {
    const safe = w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${safe}([^\\p{L}\\p{N}]|$)`, "iu");
    if (re.test(lower)) return true;
  }
  return false;
}

function isInsultingBot(text, event, botID) {
  if (!text) return false;
  if (!matchAny(text, insultBotWords)) return false;
  const lower = text.toLowerCase();
  const mentionsBot = !!(event?.mentions && Object.keys(event.mentions).some(k => String(k) === String(botID)));
  const hasWordBot = /\bbot\b/i.test(lower);
  return mentionsBot || hasWordBot;
}

function isInsultingAdmin(text, event, threadInfo) {
  if (!text || !threadInfo?.adminIDs) return false;
  if (!matchAny(text, insultAdminWords)) return false;
  if (!event?.mentions) return false;
  const adminIDs = threadInfo.adminIDs.map(a => String(a?.id));
  const mentionedIDs = Object.keys(event.mentions).map(k => String(k));
  return mentionedIDs.some(id => adminIDs.includes(id));
}

module.exports.run = async function ({ api, event }) {
  try {
    const threadID = String(event.threadID || "");
    const senderID = String(event.senderID || "");
    if (!threadID || !senderID) return;

    const botID = String(api.getCurrentUserID ? api.getCurrentUserID() : "");
    if (senderID === botID) return;
    if (global.config?.ADMINBOT?.includes(senderID)) return;

    const text = typeof event.body === "string" ? event.body : "";
    const regionViolation = matchAny(text, regionWords);
    const insultBotViolation = isInsultingBot(text, event, botID);

    let threadInfo;
    try {
      threadInfo = await api.getThreadInfo(threadID);
    } catch (err) {
      console.error("[TuCam] getThreadInfo error:", err);
      return;
    }
    if (!threadInfo || !Array.isArray(threadInfo.adminIDs)) return;

    const insultAdminViolation = isInsultingAdmin(text, event, threadInfo);
    if (!regionViolation && !insultBotViolation && !insultAdminViolation) return;

    const botIsAdmin = threadInfo.adminIDs.some(a => String(a?.id) === botID);
    if (!botIsAdmin) {
      api.sendMessage("❌ Bot không phải QTV, không thể kick người vi phạm.", threadID);
      return;
    }

    const senderIsAdmin = threadInfo.adminIDs.some(a => String(a?.id) === senderID);
    if (senderIsAdmin) {
      api.sendMessage("⚠️ Người này là QTV, không thể kick.", threadID);
      return;
    }

    let reasonText = "vi phạm";
    if (insultBotViolation) reasonText = "chửi bot";
    else if (insultAdminViolation) reasonText = "chửi admin";
    else if (regionViolation) reasonText = "phát ngôn phân biệt vùng miền";

    try {
      await api.removeUserFromGroup(senderID, threadID);
      api.sendMessage(`🚫 Đã kick ${senderID} vì ${reasonText}.`, threadID);
    } catch (err) {
      console.error("[TuCam] Kick error:", err);
      api.sendMessage("⚠️ Lỗi khi kick người dùng, vui lòng kiểm tra lại.", threadID);
    }
  } catch (e) {
    console.error("[TuCam] Runtime error:", e);
  }
};