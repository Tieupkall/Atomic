module.exports.config = {
  name: "info",
  version: "1.5.0",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Lấy thông tin",
  commandCategory: "Tiện ích",
  usages: "reply/tag/@mention/[uid]",
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
  const axios = require("axios");
  const fs = require("fs");
  const path = require("path");
  const { threadID, messageID, messageReply, mentions } = event;

  const accPath = path.join(__dirname, "../../includes/login/acc.json");
  let USER_TOKEN = "";
  try {
    const accData = JSON.parse(fs.readFileSync(accPath, "utf8"));
    const current = accData.current_account;
    if (accData.accounts[current]?.EAAD6V7) USER_TOKEN = accData.accounts[current].EAAD6V7;
  } catch {
    return api.sendMessage("Không đọc được token từ acc.json", threadID, messageID);
  }

  const APP_TOKEN = "6628568379|c1e620fa708a1d5696fb991c1bde5662";

  const pickUID = () => {
    if (messageReply?.senderID) return String(messageReply.senderID);
    const keys = mentions ? Object.keys(mentions) : [];
    if (keys.length) return String(keys[0]);
    if (args[0] && /^\d{5,}$/.test(args[0])) return String(args[0]);
    return null;
  };

  const uid = pickUID();
  if (!uid) return api.sendMessage("Vui lòng reply, tag hoặc nhập UID.", threadID, messageID);

  let map;
  try { map = await api.getUserInfo(uid); }
  catch { return api.sendMessage("Không thể lấy thông tin từ getUserInfo.", threadID, messageID); }

  const raw = (map && map[uid]) || {};
  const genderStr = typeof raw.gender === "number" ? (raw.gender === 2 ? "Nam" : raw.gender === 1 ? "Nữ" : "Không rõ") : (raw.gender || "Không rõ");

  let hometown = "Không rõ", location = "Không rõ", birthday = "Không rõ", website = "Không rõ", coverUrl = null;
  if (USER_TOKEN) {
    try {
      const r = await axios.get(`https://graph.facebook.com/v19.0/${uid}`, {
        params: { fields: "hometown,location,birthday,website,cover", access_token: USER_TOKEN },
        timeout: 10000
      });
      if (r.data?.hometown?.name) hometown = r.data.hometown.name;
      if (r.data?.location?.name) location = r.data.location.name;
      if (r.data?.birthday) birthday = r.data.birthday;
      if (r.data?.website) website = Array.isArray(r.data.website) ? r.data.website.join(", ") : String(r.data.website);
      if (r.data?.cover?.source) coverUrl = r.data.cover.source;
    } catch {}
  }

  const body = [
    `👤 ${raw.name || "Không rõ"}`,
    `🆔 UID: ${uid}`,
    `🔗 Profile: ${raw.profileUrl || `https://facebook.com/${uid}`}`,
    raw.vanity ? `✨ Vanity: ${raw.vanity}` : "",
    raw.type ? `📌 Type: ${raw.type}` : "",
    `⚧ Giới tính: ${genderStr}`,
    `👥 Bạn bè: ${raw.isFriend ? "Có" : "Không"}`,
    `🎂 Birthday: ${birthday}`,
    `🏡 Quê quán: ${hometown}`,
    `📍 Nơi ở hiện tại: ${location}`,
    `🌐 Website: ${website}`
  ].filter(Boolean).join("\n");

  const attachments = [];
  try {
    const avatarUrl = `https://graph.facebook.com/${uid}/picture?height=720&width=720&access_token=${APP_TOKEN}`;
    const a = await axios.get(avatarUrl, { responseType: "stream", maxRedirects: 5, timeout: 10000 });
    attachments.push(a.data);
  } catch {}

  if (coverUrl) {
    try {
      const c = await axios.get(coverUrl, { responseType: "stream", timeout: 10000 });
      attachments.push(c.data);
    } catch {}
  }

  if (attachments.length) return api.sendMessage({ body, attachment: attachments }, threadID, messageID);
  return api.sendMessage(body, threadID, messageID);
};