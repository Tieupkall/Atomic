module.exports.config = {
    name: "cmd",
    version: "1.2.0",
    hasPermssion: 3,
    credits: "Mirai Team, fix atomic",
    description: "Quản lý/Kiểm soát toàn bộ module của bot với báo lỗi chi tiết",
    commandCategory: "Admin",
    usages: "[load/unload/loadAll/unloadAll/info/count/list] [tên module]",
    cooldowns: 3,
    dependencies: {
        "fs-extra": "",
        "child_process": "",
        "path": ""
    }
};

const path = require('path');
const commandsDir = __dirname;

// Hàm kiểm tra tên module an toàn
const isValidModuleName = (name) => {
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(name) && !name.includes('..') && !name.startsWith('.');
};

// Hàm trích xuất thông tin lỗi chi tiết
const extractErrorInfo = (error, fileName) => {
    let lineNumber = 'Unknown';
    let columnNumber = 'Unknown';
    let errorType = error.name || 'Error';
    
    if (error.stack) {
        const stackLines = error.stack.split('\n');
        
        // Tìm dòng đầu tiên chứa tên file
        for (let line of stackLines) {
            if (line.includes(fileName)) {
                // Tìm pattern :line:column
                const match = line.match(/:(\d+):(\d+)/);
                if (match) {
                    lineNumber = match[1];
                    columnNumber = match[2];
                    break;
                }
                // Fallback: chỉ có line number
                const lineMatch = line.match(/:(\d+)/);
                if (lineMatch) {
                    lineNumber = lineMatch[1];
                    break;
                }
            }
        }
    }
    
    return {
        type: errorType,
        message: error.message,
        line: lineNumber,
        column: columnNumber,
        file: fileName
    };
};

// Hàm gửi tin nhắn với auto-delete
const sendMessage = (api, msg, threadID, messageID, autoDelete = true) => {
    return api.sendMessage(msg, threadID, (err, info) => {
        if (!err && autoDelete && info?.messageID) {
            setTimeout(() => {
                try {
                    api.unsendMessage(info.messageID);
                } catch (e) {
                    console.log('Auto-delete message failed:', e.message);
                }
            }, 15000);
        }
    }, messageID);
};

const loadCommand = async function ({ moduleList, threadID, messageID }) {
    const { execSync } = require('child_process');
    const { writeFileSync, unlinkSync, readFileSync, existsSync } = global.nodemodule['fs-extra'];
    const { configPath, mainPath, api } = global.client;
    
    let logger;
    try {
        logger = require(path.join(mainPath, 'utils/log'));
    } catch {
        logger = console;
    }

    let errorList = [];
    let successList = [];

    try {
        // Backup config
        delete require.cache[require.resolve(configPath)];
        let configValue = require(configPath);
        writeFileSync(configPath + '.temp', JSON.stringify(configValue, null, 2), 'utf8');

        for (const nameModule of moduleList) {
            try {
                // Validate module name
                if (!isValidModuleName(nameModule)) {
                    throw new Error('Tên module không hợp lệ (chỉ chấp nhận a-z, A-Z, 0-9, _, -)');
                }

                const dirModule = path.join(commandsDir, nameModule + '.js');
                const fileName = nameModule + '.js';
                
                // Kiểm tra file tồn tại
                if (!existsSync(dirModule)) {
                    throw new Error('File không tồn tại');
                }

                // Clear cache và load module với error handling chi tiết
                delete require.cache[require.resolve(dirModule)];
                
                let command;
                try {
                    command = require(dirModule);
                } catch (requireError) {
                    const errorInfo = extractErrorInfo(requireError, fileName);
                    
                    logger.error?.(`[CMD] - ${errorInfo.type} in ${errorInfo.file}:${errorInfo.line}:${errorInfo.column} - ${errorInfo.message}`) ||
                    logger(`[CMD] - ${errorInfo.type} in ${errorInfo.file}:${errorInfo.line}:${errorInfo.column} - ${errorInfo.message}`);
                    
                    throw new Error(`${errorInfo.type} tại dòng ${errorInfo.line}: ${errorInfo.message}`);
                }

                // Validate module structure với thông tin chi tiết
                if (!command) {
                    throw new Error('Module trả về null/undefined');
                }
                
                if (!command.config) {
                    throw new Error('Module thiếu object config');
                }
                
                if (!command.run) {
                    throw new Error('Module thiếu function run');
                }

                if (!command.config.name) {
                    throw new Error('Module thiếu config.name');
                }
                
                if (!command.config.commandCategory) {
                    throw new Error('Module thiếu config.commandCategory');
                }

                // Remove old command
                global.client.commands.delete(nameModule);
                global.client.eventRegistered = global.client.eventRegistered.filter(info => info !== command.config.name);

                // Handle dependencies
                if (command.config.dependencies && typeof command.config.dependencies === 'object') {
                    try {
                        await handleDependencies(command, logger);
                    } catch (depError) {
                        throw new Error(`Dependencies error: ${depError.message}`);
                    }
                }

                // Handle environment config
                if (command.config.envConfig && typeof command.config.envConfig === 'object') {
                    try {
                        handleEnvConfig(command, configValue);
                        logger.info?.(`[CMD] - Loaded config ${command.config.name}`) || 
                        logger(`[CMD] - Loaded config ${command.config.name}`);
                    } catch (envError) {
                        throw new Error(`EnvConfig error: ${envError.message}`);
                    }
                }

                // Call onLoad if exists
                if (typeof command.onLoad === 'function') {
                    try {
                        await command.onLoad({ configValue });
                    } catch (onLoadError) {
                        const errorInfo = extractErrorInfo(onLoadError, fileName);
                        logger.warn?.(`[CMD] - OnLoad error for ${nameModule} at line ${errorInfo.line}: ${errorInfo.message}`) ||
                        logger(`[CMD] - OnLoad error for ${nameModule} at line ${errorInfo.line}: ${errorInfo.message}`);
                        
                        throw new Error(`OnLoad error tại dòng ${errorInfo.line}: ${errorInfo.message}`);
                    }
                }

                // Register event handler
                if (command.handleEvent) {
                    global.client.eventRegistered.push(command.config.name);
                }

                // Remove from disabled list
                global.config.commandDisabled = global.config.commandDisabled.filter(i => i !== nameModule + '.js');
                configValue.commandDisabled = configValue.commandDisabled.filter(i => i !== nameModule + '.js');

                // Add to commands
                global.client.commands.set(command.config.name, command);
                successList.push(nameModule);
                
                logger.info?.(`[CMD] - Loaded command ${command.config.name}!`) ||
                logger(`[CMD] - Loaded command ${command.config.name}!`);

            } catch (error) {
                const detailedError = `${nameModule}: ${error.message}`;
                errorList.push(`❌ ${detailedError}`);
                
                logger.error?.(`[CMD] - Error loading ${nameModule}: ${error.message}`) ||
                logger(`[CMD] - Error loading ${nameModule}: ${error.message}`);
            }
        }

        // Save config
        writeFileSync(configPath, JSON.stringify(configValue, null, 4), 'utf8');
        unlinkSync(configPath + '.temp');

    } catch (error) {
        logger.error?.(`[CMD] - Critical error: ${error.message}`) ||
        logger(`[CMD] - Critical error: ${error.message}`);
        
        // Restore backup if exists
        try {
            if (existsSync(configPath + '.temp')) {
                const backupData = readFileSync(configPath + '.temp', 'utf8');
                writeFileSync(configPath, backupData, 'utf8');
                unlinkSync(configPath + '.temp');
            }
        } catch (restoreError) {
            logger.error?.(`[CMD] - Failed to restore backup: ${restoreError.message}`) ||
            logger(`[CMD] - Failed to restore backup: ${restoreError.message}`);
        }
        
        return sendMessage(global.client.api, `❌ LỖI NGHIÊM TRỌNG:\n${error.message}`, threadID, messageID);
    }

    // Build result message với thông tin chi tiết
    let resultMessage = `🔄 LOAD COMMANDS RESULT\n\n`;
    
    if (successList.length > 0) {
        resultMessage += `✅ Thành công (${successList.length}):\n${successList.map(name => `• ${name}`).join('\n')}\n\n`;
    }
    
    if (errorList.length > 0) {
        resultMessage += `❌ Thất bại (${errorList.length}):\n`;
        // Hiển thị tối đa 3 lỗi đầu tiên với thông tin chi tiết
        resultMessage += errorList.slice(0, 3).join('\n');
        if (errorList.length > 3) {
            resultMessage += `\n📋 Và ${errorList.length - 3} lỗi khác...`;
        }
        resultMessage += `\n\n💡 Tip: Kiểm tra syntax, dependencies và cấu trúc module`;
    }

    return sendMessage(global.client.api, resultMessage, threadID, messageID);
};

// Hàm xử lý dependencies với error handling tốt hơn
const handleDependencies = async (command, logger) => {
    const { execSync } = require('child_process');
    const { readFileSync } = global.nodemodule['fs-extra'];

    try {
        const listPackage = JSON.parse(readFileSync('./package.json')).dependencies;
        const listBuiltinModules = require('module').builtinModules;

        for (const packageName in command.config.dependencies) {
            // Validate package name
            if (!/^[a-zA-Z0-9@/_-]+$/.test(packageName)) {
                throw new Error(`Package name không hợp lệ: ${packageName}`);
            }

            const moduleDir = path.join(global.client.mainPath, 'nodemodules', 'node_modules', packageName);
            let loadSuccess = false;

            try {
                if (listPackage.hasOwnProperty(packageName) || listBuiltinModules.includes(packageName)) {
                    global.nodemodule[packageName] = require(packageName);
                } else {
                    global.nodemodule[packageName] = require(moduleDir);
                }
                loadSuccess = true;
            } catch (loadError) {
                logger.warn?.(`[CMD] - Installing package ${packageName}...`) ||
                logger(`[CMD] - Installing package ${packageName}...`);
                
                // Install package with timeout
                const version = command.config.dependencies[packageName];
                const installCmd = `npm --package-lock false --save install ${packageName}${version ? '@' + version : ''}`;
                
                try {
                    execSync(installCmd, {
                        stdio: 'inherit',
                        env: process.env,
                        shell: true,
                        cwd: path.join(global.client.mainPath, 'nodemodules'),
                        timeout: 60000 // 60 seconds timeout
                    });

                    // Try to load again
                    for (let i = 0; i < 3; i++) {
                        try {
                            delete require.cache[require.resolve(packageName)];
                            if (listPackage.hasOwnProperty(packageName) || listBuiltinModules.includes(packageName)) {
                                global.nodemodule[packageName] = require(packageName);
                            } else {
                                global.nodemodule[packageName] = require(moduleDir);
                            }
                            loadSuccess = true;
                            break;
                        } catch (err) {
                            if (i === 2) throw err;
                        }
                    }
                } catch (installError) {
                    throw new Error(`Không thể cài đặt package ${packageName}: ${installError.message}`);
                }
            }

            if (!loadSuccess) {
                throw new Error(`Không thể tải package ${packageName}`);
            }
        }

        logger.info?.(`[CMD] - Loaded all packages for ${command.config.name}`) ||
        logger(`[CMD] - Loaded all packages for ${command.config.name}`);
        
    } catch (error) {
        throw new Error(`Dependency error: ${error.message}`);
    }
};

// Hàm xử lý environment config
const handleEnvConfig = (command, configValue) => {
    for (const [key, value] of Object.entries(command.config.envConfig)) {
        global.configModule[command.config.name] = global.configModule[command.config.name] || {};
        configValue[command.config.name] = configValue[command.config.name] || {};

        global.configModule[command.config.name][key] = configValue[command.config.name][key] || value;
        configValue[command.config.name][key] = configValue[command.config.name][key] || value;
    }
};

const unloadModule = function ({ moduleList, threadID, messageID }) {
    const { writeFileSync, unlinkSync, existsSync } = global.nodemodule["fs-extra"];
    const { configPath, mainPath, api } = global.client;
    
    let logger;
    try {
        logger = require(path.join(mainPath, "utils/log"));
    } catch {
        logger = console;
    }

    try {
        delete require.cache[require.resolve(configPath)];
        const configValue = require(configPath);
        writeFileSync(configPath + ".temp", JSON.stringify(configValue, null, 4), 'utf8');

        let successList = [];
        let errorList = [];

        for (const nameModule of moduleList) {
            try {
                if (!isValidModuleName(nameModule)) {
                    throw new Error('Tên module không hợp lệ');
                }

                // Check if command exists
                if (!global.client.commands.has(nameModule)) {
                    throw new Error('Module không tồn tại hoặc chưa được load');
                }

                global.client.commands.delete(nameModule);
                global.client.eventRegistered = global.client.eventRegistered.filter(item => item !== nameModule);
                
                if (!configValue.commandDisabled.includes(`${nameModule}.js`)) {
                    configValue.commandDisabled.push(`${nameModule}.js`);
                }
                
                if (!global.config.commandDisabled.includes(`${nameModule}.js`)) {
                    global.config.commandDisabled.push(`${nameModule}.js`);
                }

                successList.push(nameModule);
                logger.info?.(`[CMD] - Unloaded command ${nameModule}!`) ||
                logger(`[CMD] - Unloaded command ${nameModule}!`);

            } catch (error) {
                errorList.push(`❌ ${nameModule}: ${error.message}`);
            }
        }

        writeFileSync(configPath, JSON.stringify(configValue, null, 4), 'utf8');
        unlinkSync(configPath + ".temp");

        let resultMessage = `🔄 UNLOAD COMMANDS RESULT\n\n`;
        
        if (successList.length > 0) {
            resultMessage += `✅ Đã unload (${successList.length}): ${successList.join(', ')}\n\n`;
        }
        
        if (errorList.length > 0) {
            resultMessage += `❌ Lỗi (${errorList.length}):\n${errorList.join('\n')}`;
        }

        return sendMessage(api, resultMessage, threadID, messageID);

    } catch (error) {
        logger.error?.(`[CMD] - Unload error: ${error.message}`) ||
        logger(`[CMD] - Unload error: ${error.message}`);
        
        return sendMessage(global.client.api, `❌ Lỗi unload: ${error.message}`, threadID, messageID);
    }
};

module.exports.run = async function ({ event, args, api }) {
    const { threadID, messageID, senderID } = event;
    const { readdirSync } = global.nodemodule["fs-extra"];

    // Check permission
    if (!global.config.NDH.includes(senderID)) {
        return sendMessage(api, "⚠️ KHÔNG CÓ QUYỀN\nBạn không có quyền sử dụng lệnh này.", threadID, messageID);
    }

    // Validate input
    if (!args[0]) {
        const usage = `📋 CMD COMMAND USAGE v1.2.0\n\n` +
                     `🔧 Quản lý module:\n` +
                     `• \`.cmd load <tên>\` - Load module\n` +
                     `• \`.cmd unload <tên>\` - Unload module\n` +
                     `• \`.cmd loadAll\` - Load tất cả\n` +
                     `• \`.cmd unloadAll\` - Unload tất cả\n\n` +
                     `📊 Thông tin:\n` +
                     `• \`.cmd count\` - Số lượng commands\n` +
                     `• \`.cmd list\` - Danh sách commands\n` +
                     `• \`.cmd info <tên>\` - Thông tin chi tiết\n\n` +
                     `🆕 Tính năng mới: Hiển thị số dòng lỗi chi tiết\n` +
                     `⚠️ Lưu ý: Chỉ Admin mới có thể sử dụng`;
        
        return sendMessage(api, usage, threadID, messageID);
    }

    let moduleList = args.slice(1);

    try {
        switch (args[0].toLowerCase()) {
            case "count":
                const activeCommands = global.client.commands.size;
                const totalFiles = readdirSync(commandsDir).filter(f => f.endsWith(".js")).length;
                return sendMessage(api, 
                    `📊 COMMAND STATISTICS\n\n` +
                    `✅ Đang hoạt động: ${activeCommands} commands\n` +
                    `📁 Tổng files: ${totalFiles} files\n` +
                    `🔧 Tỷ lệ: ${Math.round((activeCommands / totalFiles) * 100)}%`, 
                    threadID, messageID);

            case "list":
                const commandNames = Array.from(global.client.commands.keys()).sort();
                const chunks = [];
                for (let i = 0; i < commandNames.length; i += 20) {
                    chunks.push(commandNames.slice(i, i + 20));
                }
                
                let listMessage = `📋 DANH SÁCH COMMANDS (${commandNames.length})\n\n`;
                listMessage += chunks[0].map((name, index) => `${index + 1}. ${name}`).join('\n');
                
                if (chunks.length > 1) {
                    listMessage += `\n\n... và ${commandNames.length - 20} commands khác`;
                }
                
                return sendMessage(api, listMessage, threadID, messageID);

            case "load":
                if (!moduleList.length) {
                    return sendMessage(api, "⚠️ Thiếu tham số\nVui lòng nhập tên module cần load.\n\nVí dụ: `.cmd load help`", threadID, messageID);
                }
                return await loadCommand({ moduleList, threadID, messageID });

            case "unload":
                if (!moduleList.length) {
                    return sendMessage(api, "⚠️ Thiếu tham số\nVui lòng nhập tên module cần unload.\n\nVí dụ: `.cmd unload help`", threadID, messageID);
                }
                return unloadModule({ moduleList, threadID, messageID });

            case "loadall":
                moduleList = readdirSync(commandsDir)
                    .filter(f => f.endsWith(".js") && !f.includes("example") && f !== "cmd.js")
                    .map(f => f.replace(/\.js$/, ""));
                
                if (moduleList.length === 0) {
                    return sendMessage(api, "⚠️ Không có module\nKhông tìm thấy module nào để load.", threadID, messageID);
                }
                
                return await loadCommand({ moduleList, threadID, messageID });

            case "unloadall":
                moduleList = Array.from(global.client.commands.keys()).filter(name => name !== "cmd");
                
                if (moduleList.length === 0) {
                    return sendMessage(api, "⚠️ Không có module\nKhông có module nào để unload.", threadID, messageID);
                }
                
                return unloadModule({ moduleList, threadID, messageID });

            case "info":
                const moduleName = moduleList.join("");
                if (!moduleName) {
                    return sendMessage(api, "⚠️ Thiếu tham số\nVui lòng nhập tên module cần xem info.\n\nVí dụ: `.cmd info help`", threadID, messageID);
                }
                
                const command = global.client.commands.get(moduleName);
                if (!command) {
                    return sendMessage(api, `⚠️ Không tìm thấy\nModule "${moduleName}" không tồn tại hoặc chưa được load.`, threadID, messageID);
                }
                
                const { name, version, hasPermssion, credits, cooldowns, dependencies, description } = command.config;
                const infoMessage = `📋 THÔNG TIN MODULE\n\n` +
                                  `📛 Tên: ${name}\n` +
                                  `👤 Tác giả: ${credits || 'Không rõ'}\n` +
                                  `🔢 Phiên bản: ${version || '1.0.0'}\n` +
                                  `🔐 Quyền: ${hasPermssion || 0}\n` +
                                  `⏱️ Cooldown: ${cooldowns || 0}s\n` +
                                  `📝 Mô tả: ${description || 'Không có mô tả'}\n` +
                                  `📦 Dependencies: ${Object.keys(dependencies || {}).join(", ") || "Không có"}`;
                
                return sendMessage(api, infoMessage, threadID, messageID);

            default:
                return sendMessage(api, 
                    `❓ LỆNH KHÔNG HỢP LỆ\n\n` +
                    `Lệnh "${args[0]}" không tồn tại.\n` +
                    `Sử dụng \`.cmd\` để xem hướng dẫn.`, 
                    threadID, messageID);
        }
    } catch (error) {
        console.error('CMD run error:', error);
        return sendMessage(api, `❌ LỖI THỰC THI:\n${error.message}`, threadID, messageID);
    }
};