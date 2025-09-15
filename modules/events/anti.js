const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const restoreInProgress = new Set();
const lastBackupTime = new Map();

module.exports.config = {
  name: "anti",
  eventType: ["log:thread-color","log:thread-name","log:thread-icon","log:thread-emoji","log:subscribe","log:thread-admins","log:unsubscribe"],
  version: "1.4.1",
  credits: "Atomic",
  description: "Chống đổi theme, tên nhóm, emoji, ảnh nhóm, chống thay đổi QTV, chống out chùa"
};

const CONFIG_PATH = path.join(__dirname, '../../data/anti/anti.json');
const WARN_PATH = path.join(__dirname, '../../data/anti/warn.json');
const BACKUP_DIR = path.join(__dirname, '../../data/backup_images');

const loadJSON = async (p, d={}) => { await fs.ensureFile(p); try { return await fs.readJson(p); } catch { return d; } };
const saveJSON = (p, v) => fs.writeJson(p, v, { spaces: 2 });
const sendTemp = (api, tid, body, ms=30000) => new Promise(r=>api.sendMessage(body, tid, (e, info)=>{ if(!e&&info&&ms>0) setTimeout(()=>api.unsendMessage(info.messageID).catch(()=>{}), ms); r(info); }));
const isAdminBot = (id) => Array.isArray(global.config?.ADMINBOT) && global.config.ADMINBOT.includes(id);
const take = (o, keys) => { for (const k of keys) if (o?.[k]) return o[k]; return null; };

module.exports.onLoad = async function({ api }) {
  const config = await loadJSON(CONFIG_PATH, {});
  const warnings = await loadJSON(WARN_PATH, {});
  if (global.mqttEventEmitter) {
    global.mqttEventEmitter.on('thread_image_change', async (e) => { try { await handleImageChange(e, api, config, warnings); } catch {} });
  }
  await saveJSON(CONFIG_PATH, config);
  await saveJSON(WARN_PATH, warnings);
};

async function handleImageChange(eventData, api, config, warnings) {
  const tid = eventData.threadID;
  if (!config[tid]?.enabled || !config[tid].protectImage) return;

  const author = eventData.author || eventData.logMessageData?.changed_by;
  const botID = api.getCurrentUserID?.() || global.botID;
  if (author === botID) return;
  if (eventData.isRestoring || restoreInProgress.has(tid)) return;

  const ti = await api.getThreadInfo(tid);
  const isGroupAdmin = ti.adminIDs.some(x => x.id == author);
  const adminBot = isAdminBot(author);
  const backupPath = path.join(BACKUP_DIR, `${tid}_backup.jpg`);

  if (isGroupAdmin) {
    let imageUrl = eventData.image || take(eventData.logMessageData?.image_data, ['thumbSrc','url','src','uri']);
    if (typeof imageUrl === 'object' && imageUrl) imageUrl = imageUrl.url || imageUrl.src || imageUrl.thumbSrc || imageUrl.uri;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      const last = lastBackupTime.get(tid), now = Date.now();
      if (!last || now - last > 30000) {
        try {
          await fs.ensureDir(BACKUP_DIR);
          const res = await axios.get(imageUrl, { responseType: 'stream' });
          await new Promise((ok, no) => { const w = fs.createWriteStream(backupPath); res.data.pipe(w); w.on('finish',ok); w.on('error',no); });
          lastBackupTime.set(tid, now);
        } catch {}
      }
    }
    return;
  }

  let userName = "một thành viên";
  try { const ui = await api.getUserInfo(author); userName = ui?.[author]?.name || userName; } catch {}
  const tc = config[tid]; const tw = warnings[tid] || {};
  if (adminBot) {
    if (await fs.pathExists(backupPath) && (await fs.stat(backupPath)).size >= 1024) {
      try {
        restoreInProgress.add(tid);
        await api.changeGroupImage(fs.createReadStream(backupPath), tid);
        await sendTemp(api, tid, "Đừng nghịch nữa Anh của em 😃", 30000);
      } finally { setTimeout(()=>restoreInProgress.delete(tid), 5000); }
    }
    return;
  }

  tc.warnings ||= {}; tc.warningMessages ||= {}; warnings[tid] ||= {};
  tw[author] ||= { count:0, lastWarningTime:null };
  tc.warnings[author] ||= { count:0, lastWarningTime:null };
  tc.warningMessages[author] ||= [];
  tc.warnings[author].count++; tw[author].count++;
  const ts = Date.now(); tc.warnings[author].lastWarningTime = ts; tw[author].lastWarningTime = ts;
  const count = tc.warnings[author].count;

  let msg = `🛡️ CHỐNG ĐỔI ẢNH NHÓM\n\n❌ ${userName} đã thay đổi ảnh nhóm trái phép!\n⚠️ Cảnh cáo: ${count}/2\n`;
  if (await fs.pathExists(backupPath) && (await fs.stat(backupPath)).size >= 1024) {
    msg += `✅ Đã khôi phục ảnh nhóm về ban đầu.`;
    try {
      restoreInProgress.add(tid);
      await api.changeGroupImage(fs.createReadStream(backupPath), tid);
    } finally { setTimeout(()=>restoreInProgress.delete(tid), 5000); }
  } else msg += `⚠️ Không có ảnh backup để khôi phục.`;

  const sent = await sendTemp(api, tid, msg, 30000);
  if (sent?.messageID) tc.warningMessages[author].push(sent.messageID);

  if (count >= 2) {
    setTimeout(async () => {
      try {
        await api.removeUserFromGroup(author, tid);
        await sendTemp(api, tid, `✅ Đã kick ${userName} khỏi nhóm vì vi phạm quá 2 lần.`, 30000);
        delete tc.warnings[author]; delete tw[author];
        if (tc.warningMessages[author]) {
          for (const id of tc.warningMessages[author]) api.unsendMessage(id).catch(()=>{});
          delete tc.warningMessages[author];
        }
        config[tid] = tc; warnings[tid] = tw;
        await saveJSON(CONFIG_PATH, config); await saveJSON(WARN_PATH, warnings);
      } catch {
        await sendTemp(api, tid, `❌ Không thể kick ${userName}.`, 15000);
      }
    }, 5000);
  }

  setTimeout(async () => {
    try {
      const c = await loadJSON(CONFIG_PATH, config); const w = await loadJSON(WARN_PATH, warnings);
      if (!c[tid]?.warnings?.[author] || !w[tid]?.[author]) return;
      const wd = c[tid].warnings[author];
      if (wd.lastWarningTime === ts && wd.count < 2) {
        delete c[tid].warnings[author]; delete w[tid][author];
        if (c[tid].warningMessages?.[author]) {
          for (const id of c[tid].warningMessages[author]) { try { await api.unsendMessage(id); } catch {} }
          delete c[tid].warningMessages[author];
        }
        await saveJSON(CONFIG_PATH, c); await saveJSON(WARN_PATH, w);
      }
    } catch {}
  }, 10000);

  tc.violations ||= [];
  tc.violations.push({ userID: author, userName, violationType:"image", oldValue:"protected", newValue:"changed", warningCount: count, timestamp: new Date().toISOString(), action: count>=2?'kick':'warn' });
  if (tc.violations.length > 50) tc.violations = tc.violations.slice(-50);
  config[tid] = tc; warnings[tid] = tw;
  await saveJSON(CONFIG_PATH, config); await saveJSON(WARN_PATH, warnings);
}

module.exports.run = async function({ event, api, Threads, Users }) {
  const botID = api.getCurrentUserID();
  if (event.author === botID) return;

  const config = await loadJSON(CONFIG_PATH, {});
  const warnings = await loadJSON(WARN_PATH, {});
  const tid = event.threadID;

  if (event.logMessageType === "log:thread-admins") {
    let data = (await Threads.getData(tid)).data;
    if (!data?.guard) return;
    const { logMessageData } = event;
    if (logMessageData.ADMIN_EVENT == "add_admin") {
      if (event.author == botID || logMessageData.TARGET_ID == botID) return;
      api.changeAdminStatus(tid, event.author, false, cb); api.changeAdminStatus(tid, logMessageData.TARGET_ID, false);
      function cb(err){ if(err) return api.sendMessage("» Ahihi đồ ngu 😝", tid, event.messageID); return api.sendMessage(`🔄 Phát hiện thêm QTV, kích hoạt chống cướp box...`, tid, event.messageID); }
    } else if (logMessageData.ADMIN_EVENT == "remove_admin") {
      if (event.author == botID || logMessageData.TARGET_ID == botID) return;
      api.changeAdminStatus(tid, event.author, false, cb); api.changeAdminStatus(tid, logMessageData.TARGET_ID, true);
      function cb(err){ if(err) return api.sendMessage("» Ahihi đồ ngu 😝", tid, event.messageID); return api.sendMessage(`🔄 Phát hiện xoá QTV, kích hoạt chống cướp box...`, tid, event.messageID); }
    }
    return;
  }

  if (event.logMessageType === "log:unsubscribe") {
    if (event.author === botID || event.logMessageData.leftParticipantFbId == botID) return;
    let data = (await Threads.getData(tid)).data || {};
    if (!data.antiout) return;
    const name = global.data.userName.get(event.logMessageData.leftParticipantFbId) || await Users.getNameUser(event.logMessageData.leftParticipantFbId);
    const selfLeave = (event.author == event.logMessageData.leftParticipantFbId);
    if (selfLeave) {
      api.addUserToGroup(event.logMessageData.leftParticipantFbId, tid, (error) => {
        if (error) api.sendMessage(`Không thể thêm ${name} vào nhóm :(`, tid);
        else api.sendMessage(`Đã thêm ${name} vừa thoát vào lại nhóm`, tid);
      });
    }
    return;
  }

  if (!config[tid]?.enabled) return;
  const tc = config[tid]; const tw = warnings[tid] || {};
  const hasProt = tc.protectTheme || tc.protectName || tc.protectEmoji || tc.protectImage;
  if (!hasProt) return;

  const ui = await api.getUserInfo(event.author);
  const authorName = ui[event.author]?.name || "Người dùng";

  let violationType = "", shouldRestore = false, oldValue="", newValue="";

  if (event.logMessageType === "log:thread-color" && tc.protectTheme) {
    const themeID = event.logMessageData?.theme_id || event.logMessageData?.theme_fbid || event.logMessageData?.untypedData?.theme_fbid;
    if (!tc.allowedTheme) { tc.allowedTheme = themeID; await saveJSON(CONFIG_PATH, config); return; }
    if (themeID !== tc.allowedTheme) { violationType="theme"; oldValue=tc.allowedTheme; newValue=themeID; shouldRestore=true; }
  } else if (event.logMessageType === "log:thread-name" && tc.protectName) {
    const name = event.logMessageData?.name || "";
    if (!tc.allowedName) { tc.allowedName = name; await saveJSON(CONFIG_PATH, config); return; }
    if (name !== tc.allowedName) { violationType="name"; oldValue=tc.allowedName; newValue=name; shouldRestore=true; }
  } else if (event.logMessageType === "log:thread-icon" && tc.protectEmoji) {
    let emoji=""; for (const k of ['emoji','thread_quick_reaction_emoji','thread_emoji','emoji_unicode','new_emoji','emoji_code']) if (event.logMessageData?.[k] !== undefined) { emoji = event.logMessageData[k]; break; }
    if (!tc.allowedEmoji) { tc.allowedEmoji = emoji; await saveJSON(CONFIG_PATH, config); return; }
    if (emoji !== tc.allowedEmoji) { violationType="emoji"; oldValue=tc.allowedEmoji; newValue=emoji; shouldRestore=true; }
  }

  if (!shouldRestore) return;

  const ti = await api.getThreadInfo(tid);
  const violatorIsAdmin = ti.adminIDs.some(a => a.id === event.author);
  const adminBot = isAdminBot(event.author);

  if (adminBot) {
    await sendTemp(api, tid, "Đừng nghịch nữa Anh của em 😃", 15000);
    setTimeout(async () => {
      try {
        if (violationType === "theme") await new Promise((res, rej)=>api.changeThreadColor(tc.allowedTheme, tid, (e,r)=>e?rej(e):res(r)));
        else if (violationType === "name") await api.setTitle(tc.allowedName, tid);
        else if (violationType === "emoji") await new Promise((res, rej)=>api.changeThreadEmoji(tc.allowedEmoji||"👍", tid, (e,r)=>e?rej(e):res(r)));
      } catch {}
    }, 2000);
    return;
  }

  tc.warnings ||= {}; tc.warningMessages ||= {}; warnings[tid] ||= {};
  tw[event.author] ||= { count:0, lastWarningTime:null };
  tc.warnings[event.author] ||= { count:0, lastWarningTime:null };
  tc.warningMessages[event.author] ||= [];

  tc.warnings[event.author].count++; tw[event.author].count++;
  const ts = Date.now(); tc.warnings[event.author].lastWarningTime = ts; tw[event.author].lastWarningTime = ts;
  const warningCount = tc.warnings[event.author].count;

  setTimeout(async () => {
    try {
      const c = await loadJSON(CONFIG_PATH, config); const w = await loadJSON(WARN_PATH, warnings);
      if (!c[tid]?.warnings?.[event.author] || !w[tid]?.[event.author]) return;
      const wd = c[tid].warnings[event.author];
      if (wd.lastWarningTime === ts && wd.count < 2) {
        delete c[tid].warnings[event.author]; delete w[tid][event.author];
        if (c[tid].warningMessages?.[event.author]) {
          for (const id of c[tid].warningMessages[event.author]) { try { await api.unsendMessage(id); } catch {} }
          delete c[tid].warningMessages[event.author];
        }
        await saveJSON(CONFIG_PATH, c); await saveJSON(WARN_PATH, w);
      }
    } catch {}
  }, 10000);

  const dict = { theme:"theme", name:"tên nhóm", emoji:"emoji" };
  let msg = `🛡️ CHỐNG ĐỔI ${violationType.toUpperCase()}\n\n❌ ${authorName} đã thay đổi ${dict[violationType]} trái phép!\n⚠️ Cảnh cáo: ${warningCount}/2\n`;

  if (warningCount >= 2) {
    if (violatorIsAdmin) {
      msg += `🔄 Đang khôi phục ${dict[violationType]}...`;
      const sent = await sendTemp(api, tid, msg, 30000);
      if (sent?.messageID) tc.warningMessages[event.author].push(sent.messageID);
      delete tc.warnings[event.author]; delete tw[event.author];
      if (tc.warningMessages[event.author]) setTimeout(()=>{ tc.warningMessages[event.author].forEach(id=>api.unsendMessage(id).catch(()=>{})); delete tc.warningMessages[event.author]; }, 30000);
    } else {
      msg += `🔄 Đang khôi phục ${dict[violationType]}...`;
      const sent = await sendTemp(api, tid, msg, 30000);
      if (sent?.messageID) tc.warningMessages[event.author].push(sent.messageID);
      setTimeout(async () => {
        try {
          await api.removeUserFromGroup(event.author, tid);
          await sendTemp(api, tid, `✅ Đã kick ${authorName} khỏi nhóm vì vi phạm quá 2 lần.`, 30000);
          delete tc.warnings[event.author]; delete tw[event.author];
          if (tc.warningMessages[event.author]) { for (const id of tc.warningMessages[event.author]) api.unsendMessage(id).catch(()=>{}); delete tc.warningMessages[event.author]; }
          config[tid] = tc; warnings[tid] = tw;
          await saveJSON(CONFIG_PATH, config); await saveJSON(WARN_PATH, warnings);
        } catch { await sendTemp(api, tid, `❌ Không thể kick ${authorName}.`, 15000); }
      }, 5000);
    }
  } else {
    msg += `🔄 Đang khôi phục ${dict[violationType]}...`;
    const sent = await sendTemp(api, tid, msg, 30000);
    if (sent?.messageID) tc.warningMessages[event.author].push(sent.messageID);
  }

  setTimeout(async () => {
    try {
      if (violationType === "theme") await new Promise((res, rej)=>api.changeThreadColor(tc.allowedTheme, tid, (e,r)=>e?rej(e):res(r)));
      else if (violationType === "name") await api.setTitle(tc.allowedName, tid);
      else if (violationType === "emoji") await new Promise((res, rej)=>api.changeThreadEmoji(tc.allowedEmoji||"👍", tid, (e,r)=>e?rej(e):res(r)));
      if (warningCount < 2) await sendTemp(api, tid, `✅ Đã khôi phục ${dict[violationType]} về ban đầu.`, 10000);
    } catch { await sendTemp(api, tid, `❌ Không thể khôi phục ${dict[violationType]} tự động.`, 15000); }
  }, 2000);

  tc.violations ||= [];
  tc.violations.push({ userID: event.author, userName: authorName, violationType, oldValue, newValue, warningCount, timestamp: new Date().toISOString(), action: warningCount>=2?'kick':'warn' });
  if (tc.violations.length > 50) tc.violations = tc.violations.slice(-50);
  config[tid] = tc; warnings[tid] = tw;
  await saveJSON(CONFIG_PATH, config); await saveJSON(WARN_PATH, warnings);
};

const antiSpamData = new Map();
const SPAM_THRESHOLD = 4;
const SPAM_TIME_LIMIT = 3000;
const WARNING_LIMIT = 2;
const CLEAN_INTERVAL = 60000;

setInterval(() => {
  const now = Date.now();
  for (const [uid, d] of antiSpamData.entries()) {
    d.messages = d.messages.filter(t => now - t < SPAM_TIME_LIMIT);
    if (d.messages.length === 0 && now - d.lastActivity > 300000) antiSpamData.delete(uid);
  }
}, CLEAN_INTERVAL);

module.exports.handleEvent = async function({ api, event, Threads }) {
  const { senderID, threadID, messageID, type, body } = event;
  if (type !== "message" && type !== "message_reply") return;
  if (!body || !body.trim()) return;
  if (senderID === api.getCurrentUserID()) return;
  if (isAdminBot(senderID)) return;

  const threadData = (await Threads.getData(threadID)).data || {};
  if (!threadData.antispam) return;

  if (!antiSpamData.has(senderID)) antiSpamData.set(senderID, { messages:[], warnings:0, lastWarning:0, lastActivity:Date.now(), warningMessages:[] });
  const d = antiSpamData.get(senderID); const now = Date.now();
  d.lastActivity = now;
  d.messages = d.messages.filter(t => now - t < SPAM_TIME_LIMIT);
  d.messages.push(now);

  if (d.messages.length >= SPAM_THRESHOLD) {
    d.warnings++; d.lastWarning = now;
    try { await api.unsendMessage(messageID); } catch {}
    let userName = "Unknown"; try { const ui = await api.getUserInfo(senderID); userName = ui[senderID]?.name || "Unknown"; } catch {}
    let isGroupAdmin = false; try { const ti = await api.getThreadInfo(threadID); isGroupAdmin = ti.adminIDs.some(a => a.id === senderID); } catch {}

    if (d.warnings <= WARNING_LIMIT) {
      const w = `⚠️ CẢNH BÁO SPAM!\n👤 ${userName}\n📊 Cảnh báo: ${d.warnings}/${WARNING_LIMIT}\n📝 ${d.messages.length} tin/ ${SPAM_TIME_LIMIT/1000}s\n💡 ${isGroupAdmin ? 'QTV được miễn kick' : 'Tránh spam để không bị kick!'}`;
      const sent = await api.sendMessage(w, threadID);
      if (sent?.messageID) { d.warningMessages.push(sent.messageID); setTimeout(()=>api.unsendMessage(sent.messageID).catch(()=>{}), 15000); }
    }

    if (d.warnings > WARNING_LIMIT && !isGroupAdmin) {
      try {
        const botID = api.getCurrentUserID();
        const ti = await api.getThreadInfo(threadID);
        const botIsAdmin = ti.adminIDs.some(a => a.id === botID);
        if (!botIsAdmin) { await api.sendMessage(`[ANTI-SPAM] Bot không có quyền QTV để kick ${userName}`, threadID); return; }
        await api.removeUserFromGroup(senderID, threadID);
        const k = await api.sendMessage(`✅ Đã kick ${userName} vì spam quá ${WARNING_LIMIT} lần cảnh báo!`, threadID);
        if (k?.messageID) setTimeout(()=>api.unsendMessage(k.messageID).catch(()=>{}), 30000);
        antiSpamData.delete(senderID);
      } catch { await api.sendMessage(`❌ Không thể kick ${userName}`, threadID); }
    }
    d.messages = [];
  }

  if (d.warnings > 0 && now - d.lastWarning > 300000) {
    d.warnings = 0;
    d.warningMessages.forEach(id => api.unsendMessage(id).catch(()=>{}));
    d.warningMessages = [];
  }
};