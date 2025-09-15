module.exports.config = {
  name: "noti",
  version: "2.6",
  hasPermssion: 3,
  credits: "Atomic",
  description: "Gửi thông báo đến tất cả nhóm (ảnh canvas, lọc ký tự đặc biệt). Reply từ nhóm forward về admin bằng ảnh.",
  commandCategory: "Admin",
  usages: '[nội dung] [-preview] [-title "Tiêu đề"] [-delay 800] [-limit 50] [-ascii] [-text]',
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const fs = require("fs");
  const path = require("path");
  const { createCanvas } = require("canvas");

  const adminGroupID = "6691735800885668";
  if (event.threadID !== adminGroupID) return api.sendMessage("⚠️ Hãy cấu hình ThreadID trong file !", event.threadID);
  if (!args.length) return api.sendMessage("⚠️ Vui lòng nhập nội dung thông báo!", event.threadID);

  function parseFlags(list) {
    const out = { preview: false, title: "THÔNG BÁO QUAN TRỌNG", delay: 800, limit: null, ascii: false, textOnly: false, body: "" };
    let i = 0; const rest = [];
    while (i < list.length) {
      const t = list[i];
      if (t === "-preview") out.preview = true;
      else if (t === "-ascii") out.ascii = true;
      else if (t === "-text") out.textOnly = true;
      else if (t === "-title" && list[i+1]) { out.title = list[i+1]; i++; }
      else if (t === "-delay" && list[i+1]) { out.delay = Math.max(0, parseInt(list[i+1],10)||800); i++; }
      else if (t === "-limit" && list[i+1]) { out.limit = Math.max(1, parseInt(list[i+1],10)||null); i++; }
      else rest.push(t);
      i++;
    }
    out.body = rest.join(" ").trim();
    return out;
  }

  const flags = parseFlags(args);
  if (!flags.body) return api.sendMessage("⚠️ Vui lòng nhập nội dung thông báo!", event.threadID);

  const info = await api.getUserInfo(event.senderID);
  const adminNameRaw = info[event.senderID].name;
  const vnTimeRaw = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  function sanitizeKeepVN(input) {
    if (!input) return "";
    return String(input).replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, "");
  }
  function toASCII(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "");
  }

  const title0 = sanitizeKeepVN(flags.title);
  const body0 = sanitizeKeepVN(flags.body);
  const admin0 = sanitizeKeepVN(adminNameRaw);
  const time0 = sanitizeKeepVN(vnTimeRaw);

  const titleSan = flags.ascii ? toASCII(title0) : title0;
  const bodySan = flags.ascii ? toASCII(body0) : body0;
  const adminSan = flags.ascii ? toASCII(admin0) : admin0;
  const timeSan = flags.ascii ? toASCII(time0) : time0;

  function hiDPICanvas(w, h, r = 2) {
    const c = createCanvas(w * r, h * r);
    const x = c.getContext("2d");
    x.scale(r, r);
    return { canvas: c, ctx: x };
  }
  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = []; let line = "";
    for (let i=0;i<words.length;i++){
      const t = line ? line+" "+words[i] : words[i];
      if (ctx.measureText(t).width <= maxWidth) line = t;
      else { if (line) lines.push(line); line = words[i]; }
    }
    if (line) lines.push(line);
    return lines;
  }

  function buildCard({ title, body, admin, time }) {
    const W = 1200, PAD = 36, titlebar = 40, innerW = W - PAD*2;
    const { ctx } = hiDPICanvas(W, 10);

    ctx.font = `700 64px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const titleLines = wrapText(ctx, title, innerW);

    ctx.font = `400 48px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const bodyLines = wrapText(ctx, body, innerW);

    ctx.font = `500 36px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const metaAdmin = `Từ: ${admin}`;
    const metaTime = `Thời gian: ${time}`;

    const lineHTitle = 78, lineHBody = 60, metaH = 42*2 + 12;
    const H = titlebar + PAD + titleLines.length*lineHTitle + 20 + bodyLines.length*lineHBody + 24 + metaH + PAD;

    const { canvas: C2, ctx: X } = hiDPICanvas(W, H);

    X.save();
    X.shadowColor="rgba(0,0,0,0.35)";
    X.shadowBlur=24;
    X.shadowOffsetY=12;
    roundedRect(X,0,0,W,H,18);
    X.fillStyle="#0D0D0D";
    X.fill();
    X.restore();

    roundedRect(X,0,0,W,H,18);
    X.clip();

    const gTitle = X.createLinearGradient(0,0,0,titlebar);
    gTitle.addColorStop(0,"#242424");
    gTitle.addColorStop(1,"#1A1A1A");
    X.fillStyle=gTitle;
    X.fillRect(0,0,W,titlebar);

    const colors=["#FF5F57","#FFBD2E","#28C840"];
    [0,1,2].forEach(i=>{
      const cx=18+PAD+i*24, cy=Math.floor(titlebar/2);
      X.beginPath();
      X.arc(cx,cy,7,0,Math.PI*2);
      X.fillStyle=colors[i];
      X.fill();
      X.beginPath();
      X.arc(cx-2,cy-2,2,0,Math.PI*2);
      X.fillStyle="rgba(255,255,255,0.7)";
      X.fill();
    });

    const bg = X.createLinearGradient(0,titlebar,0,H);
    bg.addColorStop(0,"#151515");
    bg.addColorStop(1,"#0F0F0F");
    X.fillStyle=bg;
    X.fillRect(0,titlebar,W,H-titlebar);

    let y = titlebar + PAD;

    X.font = `700 64px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    X.fillStyle="#EAEAEA";
    titleLines.forEach(l=>{X.fillText(l,PAD,y); y+=lineHTitle;});

    y += 12;

    X.font = `400 48px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    X.fillStyle="#D6D6D6";
    bodyLines.forEach(l=>{X.fillText(l,PAD,y); y+=lineHBody;});

    y += 16;

    X.globalAlpha=0.35;
    X.strokeStyle="#FFFFFF";
    X.lineWidth=1;
    X.beginPath();
    X.moveTo(PAD,y);
    X.lineTo(W-PAD,y);
    X.stroke();
    X.globalAlpha=1;

    y += 20;

    X.font = `500 36px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    X.fillStyle="#BBBBBB";
    X.fillText(metaAdmin,PAD,y);
    y+=42;
    X.fillText(metaTime,PAD,y);

    return C2;
  }

  async function listAllGroups(limit) {
    let after = null; let out = [];
    try {
      while (true) {
        const batch = await api.getThreadList(100, after, ["INBOX"]);
        const groups = batch.filter(t => t.isGroup === true && t.threadID !== adminGroupID);
        out = out.concat(groups);
        if (limit && out.length >= limit) return out.slice(0, limit);
        if (!batch.length || batch.length < 100) break;
        after = batch[batch.length - 1]?.timestamp || null;
        if (!after) break;
      }
    } catch (e) {
      console.error("[NOTI] Lỗi lấy danh sách nhóm:", e);
    }
    return limit ? out.slice(0, limit) : out;
  }

  if (flags.preview) {
    try {
      if (flags.textOnly) {
        return api.sendMessage(
          `XEM TRUOC\n--------------------\n\nNoi dung: ${bodySan}\n\n--------------------\nTu: ${adminSan}\nThoi gian: ${timeSan}`,
          adminGroupID
        );
      }
      const card = buildCard({ title: titleSan, body: bodySan, admin: adminSan, time: timeSan });
      const tmp = path.join(__dirname, `noti_preview_${Date.now()}.png`);
      fs.writeFileSync(tmp, card.toBuffer("image/png"));
      await api.sendMessage({ body: "", attachment: fs.createReadStream(tmp) }, adminGroupID);
      try { fs.unlinkSync(tmp); } catch {}
    } catch (e) {
      console.error("[NOTI] Lỗi tạo ảnh preview:", e);
      await api.sendMessage("❌ Lỗi tạo ảnh preview, fallback text.", adminGroupID);
      await api.sendMessage(
        `XEM TRUOC\n--------------------\n\nNoi dung: ${bodySan}\n\n--------------------\nTu: ${adminSan}\nThoi gian: ${timeSan}`,
        adminGroupID
      );
    }
    return;
  }

  const threads = await listAllGroups(flags.limit);
  if (!threads.length) return api.sendMessage("❌ Không tìm thấy nhóm nào để gửi thông báo!", adminGroupID);

  let success = 0, fail = 0; const failed = [];
  for (let i=0;i<threads.length;i++) {
    const thr = threads[i];
    let tmpPath = null;
    try {
      let payload;
      if (flags.textOnly) {
        payload = {
          body:
            `THONG BAO QUAN TRONG\n` +
            `--------------------\n\n` +
            `Noi dung: ${bodySan}\n\n` +
            `--------------------\n` +
            `Tu: ${adminSan}\n` +
            `Thoi gian: ${timeSan}\n\n` +
            `Tra loi tin nhan nay de phan hoi\n` +
            `--------------------`
        };
      } else {
        const card = buildCard({ title: titleSan, body: bodySan, admin: adminSan, time: timeSan });
        tmpPath = path.join(__dirname, `noti_card_${thr.threadID}_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, card.toBuffer("image/png"));
        payload = { body: "", attachment: fs.createReadStream(tmpPath) };
      }
      const sent = await api.sendMessage(payload, thr.threadID);
      if (sent && global.client?.handleReply) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: sent.messageID,
          author: event.senderID,
          type: "notification_reply",
          sourceThreadID: thr.threadID,
          sourceThreadName: thr.name || "Nhóm không tên",
          originalContent: bodySan,
          adminName: adminSan
        });
      }
      success++;
    } catch (e) {
      fail++; failed.push({ name: thr.name || thr.threadID, id: thr.threadID, error: e.message });
      console.error(`[NOTI] Gửi thất bại ${thr.threadID}:`, e.message);
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch {} }
      if (flags.delay) await new Promise(r => setTimeout(r, flags.delay));
    }
  }

  const report =
    `📊 BÁO CÁO GỬI THÔNG BÁO\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 Nội dung: ${bodySan}\n` +
    `✅ Thành công: ${success}/${threads.length}\n` +
    `❌ Thất bại: ${fail}\n` +
    `⏰ Hoàn thành: ${timeSan}` +
    (failed.length ? `\n📋 Nhóm thất bại:\n` + failed.slice(0,10).map((g,i)=>`${i+1}. ${g.name} (${g.id})`).join("\n") + (failed.length>10?`\n... và ${failed.length-10} nhóm khác`:"") : "");
  api.sendMessage(report, adminGroupID);
};

module.exports.handleReply = async function({ api, event, handleReply }) {
  const fs = require("fs");
  const path = require("path");
  const { createCanvas } = require("canvas");

  const adminGroupID = "6691735800885668";
  const userID = event.senderID;
  const replyContent = event.body;
  const currentThreadID = event.threadID;

  if (!replyContent || replyContent.trim() === "") {
    return api.sendMessage("⚠️ Vui lòng nhập nội dung phản hồi!", event.threadID, event.messageID);
  }

  function sanitizeKeepVN(input) {
    if (!input) return "";
    return String(input).replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, "");
  }
  function hiDPICanvas(w, h, r = 2) {
    const c = createCanvas(w * r, h * r);
    const x = c.getContext("2d");
    x.scale(r, r);
    return { canvas: c, ctx: x };
  }
  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = []; let line = "";
    for (let i=0;i<words.length;i++){
      const t = line ? line+" "+words[i] : words[i];
      if (ctx.measureText(t).width <= maxWidth) line = t;
      else { if (line) lines.push(line); line = words[i]; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function buildReplyCard({ title, body, userName, groupName, time, original }) {
    const W = 1200, PAD = 36, titlebar = 40, innerW = W - PAD*2;
    const { ctx } = hiDPICanvas(W, 10);
    ctx.font = `700 64px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const titleLines = wrapText(ctx, title, innerW);
    ctx.font = `400 48px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const bodyLines = wrapText(ctx, body, innerW);
    ctx.font = `500 36px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`;
    const meta1 = `Từ: ${userName}`, meta2 = `Nhóm: ${groupName}`, meta3 = `Thời gian: ${time}`, meta4 = `Thông báo gốc: "${original}"`;
    const lineHTitle = 78, lineHBody = 60, metaBlock = 42*4 + 12;
    const H = titlebar + PAD + titleLines.length*lineHTitle + 16 + bodyLines.length*lineHBody + 20 + metaBlock + PAD;
    const { canvas: C2, ctx: X } = hiDPICanvas(W, H);
    X.save(); X.shadowColor="rgba(0,0,0,0.35)"; X.shadowBlur=24; X.shadowOffsetY=12; roundedRect(X,0,0,W,H,18); X.fillStyle="#0D0D0D"; X.fill(); X.restore();
    roundedRect(X,0,0,W,H,18); X.clip();
    const gTitle = X.createLinearGradient(0,0,0,40); gTitle.addColorStop(0,"#242424"); gTitle.addColorStop(1,"#1A1A1A"); X.fillStyle=gTitle; X.fillRect(0,0,W,40);
    const colors=["#FF5F57","#FFBD2E","#28C840"]; [0,1,2].forEach(i=>{const cx=18+PAD+i*24, cy=20; X.beginPath(); X.arc(cx,cy,7,0,Math.PI*2); X.fillStyle=colors[i]; X.fill(); X.beginPath(); X.arc(cx-2,cy-2,2,0,Math.PI*2); X.fillStyle="rgba(255,255,255,0.7)"; X.fill();});
    const bg = X.createLinearGradient(0,40,0,H); bg.addColorStop(0,"#151515"); bg.addColorStop(1,"#0F0F0F"); X.fillStyle=bg; X.fillRect(0,40,W,H-40);
    let y = 40 + PAD;
    X.font = `700 64px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`; X.fillStyle="#EAEAEA"; titleLines.forEach(l=>{X.fillText(l,PAD,y); y+=lineHTitle;});
    y += 12;
    X.font = `400 48px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`; X.fillStyle="#D6D6D6"; bodyLines.forEach(l=>{X.fillText(l,PAD,y); y+=lineHBody;});
    y += 16;
    X.globalAlpha=0.35; X.strokeStyle="#FFFFFF"; X.lineWidth=1; X.beginPath(); X.moveTo(PAD,y); X.lineTo(W-PAD,y); X.stroke(); X.globalAlpha=1;
    y += 20;
    X.font = `500 36px "SF Pro Text","Segoe UI",Roboto,Helvetica,Arial`; X.fillStyle="#BBBBBB";
    X.fillText(meta1,PAD,y); y+=42; X.fillText(meta2,PAD,y); y+=42; X.fillText(meta3,PAD,y); y+=42; X.fillText(meta4,PAD,y);
    return C2;
  }

  try {
    const info = await api.getUserInfo(userID);
    const userName = sanitizeKeepVN(info[userID].name);
    const replySan = sanitizeKeepVN(replyContent);
    const timeSan = sanitizeKeepVN(new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }));
    const groupName = sanitizeKeepVN(handleReply.sourceThreadName || "Nhóm không tên");
    const original = sanitizeKeepVN(handleReply.originalContent || "");

    if (currentThreadID !== adminGroupID) {
      let tmpPath = null;
      try {
        const card = buildReplyCard({ title: "PHẢN HỒI TỪ USER", body: replySan, userName, groupName, time: timeSan, original });
        tmpPath = path.join(__dirname, `reply_card_${Date.now()}_${userID}.png`);
        fs.writeFileSync(tmpPath, card.toBuffer("image/png"));
        await api.sendMessage({ body: "", attachment: fs.createReadStream(tmpPath) }, adminGroupID);
      } catch (e) {
        console.error("[NOTI REPLY] Lỗi tạo/gửi ảnh reply:", e);
        await api.sendMessage(
          `PHAN HOI TU USER\n-----------------\n\nNoi dung: ${replySan}\n\n-----------------\nTu: ${userName}\nNhom: ${groupName}\nThong bao goc: "${original}"\nThoi gian: ${timeSan}\n-----------------`,
          adminGroupID
        );
      } finally {
        if (tmpPath && fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch {} }
      }
      return api.sendMessage(`✅ Đã chuyển phản hồi của bạn đến admin.`, event.threadID, event.messageID);
    } else {
      const adminReply =
        `PHAN HOI TU ADMIN\n` +
        `------------------\n\n` +
        `Noi dung: ${replySan}\n\n` +
        `------------------\n` +
        `Admin: ${userName}\n` +
        `Phan hoi cho thong bao: "${original}"\n` +
        `Thoi gian: ${timeSan}\n\n` +
        `------------------`;
      await api.sendMessage(adminReply, handleReply.sourceThreadID);
      return api.sendMessage(`✅ Đã gửi phản hồi đến người dùng.`, event.threadID, event.messageID);
    }
  } catch (e) {
    console.error("[NOTI REPLY] Lỗi khi xử lý phản hồi:", e);
    return api.sendMessage(`❌ Có lỗi xảy ra khi gửi phản hồi!\n📝 Chi tiết: ${e.message}`, event.threadID, event.messageID);
  }
};