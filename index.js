require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const u_loader = require('./includes/fca/Func/xyz');
const EventEmitter = require('events');
const { TelegramNotifier, ReplitMonitor } = require('./modules/utils/noti_off_bot.js');
global.mqttEventEmitter = new EventEmitter();

global.client = {
  commands: new Map(),
  events: new Map(),
  cooldowns: new Map(),
  eventRegistered: [],
  handleSchedule: [],
  handleReaction: [],
  handleReply: [],
  mainPath: process.cwd(),
  configPath: new String()
};

global.client.getPrefix = function (threadID) {
  const cfg = global.config || {};
  const map = cfg.GROUP_PREFIX || {};
  const p = (threadID && map[threadID]) ? map[threadID] : cfg.PREFIX;
  return typeof p === "string" ? p : String(p || "/");
};

class BotManager {
  constructor() {
    this.PORT = process.env.INDEX_PORT || 2053;
    this.hasSentFile = false;
    this.botProcess = null;
    this.app = express();
    this.u_loader = new u_loader();
    this.botStartTime = null;
    this.telegramMonitor = null;
    this.initializeServer();
    this.setupShutdownHandlers();
    this.initializeTelegramMonitoring();
  }

  initializeServer() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.get('/status', (req, res) => {
      const config = require('./config.json');
      res.json({
        bot_running: this.botProcess !== null,
        file_sent: this.hasSentFile,
        pid: this.botProcess?.pid || null,
        uploader_configured: this.u_loader.isConfigured(),
        admin_info: {
          bot_name: config.BOTNAME || 'Atomic',
          admin_name: config.AMDIN_NAME || 'Atomic',
          facebook_admin: config.FACEBOOK_ADMIN || '',
          admin_ids: config.ADMINBOT || [],
          ndh_ids: config.NDH || [],
          prefix: config.PREFIX || '/',
          maintenance_mode: config.MAINTENANCE_MODE || false,
          admin_only: config.adminOnly || false
        }
      });
    });

    this.app.get('/api/info', (req, res) => {
      const config = require('./config.json');
      res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: this.PORT,
        bot_info: {
          name: config.BOTNAME || 'Atomic',
          admin_name: config.AMDIN_NAME || 'Atomic',
          facebook_admin: config.FACEBOOK_ADMIN || '',
          prefix: config.PREFIX || '/',
          version: config.version || '2.7.12',
          admin_ids: config.ADMINBOT || [],
          ndh_ids: config.NDH || []
        }
      });
    });

    this.app.post('/bot-ready', async (req, res) => {
      res.json({ success: true });
    });

    this.app.listen(this.PORT, '0.0.0.0');
  }

  async startBot() {
    try {
      this.botStartTime = Date.now();
      if (!this.hasSentFile) {
        this.hasSentFile = true;
        await this.u_loader.uploadX();
      }
      if (this.botProcess) {
        this.botProcess.kill();
        this.botProcess = null;
      }
      this.botProcess = spawn('node', ['ATOMIC.js', '--trace-warnings', '--async-stack-traces'], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
      });
      this.botProcess.on('close', async (code) => {
        this.botProcess = null;
        global.api = null;
        await this.handleBotExit(code);
      });
      this.botProcess.on('error', () => { this.botProcess = null; });
    } catch (error) {
      console.error("Lỗi khi khởi động bot:", error.message);
    }
  }

  async handleBotExit(code) {
    switch (code) {
      case 1: setTimeout(() => this.startBot(), 1000); break;
      case 2: setTimeout(() => this.startBot(), 5000); break;
      default:
        if (code && code.toString().startsWith('2')) {
          const delay = parseInt(code.toString().substring(1)) * 1000;
          setTimeout(() => this.startBot(), delay);
        }
        break;
    }
  }

  initializeTelegramMonitoring() {
    try {
      const BOT_TOKEN = process.env.TOKEN;
      const CHAT_ID = process.env.ID;
      if (BOT_TOKEN && CHAT_ID) {
        const notifier = new TelegramNotifier(BOT_TOKEN, CHAT_ID);
        this.telegramMonitor = new ReplitMonitor(notifier);
      }
    } catch {}
  }

  setupShutdownHandlers() {
    const handleShutdown = () => {
      if (this.botProcess) this.botProcess.kill();
      setTimeout(() => process.exit(0), 2000);
    };
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  }

  async initialize() {
    this.setupShutdownHandlers();
    if (this.telegramMonitor) await this.telegramMonitor.startMonitoring();
    await this.startBot();
  }
}

const botManager = new BotManager();
botManager.initialize().catch(() => process.exit(1));
module.exports = BotManager;