const fs = require("fs-extra");
const path = require("path");
const pathData = path.join(__dirname, "../commands/antibd/antinickname.json");

module.exports.config = {
  name: "antibd",
  version: "1.4.1",
  credits: "Atomic",
  description: "Bật/tắt hoặc cập nhật biệt danh thành viên",
  usages: "[on | off | update]",
  hasPrefix: false,
  commandCategory: "Quản Trị Viên",
  cooldowns: 5
};

module.exports.run = async function ({ event, api, args }) {
  const { threadID } = event;
  const type = args[0];

  let antiData = [];
  try {
    antiData = await fs.readJSON(pathData);
    if (!Array.isArray(antiData)) antiData = [];
  } catch {
    antiData = [];
  }

  const findIndex = antiData.findIndex(e => e.threadID === threadID);
  const threadEntry = antiData[findIndex] || { threadID, data: {} };

  // Lấy dữ liệu nhóm
  let threadInfo;
  try {
    threadInfo = await api.getThreadInfo(threadID);
  } catch (err) {
    return api.sendMessage(`❌ Không thể lấy thông tin nhóm: ${err.message}`, threadID);
  }

  const participantIDs = threadInfo.participantIDs || [];
  const rawNicknames = threadInfo.nicknames || {};
  const filteredNicknames = {};

  for (const [uid, nick] of Object.entries(rawNicknames)) {
    if (participantIDs.includes(uid)) {
      filteredNicknames[uid] = nick;
    }
  }

  // Các lệnh
  if (type === "on") {
    if (findIndex !== -1)
      return api.sendMessage("✅ Nhóm này đã bật antibd từ trước.", threadID);

    threadEntry.data = filteredNicknames;
    antiData.push(threadEntry);
    await fs.writeJSON(pathData, antiData, { spaces: 2 });
    return api.sendMessage("✅ Đã bật antibd và lưu biệt danh của thành viên còn trong nhóm!", threadID);
  }

  if (type === "off") {
    if (findIndex === -1)
      return api.sendMessage("⚠️ Nhóm này chưa bật antibd.", threadID);

    antiData.splice(findIndex, 1);
    await fs.writeJSON(pathData, antiData, { spaces: 2 });
    return api.sendMessage("✅ Đã tắt antibd và xoá dữ liệu biệt danh của nhóm.", threadID);
  }

  if (type === "update") {
    if (findIndex === -1)
      return api.sendMessage("⚠️ Nhóm này chưa bật antibd. Dùng `antibd on` trước.", threadID);

    threadEntry.data = filteredNicknames;
    antiData[findIndex] = threadEntry;
    await fs.writeJSON(pathData, antiData, { spaces: 2 });
    return api.sendMessage("✅ Đã cập nhật biệt danh hiện tại của thành viên đang còn trong nhóm.", threadID);
  }

  return api.sendMessage(`❌ Sai cú pháp. Dùng:\n→ antibd on\n→ antibd off\n→ antibd update`, threadID);
};