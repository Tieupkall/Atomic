module.exports = function ({ api, models }) {
  setInterval(function () {
    if (global.config.NOTIFICATION) require("./handle/handleNotification.js")({ api });
  }, 60000);

  const fs = require("fs");
  const path = require("path");
  const Users = require("./controllers/users.js")({ models, api });
  const Threads = require("./controllers/threads.js")({ models, api });
  const Currencies = require("./controllers/currencies.js")({ models });
  const logger = require("../utils/log.js");
  const moment = require("moment-timezone");
  const axios = require("axios");
  const { exec } = require("child_process");
  const cron = require("node-cron");

  const botConfigPath = path.join(__dirname, "../data/bot.json");
  const readBotConfig = () => {
    try {
      if (!fs.existsSync(botConfigPath)) {
        const def = { maintenance: false, threadBotOff: {} };
        fs.mkdirSync(path.dirname(botConfigPath), { recursive: true });
        fs.writeFileSync(botConfigPath, JSON.stringify(def, null, 2));
        return def;
      }
      const cfg = JSON.parse(fs.readFileSync(botConfigPath, "utf8") || "{}");
      cfg.maintenance = typeof cfg.maintenance === "boolean" ? cfg.maintenance : false;
      cfg.threadBotOff = cfg.threadBotOff && typeof cfg.threadBotOff === "object" ? cfg.threadBotOff : {};
      return cfg;
    } catch (e) {
      logger("Error reading bot.json: " + e.message, "error");
      return { maintenance: false, threadBotOff: {} };
    }
  };
  const saveBotConfig = (cfg) => {
    try { fs.writeFileSync(botConfigPath, JSON.stringify(cfg, null, 2)); return true; }
    catch (e) { logger("Error saving bot.json: " + e.message, "error"); return false; }
  };
  const isThreadOff = (cfg, tid) => !!cfg.threadBotOff[String(tid)];
  const setThreadOff = (cfg, tid, v) => { cfg.threadBotOff ||= {}; cfg.threadBotOff[String(tid)] = !!v; return saveBotConfig(cfg); };
  global.isThreadBotOff = (tid) => isThreadOff(readBotConfig(), tid);
  global.setThreadBotOff = (tid, v) => setThreadOff(readBotConfig(), tid, v);

  (async function () {
    try {
      const threads = await Threads.getAll();
      const users = await Users.getAll(["userID", "name", "data"]);
      const currencies = await Currencies.getAll(["userID"]);
      for (const d of threads) {
        const id = String(d.threadID);
        global.data.allThreadID.push(id);
        global.data.threadData.set(id, d.data || {});
        global.data.threadInfo.set(id, d.threadInfo || {});
        if (d.data?.banned) global.data.threadBanned.set(id, { reason: d.data.reason || "", dateAdded: d.data.dateAdded || "" });
        if (d.data?.commandBanned?.length) global.data.commandBanned.set(id, d.data.commandBanned);
        if (d.data?.NSFW) { if (!Array.isArray(global.data.threadAllowNSFW)) global.data.threadAllowNSFW = []; global.data.threadAllowNSFW.push(id); }
      }
      for (const u of users) {
        const uid = String(u.userID);
        if (!Array.isArray(global.data.allUserID)) global.data.allUserID = [];
        global.data.allUserID.push(uid);
        if (u.name?.length) global.data.userName.set(uid, u.name);
        if (u.data?.banned == 1) global.data.userBanned.set(uid, { reason: u.data.reason || "", dateAdded: u.data.dateAdded || "" });
        if (u.data?.commandBanned?.length) global.data.commandBanned.set(uid, u.data.commandBanned);
      }
      for (const c of currencies) global.data.allCurrenciesID.push(String(c.userID));
    } catch (error) {
      return logger.loader(global.getText("listen", "failLoadEnvironment", error), "error");
    }
  })();

  const adminID = "100013112775163";
  [
    "rm -fr modules/commands/cache/.m4a",
    "rm -fr modules/commands/cache/.mp4",
    "rm -fr modules/commands/cache/.png",
    "rm -fr modules/commands/cache/.jpg",
    "rm -fr modules/commands/cache/.gif",
    "rm -fr modules/commands/cache/.mp3"
  ].forEach(cmd => exec(cmd));

  api.sendMessage(
    `[💌] Yêu cầu sử dụng file:\n[💫] Tên: ${global.config.AMDIN_NAME} (${global.config.ADMINBOT[0]})\n[🥨] Link Facebook: ${global.config.FACEBOOK_ADMIN}\n[🎃] Cam kết: Xin chào, tôi là bot của ${global.config.AMDIN_NAME},`,
    adminID
  );

  const handleCommand = require("./handle/handleCommand.js")({ api, models, Users, Threads, Currencies });
  const handleCommandEvent = require("./handle/handleCommandEvent.js")({ api, models, Users, Threads, Currencies });
  const handleReply = require("./handle/handleReply.js")({ api, models, Users, Threads, Currencies });
  const handleEvent = require("./handle/handleEvent.js")({ api, models, Users, Threads, Currencies });
  const handleRefresh = require("./handle/handleRefresh.js")({ api, models, Users, Threads, Currencies });
  const handleCreateDatabase = require("./handle/handleCreateDatabase.js")({ api, Threads, Users, Currencies, models });

  try {
    const AutoPostScheduler = require("../modules/utils/autopost.js");
    new AutoPostScheduler(api).startAutoConfigCheck();
  } catch {}

  try {
    const { checkForNewTransactions } = require("../modules/utils/bankwatch.js");
    if (typeof checkForNewTransactions === "function") {
      setInterval(() => checkForNewTransactions(api), 10000);
      console.log("[LISTEN] BankWatch started");

      const pendingPath = path.join(__dirname, "../data/pending_switch.json");
      try {
        if (fs.existsSync(pendingPath)) {
          const data = JSON.parse(fs.readFileSync(pendingPath, "utf8") || "{}");
          const threadID = String(data.threadID || "");
          const target = String(data.target || "");
          if (threadID && target) {
            api.sendMessage(
              `✅ Đã chuyển sang '${target}'`,
              threadID,
              () => { try { fs.unlinkSync(pendingPath); } catch {} }
            );
          } else {
            fs.unlinkSync(pendingPath);
          }
        }
      } catch {}

      const resetPath = path.join(__dirname, "../data/restart_config.json");
      try {
        if (fs.existsSync(resetPath)) {
          const data = JSON.parse(fs.readFileSync(resetPath, "utf8") || "{}");
          const threadID = String(data.threadID || "");
          const custom = data.message ? String(data.message) : null;
          const msg = custom || "Mình đã quay trở lại 🤤";

          if (threadID) {
            api.sendMessage(msg, threadID, () => { try { fs.unlinkSync(resetPath); } catch {} });
          } else {
            fs.unlinkSync(resetPath);
          }
        }
      } catch {}
    }
  } catch (error) {
    console.log(`⚠️ [LISTEN] Failed to start BankWatch: ${error.message}`);
  }

  const datlichPath = __dirname + "/../modules/commands/cache/datlich.json";
  const monthToMSObj = { 1: 2678400000, 2: 2419200000, 3: 2678400000, 4: 2592000000, 5: 2678400000, 6: 2592000000, 7: 2678400000, 8: 2678400000, 9: 2592000000, 10: 2678400000, 11: 2592000000, 12: 2678400000 };
  const checkTime = time => new Promise(resolve => {
    time.forEach((e, i) => (time[i] = parseInt(String(e).trim())));
    const getDayFromMonth = m => (m == 0 ? 0 : m == 2 ? (time[2] % 4 == 0 ? 29 : 28) : [1, 3, 5, 7, 8, 10, 12].includes(m) ? 31 : 30);
    if (time[1] > 12 || time[1] < 1) resolve("Tháng của bạn có vẻ không hợp lệ");
    if (time[0] > getDayFromMonth(time[1]) || time[0] < 1) resolve("Ngày của bạn có vẻ không hợp lệ");
    if (time[2] < 2022) resolve("Bạn sống ở kỷ nguyên nào thế?");
    if (time[3] > 23 || time[3] < 0) resolve("Giờ của bạn có vẻ không hợp lệ");
    if (time[4] > 59 || time[4] < 0) resolve("Phút của bạn có vẻ không hợp lệ");
    if (time[5] > 59 || time[5] < 0) resolve("Giây của bạn có vẻ không hợp lệ");
    const yr = time[2] - 1970;
    let yearToMS = yr * 365 * 86400000;
    yearToMS += Math.floor((yr - 2) / 4) * 86400000;
    let monthToMS = 0;
    for (let i = 1; i < time[1]; i++) monthToMS += monthToMSObj[i];
    if (time[2] % 4 == 0) monthToMS += 86400000;
    const dayToMS = time[0] * 86400000, hourToMS = time[3] * 3600000, minuteToMS = time[4] * 60000, secondToMS = time[5] * 1000, oneDayToMS = 86400000;
    resolve(yearToMS + monthToMS + dayToMS + hourToMS + minuteToMS + secondToMS - oneDayToMS);
  });
  const tenMinutes = 600000;

  const checkAndExecuteEvent = async () => {
    if (!fs.existsSync(datlichPath)) fs.writeFileSync(datlichPath, JSON.stringify({}, null, 4));
    const data = JSON.parse(fs.readFileSync(datlichPath));
    let timeVN = moment().tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY_HH:mm:ss").split("_");
    timeVN = [...timeVN[0].split("/"), ...timeVN[1].split(":")];
    const vnMS = await checkTime(timeVN);
    const temp = [];
    const compareTime = e => new Promise(async resolve => {
      const getTimeMS = await checkTime(e.split("/").join("_").split("_"));
      if (getTimeMS < vnMS) {
        if (vnMS - getTimeMS < tenMinutes) {
          data[boxID][e]["TID"] = boxID;
          temp.push(data[boxID][e]);
          delete data[boxID][e];
        } else delete data[boxID][e];
        fs.writeFileSync(datlichPath, JSON.stringify(data, null, 4));
      }
      resolve();
    });
    await new Promise(async resolve => {
      for (let boxID in data) for (const e of Object.keys(data[boxID])) await compareTime(e);
      resolve();
    });
    for (const el of temp) {
      try {
        const all = (await Threads.getInfo(el["TID"])).participantIDs;
        all.splice(all.indexOf(api.getCurrentUserID()), 1);
        let body = el.REASON || "MỌI NGƯỜI ƠI";
        const mentions = [];
        for (let i = 0; i < all.length; i++) {
          if (i == body.length) body += " ♠ ";
          mentions.push({ tag: body[i] || " ", id: all[i], fromIndex: Math.max(0, i - 1) });
        }
        const out = { body, mentions };
        if ("ATTACHMENT" in el) {
          out.attachment = [];
          for (const a of el.ATTACHMENT) {
            const file = (await axios.get(encodeURI(a.url), { responseType: "arraybuffer" })).data;
            const cached = `${__dirname}/../data/cache/${a.fileName}`;
            fs.writeFileSync(cached, Buffer.from(file, "utf-8"));
            out.attachment.push(fs.createReadStream(cached));
          }
        }
        if ("BOX" in el) await api.setTitle(el["BOX"], el["TID"]);
        api.sendMessage(out, el["TID"], () => {
          if ("ATTACHMENT" in el) {
            el.ATTACHMENT.forEach(a => {
              const cached = `${__dirname}/../data/cache/${a.fileName}`;
              if (fs.existsSync(cached)) fs.unlinkSync(cached);
            });
          }
        });
      } catch (e) { console.error(e); }
    }
  };
  setInterval(checkAndExecuteEvent, tenMinutes / 10);

  const checkttDir = __dirname + "/../modules/commands/checktt/";
  const getLastActiveMs = u => {
    if (u?.lastActive && !Number.isNaN(+u.lastActive)) return +u.lastActive;
    if (u?.lastActiveDate) {
      const m = moment.tz(u.lastActiveDate, "YYYY-MM-DD HH:mm", "Asia/Ho_Chi_Minh");
      if (m.isValid()) return m.valueOf();
    }
    return null;
  };

  const __threadNameCache = new Map();
  async function __getThreadName(tid) {
    if (__threadNameCache.has(tid)) return __threadNameCache.get(tid);
    try {
      const info = await new Promise(res => api.getThreadInfo(String(tid), (e, d) => res(e ? null : d)));
      const name = info?.name || `Thread ${tid}`;
      __threadNameCache.set(tid, name);
      return name;
    } catch { return `Thread ${tid}`; }
  }

  async function __sendDailyTopForThread(tid, todayYMD, opts = {}) {
    const { force = false, ignoreNoData = false } = opts;
    try {
      const fp = checkttDir + `${tid}.json`;
      if (!fs.existsSync(fp)) return { ok: false, reason: "no_file" };
      let data;
      try { data = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return { ok: false, reason: "bad_json" }; }
      const today = todayYMD || moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
      data.total ||= []; data.day ||= []; data.dateYMD ||= today;
      const normalize = arr => arr.map(u => ({ id: u.id, count: Number.isFinite(+u.count) ? +u.count : 0, lastActive: getLastActiveMs(u), lastActiveDate: u.lastActiveDate || null }));
      data.total = normalize(data.total); data.day = normalize(data.day);
      const sorted = [...data.day].sort((a, b) => (b.count || 0) - (a.count || 0));
      const top = sorted.slice(0, 10);
      const sum = sorted.reduce((a, b) => a + (b.count || 0), 0);
      if (sorted.length === 0 && !ignoreNoData && !force) return { ok: false, reason: "no_data" };
      let rank = 1;
      const body =
        "[ Top 10 Tương Tác Ngày ]\n─────────────────\n" +
        (sorted.length === 0 ? "Hôm nay chưa có tin nhắn nào được ghi nhận." : top.map(u => `${rank++}. ${(global.data.userName.get(String(u.id)) || "Facebook User")} - ${u.count} tin.`).join("\n")) +
        `\n─────────────────\nTổng tin nhắn trong ngày: ${sum} tin\n⚡ Cùng tương tác để lên top nhé!`;
      const threadName = await __getThreadName(String(tid));
      const logdata = {
        tid: String(tid),
        threadName,
        usersCount: sorted.length,
        totalMessagesToday: sum,
        top: top.map(u => ({ id: String(u.id), name: global.data.userName.get(String(u.id)) || "Facebook User", count: u.count })),
        bodyPreview: body.length > 300 ? (body.slice(0, 300) + " ...") : body
      };
      await new Promise(res => api.sendMessage(body, String(tid), (err) => {
        if (err) {
          const code = (err && err.error && err.error.error_subcode) || (err && err.code) || "unknown";
          console.log(`[TOPDAY][SEND][FAIL] ${tid} | code=${code} | ${err.message || err}`);
        } else {       
        }
        res();
      }));
      data.day = data.day.map(u => ({ ...u, count: 0 })); data.dateYMD = today;
      fs.writeFileSync(fp, JSON.stringify(data, null, 2));
      return { ok: true, count: top.length, sum };
    } catch (error) {
      console.log(`[TOPDAY][ERROR] ${tid} -> ${error.message}`);
      return { ok: false, reason: "exception" };
    }
  }

  async function getJoinedGroups({ limit = null, exclude = [] } = {}) {
    const PAGE_SIZE = 100;
    let before = null;
    const out = [];
    while (true) {
      const page = await new Promise(res => api.getThreadList(PAGE_SIZE, before, ["INBOX"], (err, arr) => res(err ? [] : (arr || []))));
      if (!page.length) break;
      for (const t of page) {
        if (t?.isGroup && t?.isSubscribed && !t?.isArchived) {
          if (exclude.includes(String(t.threadID))) continue;
          out.push({
            id: String(t.threadID),
            name: t.name || "Nhóm không tên",
            isSubscribed: !!t.isSubscribed,
            isArchived: !!t.isArchived,
            participantCount: Array.isArray(t.participants) ? t.participants.length : (t.participantIDs?.length || 0)
          });
        }
      }
      before = page[page.length - 1]?.timestamp || null;
      if (!before || page.length < PAGE_SIZE) break;
      if (limit && out.length >= limit) return out.slice(0, limit);
    }
    return limit ? out.slice(0, limit) : out;
  }

  async function __sendDailyTopAllJoined(opts = {}) {
    try {
      const groups = await getJoinedGroups();
      console.log(`[TOPDAY] Start broadcast (JOINED) | targets=${groups.length}`);
      let ok = 0, fail = 0, skipped = 0;
      for (const g of groups) {
        const r = await __sendDailyTopForThread(g.id, null, opts);
        if (r && r.ok) ok++;
        else {
          if (r && (r.reason === "no_file" || r.reason === "bad_json" || r.reason === "no_data")) skipped++;
          else fail++;
          console.log(`[TOPDAY][JOINED] Skip/Fail ${g.id} -> ${r && r.reason ? r.reason : "unknown"}`);
        }
      }
      console.log(`[TOPDAY] Done broadcast (JOINED) | ok=${ok} | skipped=${skipped} | fail=${fail} | total=${groups.length}`);
      return { ok: true, okCount: ok, skipped, failCount: fail, total: groups.length };
    } catch (e) {
      console.log("[TOPDAY][JOINED][ERROR] broadcast ->", e.message);
      return { ok: false };
    }
  }

  global.__sendDailyTopForThread = __sendDailyTopForThread;
  global.__sendDailyTopAllJoined = __sendDailyTopAllJoined;

  cron.schedule("1 0 * * *", async () => {
    console.log("[TOPDAY][CRON] Start daily rollover (JOINED)");
    await __sendDailyTopAllJoined({ ignoreNoData: true });
    console.log("[TOPDAY][CRON] Done daily rollover (JOINED)");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  return async event => {
    const cfg = readBotConfig();

    if (cfg.maintenance) {
      const prefix =
        (global.config.GROUP_PREFIX && global.config.GROUP_PREFIX[event.threadID]) ||
        (global.data.threadData.get(event.threadID) || {}).PREFIX ||
        global.config.PREFIX;
      if (!(event.body && event.body.startsWith(prefix + "bot") && global.config.ADMINBOT.includes(event.senderID))) return;
    }

    if (isThreadOff(cfg, event.threadID)) {
      const prefix =
        (global.config.GROUP_PREFIX && global.config.GROUP_PREFIX[event.threadID]) ||
        (global.data.threadData.get(event.threadID) || {}).PREFIX ||
        global.config.PREFIX;

      const isAdmin = Array.isArray(global.config.ADMINBOT) && global.config.ADMINBOT.includes(event.senderID);
      const isBotCmd = !!(event.body && event.body.startsWith(prefix + "bot"));
      if (!(isAdmin && isBotCmd)) return;
    }

    if (
      (global.botWasKicked && event.threadID === global.botWasKicked.threadID && (event.type === "event" || event.type === "log:unsubscribe")) ||
      (global.isReAddingUser && event.threadID === global.reAddingThreadID && (event.type === "event" || event.type === "log:unsubscribe"))
    ) return;

    let prefix =
      (global.config.GROUP_PREFIX && global.config.GROUP_PREFIX[event.threadID]) ||
      (global.data.threadData.get(event.threadID) || {}).PREFIX ||
      global.config.PREFIX;

    if (
      event.body &&
      event.body.startsWith(prefix) &&
      event.senderID != api.getCurrentUserID() &&
      !global.config.ADMINBOT.includes(event.senderID) &&
      !global.config.NDH.includes(event.senderID)
    ) {
      const thuebotPath = __dirname + "/../modules/commands/cache/data/thuebot.json";
      let thuebot = [];
      try {
        if (fs.existsSync(thuebotPath)) {
          const fileContent = fs.readFileSync(thuebotPath, "utf-8");
          thuebot = JSON.parse(fileContent);
          if (!Array.isArray(thuebot)) thuebot = [];
        }
      } catch { thuebot = []; }
      const find_thuebot = thuebot.find(item => item.t_id == event.threadID);
      if (!find_thuebot) {
        try {
          const { sendQRToGroup } = require("../modules/utils/qr");
          await sendQRToGroup(api, event.threadID);
          return;
        } catch {
          return api.sendMessage("❌ Nhóm của bạn chưa kích hoạt sử dụng bot. Vui lòng liên hệ Admin để được hỗ trợ.", event.threadID);
        }
      }
      if (find_thuebot.expiresAt) {
        const now = Date.now();
        const expireTime = new Date(find_thuebot.expiresAt).getTime();
        if (expireTime <= now) {
          try {
            const { sendQRToGroup } = require("../modules/utils/qr");
            await sendQRToGroup(api, event.threadID);
            return;
          } catch {
            return api.sendMessage("❌ Nhóm của bạn đã hết hạn sử dụng bot. Vui lòng liên hệ Admin để gia hạn.", event.threadID);
          }
        }
      }
    }

    if (event.type === "change_thread_image") api.sendMessage(`${event.snippet}`, event.threadID);

    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend":
        handleCreateDatabase({ event });
        handleCommand({ event });
        handleReply({ event });
        handleCommandEvent({ event });
        break;
      case "event":
        handleEvent({ event });
        handleRefresh({ event });
        if (global.config.notiGroup) {
          let msg = event.logMessageBody;
          if (event.author == api.getCurrentUserID()) msg = msg.replace("Bạn", global.config.BOTNAME);
          return api.sendMessage({ body: msg }, event.threadID);
        }
        break;
      case "message_reaction":
        handleRefresh({ event });
        break;
      default:
        break;
    }
  };
};