const fs = require('fs');
const axios = require('axios');
const path = require('path');

module.exports.config = {
    name: "image",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Atomic",
    description: "Tạo hình ảnh từ mô tả bằng AI",
    commandCategory: "Tiện ích",
    usages: "[mô tả hình ảnh]",
    cooldowns: 10
};

module.exports.run = async ({ api, event, args }) => {
    try {
        const input = args.join(" ");
        const parts = input.split("|").map(part => part.trim());
        
        let prompt = parts[0] || "Phong cảnh đẹp";
        let width = parseInt(parts[1]) || 1024;
        let height = parseInt(parts[2]) || 1024;
        let seed = parseInt(parts[3]) || Math.floor(Math.random() * 1000000);
        let model = parts[4] || "flux-realism";
        
        const realisticModels = ["flux-realism", "realistic", "photorealistic"];
        if (realisticModels.includes(model.toLowerCase())) {
            if (!prompt.toLowerCase().includes("realistic") && 
                !prompt.toLowerCase().includes("photorealistic") && 
                !prompt.toLowerCase().includes("photography")) {
                prompt = `ảnh thực tế, chất lượng cao, chi tiết, chụp chuyên nghiệp, ${prompt}`;
            }
        }
        
        if (width > 2048) width = 2048;
        if (height > 2048) height = 2048;
        if (width < 128) width = 128;
        if (height < 128) height = 128;
        
        if (!prompt || prompt.trim() === "") {
            return api.sendMessage("❌ Vui lòng nhập mô tả hình ảnh!\n\nCách dùng: !image [mô tả]\n\nVí dụ:\n• !image Cô gái xinh đẹp\n• !image Con mèo đang ngủ\n• !image Phố Tokyo ban đêm", event.threadID);
        }
        
        const processingMsg = await api.sendMessage(`Đang tạo... ${args.join(" ")}`, event.threadID);
        
        const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`;
        
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream',
            timeout: 60000 
        });
        
        const cacheDir = path.join(__dirname, 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const fileName = `image_${Date.now()}_${seed}.png`;
        const filePath = path.join(cacheDir, fileName);
        
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const imageAttachment = fs.createReadStream(filePath);
        
        await api.sendMessage({
            attachment: imageAttachment
        }, event.threadID);
        
        api.unsendMessage(processingMsg.messageID);
        
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }, 5000);
        
    } catch (error) {
        console.error("Lỗi lệnh image:", error);
        
        let errorMessage = "❌ Lỗi tạo ảnh!";
        
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            errorMessage += "\n⏰ Hết thời gian chờ";
        } else if (error.response?.status === 429) {
            errorMessage += "\n🚫 Quá nhiều yêu cầu";
        } else if (error.response?.status >= 500) {
            errorMessage += "\n🔧 Lỗi máy chủ";
        } else {
            errorMessage += `\n🐛 ${error.message}`;
        }
        
        api.sendMessage(errorMessage, event.threadID);
    }
};

module.exports.handleEvent = async ({ api, event }) => {
};