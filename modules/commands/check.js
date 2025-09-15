const fs = require("fs-extra");
const moment = require("moment-timezone");
const schedule = require("node-schedule");

const DATA_DIR = __dirname + "/checktt/";
const pending = new Map();

module.exports.config = {
  name: "check",
  version: "2.5.0",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Check tương tác (all/day/week/list/reset)",
  commandCategory: "Thành Viên",
  usages: "[all|day|week|list|reset]",
  cooldowns: 0
};

const SEP = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";
const tzNow = () => moment.tz("Asia/Ho_Chi_Minh");
const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const dataPath = tid => (ensureDir(DATA_DIR), DATA_DIR + tid + ".json");
const sumCounts = list => list.reduce((a, b) => a + (b.count || 0), 0);

const getLastActiveMs = u => {
  if (u?.lastActive && !Number.isNaN(+u.lastActive)) return +u.lastActive;
  if (u?.lastActiveDate) {
    const m = moment.tz(u.lastActiveDate, "YYYY-MM-DD HH:mm", "Asia/Ho_Chi_Minh");
    if (m.isValid()) return m.valueOf();
  }
  return null;
};
const daysSinceUser = u => {
  const ms = getLastActiveMs(u);
  if (!ms) return Infinity;
  return Math.floor(moment.duration(tzNow().diff(moment(ms).tz("Asia/Ho_Chi_Minh"))).asDays());
};

function normalizeData(data, memberIDs) {
  const now = tzNow();
  data.total ??= []; data.week ??= []; data.day ??= [];
  data.dateYMD ??= now.format("YYYY-MM-DD");
  data.weekAnchor ??= now.clone().startOf("day").day(0).format("YYYY-MM-DD");
  const clean = arr => arr.filter(u => memberIDs.includes(u.id));
  data.total = clean(data.total); data.week = clean(data.week); data.day = clean(data.day);
  const addMissing = id => {
    const add = arr => { if (!arr.find(u => u.id === id)) arr.push({ id, count: 0, lastActive: null, lastActiveDate: null }); };
    add(data.total); add(data.week); add(data.day);
  };
  for (const id of memberIDs) addMissing(id);
  const patch = u => { u.lastActive ??= null; u.lastActiveDate ??= null; return u; };
  data.total.forEach(patch); data.week.forEach(patch); data.day.forEach(patch);
  return data;
}

function rolloverIfNeeded(data) {
  const now = tzNow();
  const today = now.format("YYYY-MM-DD");
  const currentSunday = now.clone().startOf("day").day(0).format("YYYY-MM-DD");
  if (data.dateYMD !== today) {
    data.day = data.day.map(u => ({ ...u, count: 0 }));
    data.dateYMD = today;
  }
  if (data.weekAnchor !== currentSunday) {
    data.week = data.week.map(u => ({ ...u, count: 0 }));
    data.weekAnchor = currentSunday;
  }
  return data;
}

async function renderBoard({ api, Users, threadID, messageID, senderID, listAll, title, totalLabel, withInactive }) {
  const sortByCountDesc = arr => arr.sort((a,b) => (b.count||0) - (a.count||0));
  const list = listAll.slice();
  const totalMsgs = sumCounts(list).toLocaleString();
  let active = list, over3 = [];
  if (withInactive) {
    active = list.filter(u => daysSinceUser(u) < 3);
    over3  = list.filter(u => daysSinceUser(u) >= 3);
  }
  sortByCountDesc(active); sortByCountDesc(over3);
  const linesActive = await Promise.all(active.map(async (u, i) => {
    const name = await Users.getNameUser(u.id) || "Không tên";
    return `${i+1}. ${name} - ${u.count.toLocaleString()} tin nhắn`;
  }));
  const youIdx = active.findIndex(u => u.id === senderID);
  const yourCount = youIdx >= 0 ? (active[youIdx].count || 0) : 0;
  const yourName = await Users.getNameUser(senderID) || "Bạn";
  let msg = `📊 BẢNG XẾP HẠNG TƯƠNG TÁC - ${title}\n${SEP}\n\n` +
            (linesActive.length ? linesActive.join("\n\n") : "Chưa có ai hoạt động.") +
            `\n\n💬 Tổng tin nhắn ${totalLabel}: ${totalMsgs}\n${SEP}`;
  if (withInactive && over3.length) {
    const startIndex = active.length;
    const linesOver = await Promise.all(over3.map(async (u, i) => {
      const name = await Users.getNameUser(u.id) || "Không tên";
      const ms = getLastActiveMs(u);
      if (!ms) return `${startIndex + i + 1}. ${name} — ${u.count.toLocaleString()} tin — lần cuối: chưa tương tác`;
      const dt = moment(ms).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm");
      return `${startIndex + i + 1}. ${name} — ${u.count.toLocaleString()} tin — lần cuối: ${dt} (${daysSinceUser(u)} ngày)`;
    }));
    msg += `\n😴 Không tương tác ≥ 3 ngày (${over3.length}):\n\n` + linesOver.join("\n") + `\n${SEP}`;
    return api.sendMessage(
      msg + `\n🏅 ${yourName} đang đứng hạng ${youIdx >= 0 ? (youIdx + 1) : "—"} với ${yourCount.toLocaleString()} tin nhắn.\n\n` +
      `🧩 HƯỚNG DẪN (Admin box + Admin bot):\n` +
      `• Reply "del" → Kick TẤT CẢ người không tương tác ≥ 3 ngày\n` +
      `• Reply "3 5 8" (hoặc "3,5,8") → Kick theo 'số thứ tự' trong danh sách ≥ 3 ngày (bỏ qua admin/bot)`,
      threadID,
      (err, info) => {
        if (err) return;
        pending.set(String(threadID), {
          msgID: info.messageID,
          over3: over3.map(u => u.id),
          startIndex,
          at: Date.now()
        });
        setTimeout(() => {
          const p = pending.get(String(threadID));
          if (p && Date.now() - p.at >= 10*60*1000) pending.delete(String(threadID));
        }, 10*60*1000);
      },
      messageID
    );
  } else if (withInactive && !over3.length) {
    msg += `\n😎 Không có ai vắng mặt ≥ 3 ngày.\n${SEP}`;
  }
  return api.sendMessage(
    msg + `\n🏅 ${yourName} đang đứng hạng ${youIdx >= 0 ? (youIdx + 1) : "—"} với ${yourCount.toLocaleString()} tin nhắn.`,
    threadID,
    undefined,
    messageID
  );
}

module.exports.run = async function({ api, event, args, Users }) {
  const { threadID } = event;
  const query = (args && args[0] || "all").toLowerCase();
  const fp = dataPath(threadID);
  const reply = m => api.sendMessage(m, threadID, undefined, event.messageID);
  if (!fs.existsSync(fp)) return reply("❎ Nhóm này chưa có dữ liệu tương tác.");
  const raw = JSON.parse(fs.readFileSync(fp));
  const info = await api.getThreadInfo(threadID);
  const memberIDs = info.participantIDs || [];
  let data = normalizeData(raw, memberIDs);
  data = rolloverIfNeeded(data);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));

  if (query === "all") {
    return renderBoard({
      api, Users,
      threadID, messageID: event.messageID, senderID: event.senderID,
      listAll: data.total, title: "All", totalLabel: "tổng", withInactive: true
    });
  }
  if (query === "day") {
    const nonZero = data.day.filter(u => u.count > 0);
    return renderBoard({
      api, Users,
      threadID, messageID: event.messageID, senderID: event.senderID,
      listAll: nonZero.length ? nonZero : data.day, title: "Day", totalLabel: "trong ngày", withInactive: false
    });
  }
  if (query === "week") {
    const nonZero = data.week.filter(u => u.count > 0);
    return renderBoard({
      api, Users,
      threadID, messageID: event.messageID, senderID: event.senderID,
      listAll: nonZero.length ? nonZero : data.week, title: "Week", totalLabel: "trong tuần", withInactive: false
    });
  }
  if (query === "list") {
    const isGroupAdmin = info.adminIDs?.some(a => String(a.id) === String(event.senderID));
    const isGlobalAdmin = (global.config.ADMINBOT || []).map(String).includes(String(event.senderID));
    if (!(isGroupAdmin || isGlobalAdmin)) return reply("❎ Chỉ quản trị viên box hoặc admin bot được dùng lệnh này.");
    const threads = await api.getThreadList(100, null, ["INBOX"]);
    const groups = threads.filter(t => t.isGroup);
    const items = await Promise.all(groups.map(async (t, i) => {
      const f = dataPath(t.threadID);
      let total = 0;
      if (fs.existsSync(f)) {
        const d = JSON.parse(fs.readFileSync(f));
        total = sumCounts(d.total || []);
      }
      return `${i+1}. ${t.name || "Không xác định"}\n🆔 ${t.threadID}\n   💬 Tổng tin nhắn: ${total.toLocaleString()}`;
    }));
    return reply("📋 DANH SÁCH NHÓM BOT ĐANG Ở\n" + SEP + "\n\n" + items.join("\n\n"));
  }
  if (query === "reset") {
    const isGroupAdmin = info.adminIDs?.some(a => String(a.id) === String(event.senderID));
    const isGlobalAdmin = (global.config.ADMINBOT || []).map(String).includes(String(event.senderID));
    if (!(isGroupAdmin || isGlobalAdmin)) return reply("❎ Chỉ quản trị viên box hoặc admin bot được dùng lệnh này.");
    const now = tzNow();
    const today = now.format("YYYY-MM-DD");
    const sunday = now.clone().startOf("day").day(0).format("YYYY-MM-DD");
    const memberIDs2 = info.participantIDs || [];
    const obj = { total: [], week: [], day: [], dateYMD: today, weekAnchor: sunday };
    for (const id of memberIDs2) {
      const base = { id, count: 0, lastActive: null, lastActiveDate: null };
      obj.total.push({ ...base }); obj.week.push({ ...base }); obj.day.push({ ...base });
    }
    fs.writeFileSync(fp, JSON.stringify(obj, null, 2));
    return reply("✅ Đã reset dữ liệu cho nhóm này.");
  }
  return reply("❓ Dùng lệnh: check all | check day | check week | check list | check reset");
};

module.exports.handleEvent = async function({ api, event }) {
  const { threadID, senderID, type, messageReply, body } = event || {};
  if (!senderID || !threadID) return;

  if (type === "message_reply" && messageReply?.messageID) {
    const sess = pending.get(String(threadID));
    if (sess && sess.msgID === messageReply.messageID) {
      try {
        const info = await api.getThreadInfo(threadID);
        const isGroupAdmin = info.adminIDs?.some(a => String(a.id) === String(senderID));
        const isGlobalAdmin = (global.config.ADMINBOT || []).map(String).includes(String(senderID));
        if (!(isGroupAdmin || isGlobalAdmin)) return api.sendMessage("❎ Chỉ quản trị viên box hoặc admin bot mới dùng chức năng này.", threadID);
        const botID = String(api.getCurrentUserID());
        const adminSet = new Set(info.adminIDs.map(a => String(a.id)));
        for (const gid of (global.config.ADMINBOT || []).map(String)) adminSet.add(gid);
        if (!adminSet.has(botID)) return api.sendMessage("❎ Bot không có quyền quản trị viên để kick thành viên.", threadID);
        const parseIdx = s => (String(s).match(/\d+/g) || []).map(x => parseInt(x, 10)).filter(n => n >= 1);
        const cmd = (body || "").trim().toLowerCase();
        let targets = [];
        if (cmd === "del") {
          targets = sess.over3.slice();
        } else {
          const idxs = parseIdx(cmd);
          for (const n of idxs) {
            const i = n - sess.startIndex - 1;
            if (i >= 0 && i < sess.over3.length) targets.push(sess.over3[i]);
          }
        }
        if (!targets.length) return api.sendMessage("ℹ️ Không có mục nào để xoá.", threadID);
        let ok = 0, skip = 0, fail = 0;
        for (const uid of targets) {
          if (!uid || uid === botID || adminSet.has(String(uid))) { skip++; continue; }
          try { await api.removeUserFromGroup(uid, threadID); ok++; }
          catch { fail++; }
        }
        api.sendMessage(`🧹 Xong: kick ${ok} • bỏ qua ${skip} (admin/bot) • lỗi ${fail}`, threadID);
      } catch {}
      return;
    }
  }

  const fp = dataPath(threadID);
  const nowMs = Date.now();
  const nowStr = moment(nowMs).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm");

  try {
    const info = await api.getThreadInfo(threadID);
    const memberIDs = info.participantIDs || [];
    let data = fs.existsSync(fp)
      ? JSON.parse(fs.readFileSync(fp))
      : { total: [], week: [], day: [], dateYMD: tzNow().format("YYYY-MM-DD"), weekAnchor: tzNow().clone().startOf("day").day(0).format("YYYY-MM-DD") };
    data = normalizeData(data, memberIDs);
    data = rolloverIfNeeded(data);
    const bump = arr => {
      const i = arr.findIndex(u => u.id == senderID);
      if (i === -1) arr.push({ id: senderID, count: 1, lastActive: nowMs, lastActiveDate: nowStr });
      else { arr[i].count++; arr[i].lastActive = nowMs; arr[i].lastActiveDate = nowStr; }
    };
    bump(data.total); bump(data.week); bump(data.day);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  } catch {}
};

function resetDayForAll() {
  ensureDir(DATA_DIR);
  const today = tzNow().format("YYYY-MM-DD");
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".json")) continue;
    const fp = DATA_DIR + file;
    try {
      const data = JSON.parse(fs.readFileSync(fp));
      if (Array.isArray(data.day)) data.day = data.day.map(u => ({ ...u, count: 0 }));
      data.dateYMD = today;
      fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    } catch {}
  }
}

function resetWeekForAll() {
  ensureDir(DATA_DIR);
  const sunday = tzNow().clone().startOf("day").day(0).format("YYYY-MM-DD");
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".json")) continue;
    const fp = DATA_DIR + file;
    try {
      const data = JSON.parse(fs.readFileSync(fp));
      if (Array.isArray(data.week)) data.week = data.week.map(u => ({ ...u, count: 0 }));
      data.weekAnchor = sunday;
      fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    } catch {}
  }
}

schedule.scheduleJob("0 0 * * *", resetDayForAll);
schedule.scheduleJob("0 0 * * 0", resetWeekForAll);