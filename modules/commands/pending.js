const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

module.exports.config = {
  name: "pending",
  version: "3.3.0",
  credits: "Niiozic - nâng cấp bởi Anhh Tu, hợp nhất bởi ChatGPT",
  hasPermssion: 2,
  description: "Quản lý & duyệt tin nhắn chờ & spam + auto cron",
  commandCategory: "Admin",
  usages: "[user|thread|all|spam] | [auto on|off|status] | [debug]",
  cooldowns: 5
};

// từ khóa spam (giữ theo bản của bạn)
const spamKeywords = ["hack", "cheat", "bot", "scam", "xxx", "lừa đảo"];
function isSpamMessage(content) {
  if (!content) return false;
  const lower = String(content).toLowerCase();
  return spamKeywords.some(kw => lower.includes(kw));
}

// alias có thể có của “Spam” tùy fork API
const SPAM_TAGS_ALIASES = [
  "OTHER",
  "SPAM",
  "OTHER_INBOX",
  "MESSAGE_REQUEST_SPAM",
  "MESSAGE_REQUEST_FILTERED"
];

const STATE_PATH = path.join(__dirname, "pending.auto.json");
let cronTask = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch { return { enabled: false, cron: "*/30 * * * *", delayMs: 700, tags: ["OTHER","PENDING"] }; }
}

function writeState(state) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state)); } catch {}
}

// lấy danh sách theo tag (an toàn)
async function getByTags(api, tag) {
  try {
    const list = await api.getThreadList(100, null, [tag]) || [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// HÀM CHÍNH LẤY DS: bạn hỏi “lấy spam kiểu gì gắn vào code trên”
// -> ở đây, nếu truyền "OTHER" sẽ tự mở rộng ra tất cả alias spam ở trên
async function getQueues(api, tags = ["OTHER","PENDING"]) {
  const out = [];
  const seen = new Set();
  let expanded = [];
  for (const t of tags) {
    if (t === "OTHER") expanded.push(...SPAM_TAGS_ALIASES); // điểm mấu chốt
    else expanded.push(t);
  }
  expanded = [...new Set(expanded)];
  for (const tag of expanded) {
    const list = await getByTags(api, tag);
    for (const t of list) {
      if (!seen.has(t.threadID)) { seen.add(t.threadID); out.push(t); }
    }
  }
  return out;
}

// “đánh thức” và duyệt
async function wakeAndApprove(api, thread) {
  return new Promise(resolve => {
    api.sendMessage(".", thread.threadID, () => {
      api.sendMessage(
        thread.isGroup ? "✅ Bot đang kích hoạt trong nhóm. (Tự động duyệt)" : "✅ Bot đã mở hộp thoại với bạn. (Tự động duyệt)",
        thread.threadID,
        () => resolve()
      );
    });
  });
}

// duyệt tất cả theo tags truyền vào
async function approveAll(api, delayMs, tags = ["OTHER","PENDING"]) {
  const list = await getQueues(api, tags);
  if (!list.length) return { ok: 0, fail: 0, total: 0 };
  let ok = 0, fail = 0;
  for (const t of list) {
    try { await wakeAndApprove(api, t); ok++; } catch { fail++; }
    await sleep(delayMs);
  }
  return { ok, fail, total: list.length };
}

// cron
function startCron(api) {
  const st = readState();
  if (cronTask) cronTask.stop();
  cronTask = cron.schedule(st.cron || "*/30 * * * *", async () => {
    try { await approveAll(api, st.delayMs || 700, st.tags || ["OTHER","PENDING"]); } catch {}
  });
  cronTask.start();
}
function stopCron() {
  if (cronTask) { cronTask.stop(); cronTask = null; }
}

// handleReply: giữ phong cách của bạn
module.exports.handleReply = async function ({ api, event, handleReply }) {
  api.unsendMessage(event.messageID);
  if (String(event.senderID) !== String(handleReply.author)) return;

  const { body, threadID, messageID } = event;
  if ((isNaN(body) && body.startsWith("c")) || body.startsWith("cancel")) {
    return api.sendMessage(`❎ Đã huỷ thao tác`, threadID, messageID);
  }

  let count = 0;
  const indexList = body.split(/\s+/);
  for (const singleIndex of indexList) {
    if (isNaN(singleIndex) || singleIndex <= 0 || singleIndex > handleReply.pending.length) {
      return api.sendMessage(`⚠️ Không hợp lệ`, threadID, messageID);
    }
    const target = handleReply.pending[singleIndex - 1];
    try {
      await wakeAndApprove(api, target);
      api.sendMessage(`✅ Đã duyệt: ${target.name || "Người dùng ẩn"}`, threadID, messageID);
      api.sendMessage(`📩 Bot đã duyệt bạn vào danh sách chính`, target.threadID);
      count++;
    } catch {}
  }
  return api.sendMessage(`✅ Duyệt thành công ${count} mục`, threadID, messageID);
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  // lệnh debug để bạn kiểm tra alias spam nằm ở đâu
  if ((args[0] || "").toLowerCase() === "debug") {
    const testTags = ["INBOX", "ARCHIVED", "PENDING", ...SPAM_TAGS_ALIASES];
    let report = [];
    for (const tag of testTags) {
      const list = await getByTags(api, tag);
      report.push(`${tag}: ${list.length}`);
    }
    return api.sendMessage("DEBUG TAGS\n" + report.join("\n"), threadID, messageID);
  }

  // auto on/off/status
  if ((args[0] || "").toLowerCase() === "auto") {
    const st = readState();
    const sub = (args[1] || "").toLowerCase();
    if (sub === "on") {
      st.enabled = true;
      writeState(st);
      startCron(api);
      const r = await approveAll(api, st.delayMs || 700, st.tags || ["OTHER","PENDING"]);
      return api.sendMessage(`⏰ Auto bật. Lịch: ${st.cron}\nChạy ngay: OK ${r.ok}/${r.total}, Fail ${r.fail}`, threadID, messageID);
    }
    if (sub === "off") {
      st.enabled = false;
      writeState(st);
      stopCron();
      return api.sendMessage("⏹️ Auto tắt.", threadID, messageID);
    }
    if (sub === "status" || !sub) {
      const s = readState();
      return api.sendMessage(`Trạng thái: ${s.enabled ? "ON" : "OFF"}\nCron: ${s.cron}\nTags: ${Array.isArray(s.tags)?s.tags.join(","):"OTHER,PENDING"}`, threadID, messageID);
    }
    return api.sendMessage("Dùng: pending auto on|off|status", threadID, messageID);
  }

  // help
  if (!args.length) {
    return api.sendMessage(
      `📌 Cách dùng:\n` +
      `→ ${global.config.PREFIX}pending user       : Xem hàng chờ người dùng (Pending + Spam)\n` +
      `→ ${global.config.PREFIX}pending thread     : Xem hàng chờ nhóm (Pending + Spam)\n` +
      `→ ${global.config.PREFIX}pending all        : Chỉ xem tin nhắn chờ (Pending)\n` +
      `→ ${global.config.PREFIX}pending spam       : Xem tất cả Spam (OTHER + alias)\n` +
      `→ ${global.config.PREFIX}pending spam user  : Chỉ xem Spam từ người dùng\n` +
      `→ ${global.config.PREFIX}pending spam thread: Chỉ xem Spam từ nhóm\n` +
      `→ ${global.config.PREFIX}pending auto on/off/status\n` +
      `→ ${global.config.PREFIX}pending debug      : Kiểm tra số lượng theo từng tag`,
      threadID, messageID
    );
  }

  // lấy danh sách theo yêu cầu
  let listSpam = await getQueues(api, ["OTHER"]);      // SPAM với alias mở rộng
  let listPending = await getQueues(api, ["PENDING"]); // PENDING chuẩn

  const commandName = this.config.name;
  let msg = "", index = 1;

  switch ((args[0] || "").toLowerCase()) {
    case "user":
    case "u": {
      const pendingUsers = listPending.filter(g => !g.isGroup);
      const spamUsers = listSpam.filter(g => !g.isGroup);

      if (pendingUsers.length) {
        msg += "📥 Người dùng trong hàng chờ (PENDING):\n";
        for (const u of pendingUsers) {
          msg += `${index++}. 👤 ${u.name || "Người dùng ẩn"}\n🆔 ${u.threadID}\n`;
          if (isSpamMessage(u.snippet)) msg += `⚠️ Nghi ngờ spam: "${u.snippet}"\n`;
          msg += "\n";
        }
      }
      if (spamUsers.length) {
        msg += "🚫 Người dùng trong SPAM:\n";
        for (const u of spamUsers) {
          msg += `${index++}. 👤 ${u.name || "Người dùng ẩn"}\n🆔 ${u.threadID}\n`;
          if (isSpamMessage(u.snippet)) msg += `⚠️ Nghi ngờ spam: "${u.snippet}"\n`;
          msg += "\n";
        }
      }

      if (msg) {
        return api.sendMessage(
          `${msg}\n📌 Reply số để duyệt`,
          threadID, (err, info) => {
            global.client.handleReply.push({
              name: commandName,
              messageID: info.messageID,
              author: event.senderID,
              pending: [...pendingUsers, ...spamUsers]
            });
          }, messageID
        );
      }
      return api.sendMessage("❎ Không có người dùng nào trong hàng chờ", threadID, messageID);
    }

    case "thread":
    case "t": {
      const pendingThreads = listPending.filter(g => g.isGroup);
      const spamThreads = listSpam.filter(g => g.isGroup);

      if (pendingThreads.length) {
        msg += "📥 Nhóm trong hàng chờ (PENDING):\n";
        for (const g of pendingThreads) {
          msg += `${index++}. 👥 ${g.name}\n🆔 ${g.threadID}\n`;
          if (isSpamMessage(g.snippet)) msg += `⚠️ Nghi ngờ spam: "${g.snippet}"\n`;
          msg += "\n";
        }
      }
      if (spamThreads.length) {
        msg += "🚫 Nhóm trong SPAM:\n";
        for (const g of spamThreads) {
          msg += `${index++}. 👥 ${g.name}\n🆔 ${g.threadID}\n`;
          if (isSpamMessage(g.snippet)) msg += `⚠️ Nghi ngờ spam: "${g.snippet}"\n`;
          msg += "\n";
        }
      }

      if (msg) {
        return api.sendMessage(
          `${msg}\n📌 Reply số để duyệt`,
          threadID, (err, info) => {
            global.client.handleReply.push({
              name: commandName,
              messageID: info.messageID,
              author: event.senderID,
              pending: [...pendingThreads, ...spamThreads]
            });
          }, messageID
        );
      }
      return api.sendMessage("❎ Không có nhóm nào trong hàng chờ", threadID, messageID);
    }

    case "all":
    case "a": {
      const pendingList = listPending;
      if (pendingList.length) {
        msg += "📥 Danh sách tin nhắn chờ (PENDING):\n";
        for (const g of pendingList) {
          msg += `${index++}. ${g.isGroup ? "👥" : "👤"} ${g.name}\n🆔 ${g.threadID}\n`;
          if (isSpamMessage(g.snippet)) msg += `⚠️ Nghi ngờ spam: "${g.snippet}"\n`;
          msg += "\n";
        }
      }

      if (msg) {
        return api.sendMessage(
          `${msg}\n📌 Reply số để duyệt (chỉ PENDING)`,
          threadID, (err, info) => {
            global.client.handleReply.push({
              name: commandName,
              messageID: info.messageID,
              author: event.senderID,
              pending: pendingList
            });
          }, messageID
        );
      }
      return api.sendMessage("❎ Không có tin nhắn nào trong hàng chờ (PENDING)", threadID, messageID);
    }

    case "spam":
    case "s": {
      const type = (args[1] || "all").toLowerCase();
      let list = [];
      if (type === "user") list = listSpam.filter(g => !g.isGroup);
      else if (type === "thread") list = listSpam.filter(g => g.isGroup);
      else list = listSpam;

      if (list.length) {
        msg += `🚫 Danh sách tin nhắn SPAM${type !== "all" ? " - " + type.toUpperCase() : ""}:\n`;
        for (const g of list) {
          msg += `${index++}. ${g.isGroup ? "👥" : "👤"} ${g.name || "Không tên"}\n🆔 ${g.threadID}\n`;
          if (isSpamMessage(g.snippet)) msg += `⚠️ Nghi ngờ spam: "${g.snippet}"\n`;
          msg += "\n";
        }
      }

      if (msg) {
        return api.sendMessage(
          `${msg}\n📌 Reply số để duyệt (SPAM ${type.toUpperCase()})`,
          threadID, (err, info) => {
            global.client.handleReply.push({
              name: commandName,
              messageID: info.messageID,
              author: event.senderID,
              pending: list
            });
          }, messageID
        );
      }
      return api.sendMessage(`❎ Không có tin nhắn nào trong SPAM (${type})`, threadID, messageID);
    }

    default:
      return api.sendMessage("⚠️ Sai cú pháp, vui lòng dùng: user / thread / all / spam | auto on|off|status | debug", threadID, messageID);
  }
};

module.exports.onLoad = ({ api }) => {
  const st = readState();
  if (st.enabled) startCron(api);
};