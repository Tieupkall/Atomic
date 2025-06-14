module.exports.config = {
    name: "reload",
    version: "1.0.3",
    hasPermssion: 0,
    credits: "Atomic",
    description: "Reload các file handle events với xử lý lỗi tốt hơn",
    commandCategory: "Admin",
    usages: "[handle/all] [tên file]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
    const fs = require("fs");
    const path = require("path");
    const { threadID, messageID } = event;
    
    try {
        const type = args[0]?.toLowerCase() || "handle";
        const specificFile = args[1];
        
        let result = "";
        
        // Chỉ reload Handle Events
        if (type === "handle" || type === "all") {
            const handlePath = path.join(__dirname, "..", "..", "includes", "handle");
            
            if (fs.existsSync(handlePath)) {
                const countBefore = global.client?.events?.size || 0;
                
                if (!global.client) global.client = {};
                if (!global.client.events) global.client.events = new Map();
                
                // Không clear all nếu chỉ reload 1 file cụ thể
                if (!specificFile) {
                    global.client.events.clear();
                }
                
                const files = fs.readdirSync(handlePath).filter(file => file.endsWith(".js"));
                let loaded = 0, failed = [], skipped = 0;
                
                for (const file of files) {
                    if (specificFile && file !== specificFile && !file.includes(specificFile)) {
                        skipped++;
                        continue;
                    }
                    
                    const fullPath = path.join(handlePath, file);
                    try {
                        delete require.cache[require.resolve(fullPath)];
                        const eventModule = require(fullPath);
                        
                        // Handle files có thể không có config, sử dụng tên file làm key
                        let eventName = file.replace('.js', '');
                        let eventConfig = eventModule.config || {
                            name: eventName,
                            version: "1.0.0",
                            credits: "Unknown",
                            description: `Handle event: ${eventName}`
                        };
                        
                        // Nếu có config thì dùng config name
                        if (eventModule.config?.name) {
                            eventName = eventModule.config.name;
                            eventConfig = eventModule.config;
                        }
                        
                        // Remove old event if reloading specific file
                        if (specificFile && global.client.events.has(eventName)) {
                            global.client.events.delete(eventName);
                        }
                        
                        global.client.events.set(eventName, {
                            config: eventConfig,
                            handleEvent: eventModule.handleEvent,
                            run: eventModule.run,
                            onLoad: eventModule.onLoad,
                            path: fullPath,
                            fileName: file
                        });
                        
                        // Gọi onLoad nếu có
                        if (typeof eventModule.onLoad === "function") {
                            try {
                                await eventModule.onLoad();
                            } catch (onLoadError) {
                                console.warn(`OnLoad warning for ${file}:`, onLoadError.message);
                            }
                        }
                        
                        loaded++;
                        
                    } catch (error) {
                        failed.push(`${file} (${error.message.substring(0, 50)})`);
                        console.error(`Error loading handle ${file}:`, error);
                    }
                }
                
                result += `🔄 **Handle Events Reload:**\n`;
                result += `📦 Trước: ${countBefore} | Sau: ${global.client.events.size}\n`;
                result += `✅ Load thành công: ${loaded}\n`;
                result += `❌ Load thất bại: ${failed.length}\n`;
                if (specificFile && skipped > 0) {
                    result += `⏭️ Bỏ qua: ${skipped}\n`;
                }
                if (failed.length > 0) {
                    result += `📋 Lỗi: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? `... (+${failed.length - 3})` : ""}\n`;
                }
                result += "\n";
            } else {
                result += "❌ Không tìm thấy thư mục handle events\n\n";
            }
        }
        
        // Thông báo kết quả
        if (result) {
            const finalMessage = `🔄 **RELOAD HANDLE EVENTS COMPLETED**\n\n${result}` +
                               `${specificFile ? `🎯 **Target File:** ${specificFile}\n` : ""}` +
                               `⏰ **Thời gian:** ${new Date().toLocaleTimeString()}\n` +
                               `💾 **Tổng Events:** ${global.client?.events?.size || 0}`;
            
            return api.sendMessage(finalMessage, threadID, messageID);
        } else {
            const usageMessage = `❓ **Cách sử dụng RELOAD HANDLE:**\n\n` +
                               `🔄 **Reload tất cả handle events:**\n` +
                               `• \`.reload handle\` - Reload toàn bộ events\n` +
                               `• \`.reload all\` - Tương tự reload handle\n\n` +
                               `📁 **Reload file handle cụ thể:**\n` +
                               `• \`.reload handle handleCommand.js\`\n` +
                               `• \`.reload handle antiout.js\`\n` +
                               `• \`.reload handle welcome.js\`\n\n` +
                               `💡 **Lưu ý:** \n` +
                               `• Chỉ reload handle events, không reload commands\n` +
                               `• Sử dụng tên file đầy đủ để tránh nhầm lẫn\n` +
                               `• File phải có đuôi .js`;
            
            return api.sendMessage(usageMessage, threadID, messageID);
        }
        
    } catch (error) {
        console.error("Reload handle error:", error);
        
        const errorMessage = `❌ **LỖI RELOAD HANDLE EVENTS:**\n\n` +
                           `🚨 **Error:** ${error.message}\n` +
                           `📝 **Type:** ${error.name}\n` +
                           `🔧 **Args:** [${args.join(", ")}]\n\n` +
                           `🛠️ **Troubleshooting:**\n` +
                           `• Kiểm tra đường dẫn thư mục includes/handle\n` +
                           `• Kiểm tra syntax các file handle\n` +
                           `• Đảm bảo file handle có module.exports hợp lệ\n` +
                           `• Restart bot nếu cần thiết`;
        
        return api.sendMessage(errorMessage, threadID, messageID);
    }
};module.exports.config = {
    name: "reload",
    version: "1.0.3",
    hasPermssion: 2,
    credits: "KrystalGPT",
    description: "Reload các file handle events với xử lý lỗi tốt hơn",
    commandCategory: "Hệ thống",
    usages: "[handle/all] [tên file]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
    const fs = require("fs");
    const path = require("path");
    const { threadID, messageID } = event;
    
    try {
        const type = args[0]?.toLowerCase() || "handle";
        const specificFile = args[1];
        
        let result = "";
        
        // Chỉ reload Handle Events
        if (type === "handle" || type === "all") {
            const handlePath = path.join(__dirname, "..", "..", "includes", "handle");
            
            if (fs.existsSync(handlePath)) {
                const countBefore = global.client?.events?.size || 0;
                
                if (!global.client) global.client = {};
                if (!global.client.events) global.client.events = new Map();
                
                // Không clear all nếu chỉ reload 1 file cụ thể
                if (!specificFile) {
                    global.client.events.clear();
                }
                
                const files = fs.readdirSync(handlePath).filter(file => file.endsWith(".js"));
                let loaded = 0, failed = [], skipped = 0;
                
                for (const file of files) {
                    if (specificFile && file !== specificFile && !file.includes(specificFile)) {
                        skipped++;
                        continue;
                    }
                    
                    const fullPath = path.join(handlePath, file);
                    try {
                        delete require.cache[require.resolve(fullPath)];
                        const eventModule = require(fullPath);
                        
                        // Handle files có thể không có config, sử dụng tên file làm key
                        let eventName = file.replace('.js', '');
                        let eventConfig = eventModule.config || {
                            name: eventName,
                            version: "1.0.0",
                            credits: "Unknown",
                            description: `Handle event: ${eventName}`
                        };
                        
                        // Nếu có config thì dùng config name
                        if (eventModule.config?.name) {
                            eventName = eventModule.config.name;
                            eventConfig = eventModule.config;
                        }
                        
                        // Remove old event if reloading specific file
                        if (specificFile && global.client.events.has(eventName)) {
                            global.client.events.delete(eventName);
                        }
                        
                        global.client.events.set(eventName, {
                            config: eventConfig,
                            handleEvent: eventModule.handleEvent,
                            run: eventModule.run,
                            onLoad: eventModule.onLoad,
                            path: fullPath,
                            fileName: file
                        });
                        
                        // Gọi onLoad nếu có
                        if (typeof eventModule.onLoad === "function") {
                            try {
                                await eventModule.onLoad();
                            } catch (onLoadError) {
                                console.warn(`OnLoad warning for ${file}:`, onLoadError.message);
                            }
                        }
                        
                        loaded++;
                        
                    } catch (error) {
                        failed.push(`${file} (${error.message.substring(0, 50)})`);
                        console.error(`Error loading handle ${file}:`, error);
                    }
                }
                
                result += `🔄 Handle Events Reload:\n`;
                result += `📦 Trước: ${countBefore} | Sau: ${global.client.events.size}\n`;
                result += `✅ Load thành công: ${loaded}\n`;
                result += `❌ Load thất bại: ${failed.length}\n`;
                if (specificFile && skipped > 0) {
                    result += `⏭️ Bỏ qua: ${skipped}\n`;
                }
                if (failed.length > 0) {
                    result += `📋 Lỗi: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? `... (+${failed.length - 3})` : ""}\n`;
                }
                result += "\n";
            } else {
                result += "❌ Không tìm thấy thư mục handle events\n\n";
            }
        }
        
        // Thông báo kết quả
        if (result) {
            const finalMessage = `🔄 RELOAD HANDLE EVENTS COMPLETED\n\n${result}` +
                               `${specificFile ? `🎯 Target File: ${specificFile}\n` : ""}` +
                               `⏰ Thời gian: ${new Date().toLocaleTimeString()}\n` +
                               `💾 Tổng Events: ${global.client?.events?.size || 0}`;
            
            return api.sendMessage(finalMessage, threadID, messageID);
        } else {
            const usageMessage = `❓ Cách sử dụng RELOAD HANDLE:\n\n` +
                               `🔄 Reload tất cả handle events:\n` +
                               `• \`.reload handle\` - Reload toàn bộ events\n` +
                               `• \`.reload all\` - Tương tự reload handle\n\n` +
                               `📁 Reload file handle cụ thể:\n` +
                               `• \`.reload handle handleCommand.js\`\n` +
                               `• \`.reload handle antiout.js\`\n` +
                               `• \`.reload handle welcome.js\`\n\n` +
                               `💡 Lưu ý: \n` +
                               `• Chỉ reload handle events, không reload commands\n` +
                               `• Sử dụng tên file đầy đủ để tránh nhầm lẫn\n` +
                               `• File phải có đuôi .js`;
            
            return api.sendMessage(usageMessage, threadID, messageID);
        }
        
    } catch (error) {
        console.error("Reload handle error:", error);
        
        const errorMessage = `❌ LỖI RELOAD HANDLE EVENTS:\n\n` +
                           `🚨 Error: ${error.message}\n` +
                           `📝 Type: ${error.name}\n` +
                           `🔧 Args: [${args.join(", ")}]\n\n` +
                           `🛠️ Troubleshooting:\n` +
                           `• Kiểm tra đường dẫn thư mục includes/handle\n` +
                           `• Kiểm tra syntax các file handle\n` +
                           `• Đảm bảo file handle có module.exports hợp lệ\n` +
                           `• Restart bot nếu cần thiết`;
        
        return api.sendMessage(errorMessage, threadID, messageID);
    }
};