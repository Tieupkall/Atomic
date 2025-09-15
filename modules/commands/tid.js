const { wrap } = require('a-comic');

module.exports.config = {
  name: "tid",
  version: "1.0.7",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Lấy Thread ID của nhóm/cuộc trò chuyện hiện tại",
  commandCategory: "Tiện ích",
  usages: "tid",
  cooldowns: 3
};

function resolvePrefix(threadID) {
  const cfg = global.config || {};
  const map = cfg.GROUP_PREFIX || {};
  if (map && map[threadID]) return map[threadID];
  return (typeof cfg.PREFIX === "string" && cfg.PREFIX) ? cfg.PREFIX : "/";
}

async function realRun({ api, event }) {
  const text = (event.body || "").trim();
  if (!text) return;
  const prefix = resolvePrefix(event.threadID);
  const re = new RegExp(`^(?:tid|${escapeRegExp(prefix)}tid)(\\b|\\s|$)`, "i");
  if (!re.test(text)) return;
  return api.sendMessage(String(event.threadID), event.threadID);
}

module.exports.run = realRun;

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }