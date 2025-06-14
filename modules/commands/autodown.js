const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "autodown",
  version: "2.1.0",
  hasPermssion: 0,
  credits: "atomic",
  description: "Tải video từ TikTok và YouTube bằng API",
  commandCategory: "Tiện ích",
  usages: "[link TikTok | YouTube]",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID } = event;
  const url = args[0];
  if (!url) return api.sendMessage("❌ Vui lòng nhập link TikTok hoặc YouTube.", threadID, messageID);

  const filePath = path.join(__dirname, "cache", `video_${Date.now()}.mp4`);

  try {
    if (url.includes("tiktok.com")) {
      const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
      if (!res.data?.data?.play) throw new Error("Không lấy được link tải.");

      const videoUrl = res.data.data.play;
      const videoRes = await axios.get(videoUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(filePath, videoRes.data);
    }

    else if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const ytApi = `https://api.vevioz.com/api/button/mp4?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(ytApi);
      const match = data.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
      if (!match) throw new Error("Không tìm được link tải video YouTube.");

      const videoUrl = match[1];
      const videoRes = await axios.get(videoUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(filePath, videoRes.data);
    }

    else {
      return api.sendMessage("❌ Link không hợp lệ. Hỗ trợ TikTok và YouTube.", threadID, messageID);
    }

    return api.sendMessage({
      body: "🎬 Video bạn yêu cầu đây!",
      attachment: fs.createReadStream(filePath)
    }, threadID, () => fs.unlinkSync(filePath), messageID);

  } catch (err) {
    console.error(err);
    return api.sendMessage("❌ Không thể tải video. Link có thể không hợp lệ hoặc API bị lỗi.", threadID, messageID);
  }
};