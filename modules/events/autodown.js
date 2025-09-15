const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { exec: ytdlp } = require("yt-dlp-exec");

const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

module.exports.config = {
  name: "autodown",
  eventType: ["message"],
  version: "1.0.4",
  credits: "atomic",
  description: "Tự động tải video từ TikTok, YouTube và các nền tảng khác"
};

const linkRegex = /(https?:\/\/[^\s]+)/gi;
const supported = [
  "tiktok.com","youtube.com","youtu.be","facebook.com","fb.watch",
  "instagram.com","twitter.com","x.com","threads.net","soundcloud.com",
  "i.ibb.co","vm.tiktok.com","vt.tiktok.com","m.tiktok.com"
];
const isYouTube = u => u.includes("youtu.be") || u.includes("youtube.com");
const rmIf = p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {} };

function fmtDuration(sec) {
  sec = parseInt(sec) || 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
  return `${m}:${s.toString().padStart(2,"0")}`;
}

async function getYtMeta(url) {
  try {
    const out = await ytdlp(url, { print: "%(title)s|%(duration,0)d", noWarnings: true, noCheckCertificates: true });
    const first = out.toString().trim().split("\n")[0];
    const [title, d] = first.split("|");
    return { title: title?.trim() || "YouTube", duration: parseInt(d, 10) || 0 };
  } catch {
    return { title: "YouTube", duration: 0 };
  }
}

async function downloadYouTube(url) {
  const meta = await getYtMeta(url);
  const chain = [
    { tag: "720p", fmt: "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]" },
    { tag: "480p", fmt: "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]" },
    { tag: "360p", fmt: "bestvideo[ext=mp4][height<=360]+bestaudio[ext=m4a]/best[ext=mp4][height<=360]" },
    { tag: "Auto", fmt: "best[filesize<25M]/best[ext=mp4]" }
  ];
  for (const step of chain) {
    const file = path.join(cacheDir, `yt_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
    try {
      await ytdlp(url, {
        output: file,
        format: step.fmt,
        mergeOutputFormat: "mp4",
        noWarnings: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
        addHeader: ["referer:youtube.com"]
      });
      const s = fs.statSync(file);
      if (s.size > 0 && s.size <= 25 * 1024 * 1024) {
        return { file, title: meta.title, duration: meta.duration, quality: step.tag };
      }
      rmIf(file);
    } catch { rmIf(file); }
  }
  return null;
}

module.exports.run = async function ({ api, event, Threads }) {
  const { threadID, messageID, body, senderID } = event;
  if (senderID === api.getCurrentUserID()) return;
  if (!body?.trim()) return;

  const data = (await Threads.getData(threadID)).data || {};
  if (!data.autodown) return;

  const links = body.match(linkRegex)?.filter(u => supported.some(p => u.includes(p)));
  if (!links?.length) return;

  for (const url of links) {
    try {
      api.setMessageReaction("⏳", messageID);

      if (isYouTube(url)) {
        const yt = await downloadYouTube(url);
        if (!yt) { api.setMessageReaction("⚠️", messageID); continue; }
        await new Promise(resolve =>
          api.sendMessage(
            {
              body: `🎶 ${yt.title}\n⏱ Thời lượng: ${fmtDuration(yt.duration)}\n📺 Chất lượng: ${yt.quality}`,
              attachment: fs.createReadStream(yt.file)
            },
            threadID,
            () => { rmIf(yt.file); api.setMessageReaction("✅", messageID); resolve(); },
            messageID
          )
        );
        await new Promise(r => setTimeout(r, 400));
        continue;
      }

      const apiUrl = `https://qt-dev.vercel.app/api/download?url=${encodeURIComponent(url)}`;
      const res = await axios.get(apiUrl, {
        timeout: 30000,
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        validateStatus: s => s < 500
      });
      if (!res.data || res.data.error === true || res.data.error === "true") { api.setMessageReaction("⚠️", messageID); continue; }
      const result = res.data;

      let media = result.medias?.find(m => m.quality === "hd_no_watermark" && m.type === "video")
        || result.medias?.find(m => m.quality === "no_watermark" && m.type === "video")
        || result.medias?.find(m => m.type === "video")
        || result.medias?.find(m => m.type === "audio")
        || (result.medias ? result.medias[0] : null);

      const mediaUrl = media?.url;
      if (!mediaUrl) { api.setMessageReaction("⚠️", messageID); continue; }

      const ext = media.extension ? `.${media.extension}` : (media.type === "audio" ? ".mp3" : media.type === "video" ? ".mp4" : ".jpg");
      const file = path.join(cacheDir, `dl_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

      const bin = await axios.get(mediaUrl, { responseType: "arraybuffer", timeout: 60000, maxContentLength: 50 * 1024 * 1024, headers: { "User-Agent": "Mozilla/5.0" } });
      fs.writeFileSync(file, bin.data);

      const sz = fs.statSync(file).size;
      if (sz === 0 || sz > 25 * 1024 * 1024) { rmIf(file); api.setMessageReaction("⚠️", messageID); continue; }

      await new Promise(resolve =>
        api.sendMessage(
          { body: result.title ? `📥 ${result.title}` : "📥 Đã tải xuống", attachment: fs.createReadStream(file) },
          threadID,
          () => { api.setMessageReaction("✅", messageID); rmIf(file); resolve(); },
          messageID
        )
      );
      setTimeout(() => rmIf(file), 60000);
      await new Promise(r => setTimeout(r, 400));
    } catch {
      api.setMessageReaction("⚠️", messageID);
    }
  }
};