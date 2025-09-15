
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/log.js');

class FileWatcher {
    constructor() {
        this.isWatching = false;
        this.watchers = [];
        this.debounceTimer = null;
        this.debounceDelay = 1000; // 1 giây delay để tránh reload liên tục
        
        // Paths to watch
        this.commandsPath = path.join(__dirname, '../modules/commands');
        this.eventsPath = path.join(__dirname, '../modules/events');
        this.includesPath = path.join(__dirname, '../includes');
        this.utilsPath = path.join(__dirname, '../utils');
        this.configPath = path.join(__dirname, '../config.json');
        this.fastConfigPath = path.join(__dirname, '../FastConfigFca.json');
        
        // Files to ignore
        this.ignoredPaths = [
            '**/node_modules/**',
            '**/cache/**',
            '**/data/**',
            '**/checktt/**',
            '**/checktt_backup/**',
            '**/backup_images/**',
            '**/LunarKrystal/**',
            '**/Horizon_Database/**',
            '**/*.sqlite',
            '**/*.json',
            '**/*.log',
            '**/appstate.json',
            '**/package-lock.json'
        ];
    }

    async startWatching() {
        if (this.isWatching) {
            return;
        }

        // Kiểm tra DeveloperMode trước khi bắt đầu
        if (!global.config.DeveloperMode) {
            
            return;
        }

        try {
            // Watch commands directory
            const commandWatcher = chokidar.watch(this.commandsPath, {
                ignored: this.ignoredPaths,
                persistent: true,
                ignoreInitial: true
            });

            commandWatcher.on('change', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('command', filePath);
                }
            });

            commandWatcher.on('add', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('command', filePath);
                }
            });

            commandWatcher.on('unlink', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileDelete('command', filePath);
                }
            });

            // Watch events directory
            const eventWatcher = chokidar.watch(this.eventsPath, {
                ignored: this.ignoredPaths,
                persistent: true,
                ignoreInitial: true
            });

            eventWatcher.on('change', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('event', filePath);
                }
            });

            eventWatcher.on('add', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('event', filePath);
                }
            });

            eventWatcher.on('unlink', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileDelete('event', filePath);
                }
            });

            // Watch includes directory
            const includesWatcher = chokidar.watch(this.includesPath, {
                ignored: this.ignoredPaths,
                persistent: true,
                ignoreInitial: true
            });

            includesWatcher.on('change', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('includes', filePath);
                }
            });

            // Watch utils directory
            const utilsWatcher = chokidar.watch(this.utilsPath, {
                ignored: this.ignoredPaths,
                persistent: true,
                ignoreInitial: true
            });

            utilsWatcher.on('change', (filePath) => {
                if (filePath.endsWith('.js')) {
                    this.handleFileChange('utils', filePath);
                }
            });

            // Watch config files
            const configWatcher = chokidar.watch([this.configPath, this.fastConfigPath], {
                persistent: true,
                ignoreInitial: true
            });

            configWatcher.on('change', (filePath) => {
                this.handleConfigChange(filePath);
            });

            this.watchers = [commandWatcher, eventWatcher, includesWatcher, utilsWatcher, configWatcher];
            this.isWatching = true;

            logger.loader('🔍 File Watcher đã bắt đầu theo dõi thay đổi files', 'success');

        } catch (error) {
            logger.loader(`❌ Lỗi khởi động File Watcher: ${error.message}`, 'error');
        }
    }

    handleFileChange(type, filePath) {
        // Debounce để tránh reload liên tục khi save file
        clearTimeout(this.debounceTimer);
        
        this.debounceTimer = setTimeout(async () => {
            const fileName = path.basename(filePath, '.js');
            
            try {
                if (type === 'command') {
                    await this.reloadCommand(fileName, filePath);
                } else if (type === 'event') {
                    await this.reloadEvent(fileName, filePath);
                } else if (type === 'includes' || type === 'utils') {
                    await this.reloadSystemFile(type, fileName, filePath);
                }
            } catch (error) {
                logger.loader(`❌ Lỗi reload ${type} ${fileName}: ${error.message}`, 'error');
            }
        }, this.debounceDelay);
    }

    handleConfigChange(filePath) {
        clearTimeout(this.debounceTimer);
        
        this.debounceTimer = setTimeout(async () => {
            const fileName = path.basename(filePath);
            
            try {
                await this.reloadConfig(fileName, filePath);
            } catch (error) {
                logger.loader(`❌ Lỗi reload config ${fileName}: ${error.message}`, 'error');
            }
        }, this.debounceDelay);
    }

    handleFileDelete(type, filePath) {
        const fileName = path.basename(filePath, '.js');
        
        try {
            if (type === 'command') {
                if (global.client.commands.has(fileName)) {
                    global.client.commands.delete(fileName);
                    logger.loader(`🗑️ Đã xóa command: ${fileName}`, 'warn');
                }
            } else if (type === 'event') {
                if (global.client.events.has(fileName)) {
                    global.client.events.delete(fileName);
                    logger.loader(`🗑️ Đã xóa event: ${fileName}`, 'warn');
                }
            }
        } catch (error) {
            logger.loader(`❌ Lỗi xóa ${type} ${fileName}: ${error.message}`, 'error');
        }
    }

    async reloadCommand(commandName, filePath) {
        try {
            // Clear require cache
            const resolvedPath = require.resolve(filePath);
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }

            // Reload command
            const command = require(filePath);
            
            if (!command.config || !command.run || !command.config.commandCategory) {
                throw new Error('Command format không hợp lệ');
            }

            // Handle dependencies if any
            if (command.config.dependencies && typeof command.config.dependencies === 'object') {
                for (const dependency in command.config.dependencies) {
                    try {
                        if (!global.nodemodule.hasOwnProperty(dependency)) {
                            global.nodemodule[dependency] = require(dependency);
                        }
                    } catch (depError) {
                        logger.loader(`⚠️ Dependency ${dependency} cho ${commandName} không tìm thấy`, 'warn');
                    }
                }
            }

            // Handle onLoad if exists
            if (command.onLoad) {
                try {
                    await command.onLoad({
                        api: global.client.api,
                        models: global.models,
                        Users: global.data?.Users,
                        Threads: global.data?.Threads,
                        Currencies: global.data?.Currencies
                    });
                } catch (onLoadError) {
                    logger.loader(`⚠️ OnLoad error cho ${commandName}: ${onLoadError.message}`, 'warn');
                }
            }

            // Update global commands
            global.client.commands.set(command.config.name, command);
            
            logger.loader(`🔄 Đã reload command: ${commandName}`, 'success');

        } catch (error) {
            logger.loader(`❌ Lỗi reload command ${commandName}: ${error.message}`, 'error');
        }
    }

    async reloadEvent(eventName, filePath) {
        try {
            // Clear require cache
            const resolvedPath = require.resolve(filePath);
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }

            // Reload event
            const event = require(filePath);
            
            if (!event.config || !event.run) {
                throw new Error('Event format không hợp lệ');
            }

            // Handle dependencies if any
            if (event.config.dependencies && typeof event.config.dependencies === 'object') {
                for (const dependency in event.config.dependencies) {
                    try {
                        if (!global.nodemodule.hasOwnProperty(dependency)) {
                            global.nodemodule[dependency] = require(dependency);
                        }
                    } catch (depError) {
                        logger.loader(`⚠️ Dependency ${dependency} cho ${eventName} không tìm thấy`, 'warn');
                    }
                }
            }

            // Handle onLoad if exists
            if (event.onLoad) {
                try {
                    await event.onLoad({
                        api: global.client.api,
                        models: global.models,
                        Users: global.data?.Users,
                        Threads: global.data?.Threads,
                        Currencies: global.data?.Currencies
                    });
                } catch (onLoadError) {
                    logger.loader(`⚠️ OnLoad error cho ${eventName}: ${onLoadError.message}`, 'warn');
                }
            }

            // Update global events
            global.client.events.set(event.config.name, event);
            
            logger.loader(`🔄 Đã reload event: ${eventName}`, 'success');

        } catch (error) {
            logger.loader(`❌ Lỗi reload event ${eventName}: ${error.message}`, 'error');
        }
    }

    stopWatching() {
        if (!this.isWatching) {
            return;
        }

        this.watchers.forEach(watcher => {
            if (watcher && typeof watcher.close === 'function') {
                watcher.close();
            }
        });

        this.watchers = [];
        this.isWatching = false;
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        logger.loader('🛑 File Watcher đã dừng', 'warn');
    }

    async reloadSystemFile(type, fileName, filePath) {
        try {
            // Clear require cache
            const resolvedPath = require.resolve(filePath);
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }

            // Clear related cache
            Object.keys(require.cache).forEach(key => {
                if (key.includes(fileName) && key.endsWith('.js')) {
                    delete require.cache[key];
                }
            });

            logger.loader(`🔄 Đã reload ${type} file: ${fileName}`, 'success');

        } catch (error) {
            logger.loader(`❌ Lỗi reload ${type} file ${fileName}: ${error.message}`, 'error');
        }
    }

    async reloadConfig(fileName, filePath) {
        try {
            if (fileName === 'config.json') {
                // Reload main config
                const newConfig = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
                
                // Update global config
                Object.keys(newConfig).forEach(key => {
                    global.config[key] = newConfig[key];
                });

                // Restart FileWatcher if DeveloperMode changed
                if (global.config.DeveloperMode && !this.isWatching) {
                    await this.startWatching();
                } else if (!global.config.DeveloperMode && this.isWatching) {
                    this.stopWatching();
                }

                logger.loader(`🔄 Đã reload config.json`, 'success');
                
            } else if (fileName === 'FastConfigFca.json') {
                // Clear cache for FCA config
                const resolvedPath = require.resolve(filePath);
                if (require.cache[resolvedPath]) {
                    delete require.cache[resolvedPath];
                }
                
                logger.loader(`🔄 Đã reload FastConfigFca.json`, 'success');
            }

        } catch (error) {
            logger.loader(`❌ Lỗi reload config ${fileName}: ${error.message}`, 'error');
        }
    }

    getStatus() {
        return {
            isWatching: this.isWatching,
            watchersCount: this.watchers.length,
            commandsPath: this.commandsPath,
            eventsPath: this.eventsPath,
            includesPath: this.includesPath,
            utilsPath: this.utilsPath,
            watchedPaths: [
                this.commandsPath,
                this.eventsPath,
                this.includesPath,
                this.utilsPath,
                this.configPath,
                this.fastConfigPath
            ]
        };
    }
}

module.exports = FileWatcher;
