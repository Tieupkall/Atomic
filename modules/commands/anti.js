module.exports.config = {
  name: "anti",
  version: "1.2.0",
  hasPermssion: 1,
  credits: "Atomic",
  description: "Bảo vệ nhóm: theme, tên, emoji, ảnh, QTV, antiout, antispam, antiunsend",
  commandCategory: "Quản Trị Viên",
  usages: "menu/status",
  cooldowns: 5
};

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const AUTO_DELETE_TIME = 30 * 1000;
const REVERT_DELAY_IMAGE = 1500;

const CONFIG_PATH = path.join(__dirname, "../../data/anti/anti.json");
const BACKUP_DIR  = path.join(__dirname, "../../data/backup_images");
const UNSEND_DIR  = path.join(__dirname, "../../data/unsend");

const tempStore = new Map();
const antiunsendMessages = new Map();
if (!global.antiSpamTracking) global.antiSpamTracking = {};

const sendTemp = (api, threadID, body) => new Promise(r=>{
  api.sendMessage(body, threadID, (e, info) => {
    if (!e && info) setTimeout(() => api.unsendMessage(info.messageID).catch(()=>{}), AUTO_DELETE_TIME);
    r();
  });
});

const loadJson = async (p, def={}) => { await fs.ensureFile(p); try { return await fs.readJson(p); } catch { return def; } };
const saveJson = (p, obj) => fs.writeJson(p, obj, { spaces: 2 });

const isAdminOfThread = (ti, uid) => (ti.adminIDs||[]).some(a=>a.id===uid);
const isBot = (uid, api) => uid === api.getCurrentUserID();
const isAdminBot = (uid) => Array.isArray(global.config?.ADMINBOT) && global.config.ADMINBOT.includes(uid);
const isAllowedChanger = (ti, uid, api) => isBot(uid, api) || isAdminOfThread(ti, uid);

const getExt = (t) => t==="photo"?"png":t==="video"?"mp4":t==="audio"?"mp3":t==="animated_image"?"gif":t==="file"?"txt":"dat";
const getFolder = (t) => t==="photo"?"anh":t==="video"?"video":t==="audio"?"audio":t==="animated_image"?"gif":t==="file"?"file":"khac";

const ensureThreadConfig = (config, tid) => (config[tid] ||= {
  enabled:false,
  allowedTheme:null, allowedName:null, allowedEmoji:null,
  protectTheme:true, protectName:true, protectEmoji:true, protectImage:false,
  protectAdmin:false, protectAntiout:false, protectAntispam:false, protectAntiunsend:false,
  detectionTime:null
});

const updateEnabledFlag = (tc) => {
  tc.enabled = !!(tc.protectTheme||tc.protectName||tc.protectEmoji||tc.protectImage||tc.protectAdmin||tc.protectAntiout||tc.protectAntispam||tc.protectAntiunsend);
};

async function snapshotAndBackup(api, tid, tc) {
  const info = await api.getThreadInfo(tid);
  tc.allowedName = info.threadName || "";
  tc.allowedEmoji = info.emoji || "👍";
  tc.allowedTheme = info.themeID||info.theme_fbid||info.themeId||info.threadTheme?.id||info.color||null;
  if (info.imageSrc) {
    try {
      await fs.ensureDir(BACKUP_DIR);
      const savePath = path.join(BACKUP_DIR, `${tid}_backup.jpg`);
      const res = await axios.get(info.imageSrc, { responseType:"stream" });
      await new Promise((r,j)=>{ const w=fs.createWriteStream(savePath); res.data.pipe(w); w.on("finish",r); w.on("error",j); });
    } catch {}
  }
  tc.detectionTime = new Date().toISOString();
}

module.exports.handleReply = async function({ api, event, Threads, handleReply }) {
  if (handleReply.type !== "menu" || handleReply.author !== event.senderID)
    return api.sendMessage("❌ Bạn không có quyền.", event.threadID);

  const tid = event.threadID;
  const choice = parseInt(event.body);
  api.unsendMessage(handleReply.messageID);

  const config = await loadJson(CONFIG_PATH, {});
  ensureThreadConfig(config, tid);
  const tc = config[tid];

  const tInfo = await api.getThreadInfo(tid);
  if (!isAllowedChanger(tInfo, event.senderID, api)) return sendTemp(api, tid, "❌ Chỉ QTV nhóm.");

  const setSave = async () => { updateEnabledFlag(tc); await saveJson(CONFIG_PATH, config); };
  const msg = (s)=>sendTemp(api, tid, s);

  if (choice === 1) { tc.protectTheme = !tc.protectTheme; if (tc.protectTheme) await snapshotAndBackup(api, tid, tc); await setSave(); return msg(tc.protectTheme?"✅ Bật chống đổi theme":"❌ Tắt chống đổi theme"); }
  if (choice === 2) { tc.protectName  = !tc.protectName ; if (tc.protectName ) await snapshotAndBackup(api, tid, tc); await setSave(); return msg(tc.protectName ?"✅ Bật chống đổi tên":"❌ Tắt chống đổi tên"); }
  if (choice === 3) { tc.protectEmoji = !tc.protectEmoji; if (tc.protectEmoji) await snapshotAndBackup(api, tid, tc); await setSave(); return msg(tc.protectEmoji?"✅ Bật chống đổi emoji":"❌ Tắt chống đổi emoji"); }
  if (choice === 4) { tc.protectImage = !tc.protectImage; if (tc.protectImage) await snapshotAndBackup(api, tid, tc); else { try { const p = path.join(BACKUP_DIR, `${tid}_backup.jpg`); if (await fs.pathExists(p)) await fs.remove(p); } catch {} } await setSave(); return msg(tc.protectImage?"✅ Bật chống đổi ảnh":"❌ Tắt chống đổi ảnh"); }
  if (choice === 5) {
    if (!isAdminOfThread(tInfo, api.getCurrentUserID())) return msg("❌ Bot chưa là QTV.");
    tc.protectAdmin = !tc.protectAdmin;
    const d = (await Threads.getData(tid)).data || {};
    d.guard = tc.protectAdmin; await Threads.setData(tid, { data: d }); global.data.threadData.set(parseInt(tid), d);
    await setSave(); return msg(tc.protectAdmin?"✅ Bật chống đổi QTV":"❌ Tắt chống đổi QTV");
  }
  if (choice === 6) {
    tc.protectAntiout = !tc.protectAntiout;
    const d = (await Threads.getData(tid)).data || {};
    d.antiout = tc.protectAntiout; await Threads.setData(tid, { data: d }); global.data.threadData.set(parseInt(tid), d);
    await setSave(); return msg(tc.protectAntiout?"✅ Bật antiout":"❌ Tắt antiout");
  }
  if (choice === 7) {
    tc.protectAntispam = !tc.protectAntispam;
    const d = (await Threads.getData(tid)).data || {};
    d.antispam = tc.protectAntispam; await Threads.setData(tid, { data: d }); global.data.threadData.set(parseInt(tid), d);
    await setSave(); return msg(tc.protectAntispam?"✅ Bật antispam":"❌ Tắt antispam");
  }
  if (choice === 8) { tc.protectAntiunsend = !tc.protectAntiunsend; await setSave(); return msg(tc.protectAntiunsend?"✅ Bật antiunsend":"❌ Tắt antiunsend"); }
  if (choice === 9) {
    Object.assign(tc, { protectTheme:true, protectName:true, protectEmoji:true, protectImage:true, protectAdmin:true, protectAntiout:true, protectAntispam:true, protectAntiunsend:true });
    const d = (await Threads.getData(tid)).data || {};
    d.guard = d.antiout = d.antispam = true; await Threads.setData(tid, { data: d }); global.data.threadData.set(parseInt(tid), d);
    await snapshotAndBackup(api, tid, tc); await setSave(); return msg("✅ Đã bật tất cả.");
  }
  if (choice === 10) {
    Object.assign(tc, { protectTheme:false, protectName:false, protectEmoji:false, protectImage:false, protectAdmin:false, protectAntiout:false, protectAntispam:false, protectAntiunsend:false });
    const d = (await Threads.getData(tid)).data || {};
    d.guard = d.antiout = d.antispam = false; await Threads.setData(tid, { data: d }); global.data.threadData.set(parseInt(tid), d);
    try { const p = path.join(BACKUP_DIR, `${tid}_backup.jpg`); if (await fs.pathExists(p)) await fs.remove(p); } catch {}
    await setSave(); return msg("❌ Đã tắt tất cả.");
  }
  return msg("❌ Chọn 1-10.");
};

module.exports.run = async function({ api, event, args, Threads }) {
  const tid = event.threadID;
  const config = await loadJson(CONFIG_PATH, {});
  ensureThreadConfig(config, tid);
  const tc = config[tid];
  const prefix = global.config.PREFIX;

  if (args.length && (args[0]==="on"||args[0]==="off")) {
    tc.protectAntiunsend = args[0]==="on"; updateEnabledFlag(tc); await saveJson(CONFIG_PATH, config);
    return api.sendMessage(args[0]==="on"?"✅ Bật antiunsend.":"❌ Tắt antiunsend.", tid, event.messageID);
  }

  const tData = (await Threads.getData(tid)).data || {};
  updateEnabledFlag(tc); await saveJson(CONFIG_PATH, config);

  if (!args[0] || /^(help|menu)$/i.test(args[0])) {
    const s = (b)=> b?"🟢":"🔴";
    const menu =
`🛡️ ANTICHANGE
⚡ Tổng: ${s(tc.enabled)}
1. ${s(tc.protectTheme)} Theme
2. ${s(tc.protectName)} Tên
3. ${s(tc.protectEmoji)} Emoji
4. ${s(tc.protectImage)} Ảnh
5. ${s(tc.protectAdmin || tData.guard)} QTV
6. ${s(tc.protectAntiout || tData.antiout)} Antiout
7. ${s(tc.protectAntispam || tData.antispam)} Antispam
8. ${s(tc.protectAntiunsend)} Antiunsend
9. Bật tất cả
10. Tắt tất cả
Reply số để bật/tắt`;

    return api.sendMessage(menu, tid, (e, info) => {
      if (!e && info) {
        global.client.handleReply ||= [];
        global.client.handleReply.push({ name: module.exports.config.name, messageID: info.messageID, author: event.senderID, threadID: tid, type: "menu" });
        setTimeout(()=>api.unsendMessage(info.messageID).catch(()=>{}), AUTO_DELETE_TIME);
      }
    });
  }

  if (args[0]?.toLowerCase() === "status") {
    let s = `📊 TRẠNG THÁI\nThread: ${tid}\nTrạng thái: ${tc.enabled?"🟢":"🔴"}\n`;
    if (tc.protectName)  s += `Tên: ${tc.allowedName||"Chưa đặt"}\n`;
    if (tc.protectEmoji) s += `Emoji: ${tc.allowedEmoji||"Chưa đặt"}\n`;
    if (tc.detectionTime) s += `Thiết lập: ${new Date(tc.detectionTime).toLocaleString("vi-VN")}\n`;
    return sendTemp(api, tid, s);
  }

  return sendTemp(api, tid, `❌ Lệnh không hợp lệ.\nDùng: ${prefix}${module.exports.config.name}`);
};

module.exports.handleEvent = async function({ api, event, Threads }) {
  const { senderID, threadID, messageID, type, logMessageType } = event;
  if (senderID === api.getCurrentUserID()) return;

  try {
    const config = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH)) : {};
    const tc = config[threadID];
    if (!tc) return;

    const threadInfo = await api.getThreadInfo(threadID);
    const allowed = isAllowedChanger(threadInfo, senderID, api);
    const isAdmBot = isAdminBot(senderID);

    const revertTheme = async () => { if (tc.allowedTheme!=null) try { await api.changeThreadColor(tc.allowedTheme, threadID); } catch {} };
    const revertName  = async () => { try { await api.setTitle(tc.allowedName||"", threadID); } catch {} };
    const revertEmoji = async () => { if (tc.allowedEmoji) try { await api.changeThreadEmoji(tc.allowedEmoji, threadID); } catch {} };
    const revertImage = async () => {
      try {
        const p = path.join(BACKUP_DIR, `${threadID}_backup.jpg`);
        if (await fs.pathExists(p)) {
          await new Promise(r=>setTimeout(r, REVERT_DELAY_IMAGE));
          await api.changeGroupImage(fs.createReadStream(p), threadID);
        }
      } catch {}
    };
    const backupCurrentImage = async () => {
      try {
        const info = await api.getThreadInfo(threadID);
        if (!info?.imageSrc) return;
        await fs.ensureDir(BACKUP_DIR);
        const savePath = path.join(BACKUP_DIR, `${threadID}_backup.jpg`);
        const res = await axios.get(info.imageSrc, { responseType:"stream" });
        await new Promise((r, j) => { const w = fs.createWriteStream(savePath); res.data.pipe(w); w.on("finish", r); w.on("error", j); });
      } catch {}
    };

    const need = (k)=> (k==="theme" && tc.protectTheme) || (k==="name" && tc.protectName) || (k==="emoji" && tc.protectEmoji) || (k==="image" && tc.protectImage);
    const doRevert = async (k)=>{
      if (!need(k)) return;
      if (isAdmBot) { if (k==="image") await revertImage(); else if (k==="theme") await revertTheme(); else if (k==="name") await revertName(); else if (k==="emoji") await revertEmoji(); await sendTemp(api, threadID, "Đừng nghịch nữa."); return; }
      if (allowed) { if (k==="image") await backupCurrentImage(); return; }
      if (k==="theme") await revertTheme();
      else if (k==="name") await revertName();
      else if (k==="emoji") await revertEmoji();
      else if (k==="image") await revertImage();
    };

    if (logMessageType === "log:thread-color") await doRevert("theme");
    else if (logMessageType === "log:thread-name") await doRevert("name");
    else if (logMessageType === "log:thread-icon") await doRevert("emoji");
    else if (logMessageType === "log:thread-image") await doRevert("image");

    if (type === "message" || type === "message_reply") {
      if (tc.protectAntiunsend) {
        tempStore.set(messageID, { ...event, timestamp: Date.now() });
        setTimeout(()=>tempStore.delete(messageID), 10*60*1000);
      }
    }

    if (type === "message_unsend" && tc.protectAntiunsend) {
      const msg = tempStore.get(messageID);
      if (!msg) return;
      const name = (await api.getUserInfo(senderID))[senderID]?.name || "Người dùng";
      const prefix = `⚠️ ${name} vừa gỡ một tin nhắn:`;
      const parts = [];
      if (msg.body) parts.push({ body: `${prefix}\n📝 ${msg.body}` });

      if (msg.attachments?.length) {
        const files = [], temps=[];
        await fs.ensureDir(UNSEND_DIR);
        for (const a of msg.attachments) {
          try {
            const dir = path.join(UNSEND_DIR, getFolder(a.type));
            await fs.ensureDir(dir);
            const fn = `unsend_${Date.now()}_${Math.floor(Math.random()*9999)}.${getExt(a.type)}`;
            const fp = path.join(dir, fn);
            const res = await axios.get(a.url, { responseType:"arraybuffer" });
            await fs.writeFile(fp, res.data);
            files.push(fs.createReadStream(fp));
            temps.push(fp);
          } catch {}
        }
        if (files.length) {
          parts.push({ body: prefix, attachment: files });
          setTimeout(()=>temps.forEach(p=>fs.unlink(p).catch(()=>{})), 10000);
        }
      }
      for (const p of parts) {
        try {
          const info = await new Promise(r=>api.sendMessage(p, threadID, (e,i)=>r(i)));
          if (info?.messageID) {
            antiunsendMessages.set(info.messageID, { timestamp: Date.now(), threadID, originalSender: senderID, isAntiunsend:true });
            setTimeout(()=>antiunsendMessages.delete(info.messageID), 5*60*1000);
          }
        } catch {}
      }
      tempStore.delete(messageID);
      return;
    }

    if (type!=="message" && type!=="message_reply") return;

    const tData = (await Threads.getData(threadID)).data || {};
    if (!tData.antispam) return;

    const track = (global.antiSpamTracking[threadID] ||= {});
    const u = (track[senderID] ||= { messages:[], warnings:0, lastWarning:0 });
    const now = Date.now(), LIM=2000, TH=3, WL=2;
    u.messages = u.messages.filter(t => now - t < LIM);
    u.messages.push(now);

    if (u.messages.length >= TH) {
      u.warnings++; u.lastWarning = now;
      try { await api.unsendMessage(messageID); } catch {}
      const userName = (await api.getUserInfo(senderID))[senderID]?.name || "Unknown";
      if (u.warnings <= WL) await sendTemp(api, threadID, `⚠️ SPAM: ${userName} (${senderID}) – ${u.warnings}/${WL}`);
      if (u.warnings > WL) {
        try {
          await api.removeUserFromGroup(senderID, threadID);
          await sendTemp(api, threadID, `🚫 Đã kick: ${userName} (${senderID})`);
          delete track[senderID];
        } catch { await sendTemp(api, threadID, `❌ Không thể kick (thiếu quyền QTV)`); }
      }
      u.messages = [];
    }
    if (u.warnings>0 && u.lastWarning>0 && now - u.lastWarning > 300000) { u.warnings=0; u.lastWarning=0; }
  } catch {}
};

module.exports.isAntiunsendMessage = (id) => antiunsendMessages.has(id);
module.exports.getAntiunsendMessageInfo = (id) => antiunsendMessages.get(id);