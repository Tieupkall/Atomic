const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");

module.exports.config = {
  name: "package",
  version: "1.1.2",
  hasPermssion: 2,
  credits: "Atomic",
  description: "Gỡ npm package bằng menu số",
  commandCategory: "system",
  usages: "",
  cooldowns: 5
};

let pendingMenus = {};

function readList() {
  const p = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(p)) return null;
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  return [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
}

function showMenu(api, threadID, messageID) {
  const list = readList();
  if (!list) return api.sendMessage("❌ Không tìm thấy package.json", threadID, messageID);
  if (list.length === 0) return api.sendMessage("📦 Không còn package nào để uninstall!", threadID, messageID);
  let msg = "📦 Danh sách package:\n\n";
  list.forEach((p, i) => (msg += `${i + 1}. ${p}\n`));
  msg += "\n👉 Gõ số để gỡ | Gõ nhiều số (vd: 1 5 8 hoặc 1,5,8)\n👉 Gõ 0 để thoát";
  pendingMenus[threadID] = list;
  api.sendMessage(msg, threadID, messageID);
}

function execAsync(cmd) {
  return new Promise(r => exec(cmd, (err, stdout, stderr) => r({ err, stdout, stderr })));
}

module.exports.run = async ({ api, event }) => showMenu(api, event.threadID, event.messageID);

module.exports.handleEvent = async ({ api, event }) => {
  const { threadID, messageID, body } = event;
  const list = pendingMenus[threadID];
  if (!list) return;
  if (!/^\s*\d+(?:[,\s]+\d+)*\s*$/.test(body)) return;
  const tokens = body.split(/[,\s]+/).filter(Boolean);
  if (tokens.length === 1 && tokens[0] === "0") {
    delete pendingMenus[threadID];
    return api.sendMessage("✅ Đã thoát menu uninstall.", threadID, messageID);
  }
  const idxs = [...new Set(tokens.map(t => parseInt(t, 10)).filter(n => n >= 1 && n <= list.length))];
  if (idxs.length === 0) return api.sendMessage("❌ Vui lòng nhập số hợp lệ.", threadID, messageID);
  const names = idxs.map(n => list[n - 1]);
  api.sendMessage(`🔄 Đang gỡ: ${names.join(", ")}`, threadID, messageID);
  let ok = [], fail = [];
  for (const name of names) {
    const { err, stderr } = await execAsync(`npm uninstall ${name}`);
    if (err) fail.push(`${name} (${(stderr || "").trim().split("\n").slice(-1)[0] || "error"})`);
    else ok.push(name);
  }
  let report = `✅ Thành công: ${ok.length}${ok.length ? `\n• ${ok.join(", ")}` : ""}\n❌ Thất bại: ${fail.length}${fail.length ? `\n• ${fail.join("\n• ")}` : ""}`;
  api.sendMessage(report, threadID, () => showMenu(api, threadID, messageID));
};