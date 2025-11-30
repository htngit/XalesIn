"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const whatsappWeb_js = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const qrcode__namespace = /* @__PURE__ */ _interopNamespaceDefault(qrcode);
class WhatsAppManager {
  constructor(mainWindow2) {
    __publicField(this, "client", null);
    __publicField(this, "mainWindow", null);
    __publicField(this, "status", "disconnected");
    this.mainWindow = mainWindow2;
    this.initializeClient();
  }
  /**
   * Initialize WhatsApp client with LocalAuth strategy
   */
  initializeClient() {
    try {
      console.log("[WhatsAppManager] Initializing client...");
      this.client = new whatsappWeb_js.Client({
        authStrategy: new whatsappWeb_js.LocalAuth({
          dataPath: ".wwebjs_auth"
        }),
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu"
          ]
        }
      });
      this.setupEventHandlers();
    } catch (error) {
      console.error("[WhatsAppManager] Error initializing client:", error);
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
    }
  }
  /**
   * Setup event handlers for WhatsApp client
   */
  setupEventHandlers() {
    if (!this.client) return;
    this.client.on("qr", (qr) => {
      console.log("[WhatsAppManager] QR Code received");
      qrcode__namespace.generate(qr, { small: true });
      if (this.mainWindow) {
        this.mainWindow.webContents.send("whatsapp:qr-code", qr);
      }
      this.status = "connecting";
      this.broadcastStatus("connecting");
    });
    this.client.on("ready", () => {
      console.log("[WhatsAppManager] Client is ready!");
      this.status = "ready";
      this.broadcastStatus("ready");
    });
    this.client.on("authenticated", () => {
      console.log("[WhatsAppManager] Client authenticated");
    });
    this.client.on("auth_failure", (msg) => {
      console.error("[WhatsAppManager] Authentication failed:", msg);
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
      if (this.mainWindow) {
        this.mainWindow.webContents.send("whatsapp:error", {
          type: "auth_failure",
          message: "Authentication failed. Please try again."
        });
      }
    });
    this.client.on("disconnected", (reason) => {
      console.log("[WhatsAppManager] Client disconnected:", reason);
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
    });
    this.client.on("loading_screen", (percent, message) => {
      console.log(`[WhatsAppManager] Loading... ${percent}% - ${message}`);
    });
    this.client.on("message", async (message) => {
      console.log("[WhatsAppManager] Message received:", message.from);
      if (this.mainWindow) {
        this.mainWindow.webContents.send("whatsapp:message-received", {
          id: message.id._serialized,
          from: message.from,
          to: message.to,
          body: message.body,
          type: message.type,
          timestamp: message.timestamp,
          hasMedia: message.hasMedia
        });
      }
    });
  }
  /**
   * Connect to WhatsApp
   */
  async connect() {
    try {
      console.log("[WhatsAppManager] Connecting...");
      if (!this.client) {
        throw new Error("Client not initialized");
      }
      if (this.status === "ready") {
        console.log("[WhatsAppManager] Already connected");
        return true;
      }
      this.status = "connecting";
      this.broadcastStatus("connecting");
      await this.client.initialize();
      return true;
    } catch (error) {
      console.error("[WhatsAppManager] Connection error:", error);
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
      if (this.mainWindow) {
        this.mainWindow.webContents.send("whatsapp:error", {
          type: "connection_error",
          message: error instanceof Error ? error.message : "Unknown connection error"
        });
      }
      throw error;
    }
  }
  /**
   * Disconnect from WhatsApp
   */
  async disconnect() {
    try {
      console.log("[WhatsAppManager] Disconnecting...");
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
    } catch (error) {
      console.error("[WhatsAppManager] Disconnect error:", error);
      this.status = "disconnected";
      this.broadcastStatus("disconnected");
      throw error;
    }
  }
  /**
   * Format phone number to WhatsApp ID format
   * Handles:
   * - Removing non-numeric characters
   * - Replacing leading '0' with '62' (Indonesia)
   * - Appending '@c.us'
   */
  formatPhoneNumber(phone) {
    let formatted = phone.replace(/\D/g, "");
    if (formatted.startsWith("0")) {
      formatted = "62" + formatted.slice(1);
    }
    if (!formatted.endsWith("@c.us")) {
      formatted += "@c.us";
    }
    return formatted;
  }
  /**
   * Download a file from URL to temporary directory
   * @param url - URL of the file to download
   * @returns Path to the downloaded file
   */
  async downloadFile(url) {
    const https = await import("https");
    const http = await import("http");
    const fs = await import("fs");
    const path2 = await import("path");
    const os = await import("os");
    return new Promise((resolve, reject) => {
      try {
        const tempDir = os.tmpdir();
        const fileName = `whatsapp_media_${Date.now()}_${path2.basename(url).split("?")[0]}`;
        const tempFilePath = path2.join(tempDir, fileName);
        console.log(`[WhatsAppManager] Downloading to: ${tempFilePath}`);
        const client = url.startsWith("https://") ? https : http;
        const file = fs.createWriteStream(tempFilePath);
        client.get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log(`[WhatsAppManager] Download complete: ${tempFilePath}`);
            resolve(tempFilePath);
          });
          file.on("error", (err) => {
            fs.unlink(tempFilePath, () => {
            });
            reject(err);
          });
        }).on("error", (err) => {
          fs.unlink(tempFilePath, () => {
          });
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  /**
   * Send text message
   * @param to - Phone number with country code (e.g., "6281234567890@c.us")
   * @param content - Message content
   */
  async sendMessage(to, content) {
    try {
      if (!this.client || this.status !== "ready") {
        throw new Error("WhatsApp client is not ready");
      }
      const chatId = this.formatPhoneNumber(to);
      console.log(`[WhatsAppManager] Sending message to ${to} (formatted: ${chatId})`);
      await this.client.sendMessage(chatId, content);
      console.log(`[WhatsAppManager] Message sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error("[WhatsAppManager] Send message error:", error);
      throw error;
    }
  }
  /**
   * Send message with media
   * @param to - Phone number with country code
   * @param content - Message content
   * @param mediaPath - Path to media file or URL
   */
  async sendMessageWithMedia(to, content, mediaPath) {
    let tempFilePath = null;
    try {
      if (!this.client || this.status !== "ready") {
        throw new Error("WhatsApp client is not ready");
      }
      const chatId = this.formatPhoneNumber(to);
      console.log(`[WhatsAppManager] Sending media message to ${to} (formatted: ${chatId})`);
      let media;
      if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
        console.log(`[WhatsAppManager] Downloading remote file: ${mediaPath}`);
        tempFilePath = await this.downloadFile(mediaPath);
        media = whatsappWeb_js.MessageMedia.fromFilePath(tempFilePath);
      } else {
        media = whatsappWeb_js.MessageMedia.fromFilePath(mediaPath);
      }
      await this.client.sendMessage(chatId, media, { caption: content });
      console.log(`[WhatsAppManager] Media message sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error("[WhatsAppManager] Send media message error:", error);
      throw error;
    } finally {
      if (tempFilePath) {
        try {
          const fs = await import("fs");
          fs.unlinkSync(tempFilePath);
          console.log(`[WhatsAppManager] Cleaned up temp file: ${tempFilePath}`);
        } catch (cleanupError) {
          console.warn(`[WhatsAppManager] Failed to clean up temp file: ${tempFilePath}`, cleanupError);
        }
      }
    }
  }
  /**
   * Get current status
   */
  getStatus() {
    return this.status;
  }
  /**
   * Check if client is ready
   */
  isReady() {
    return this.status === "ready" && this.client !== null;
  }
  /**
   * Broadcast status change to renderer
   */
  broadcastStatus(status) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send("whatsapp:status-change", status);
    }
  }
  /**
   * Get client info (for debugging)
   */
  async getClientInfo() {
    try {
      if (!this.client || this.status !== "ready") {
        return null;
      }
      const info = this.client.info;
      return {
        wid: info.wid._serialized,
        pushname: info.pushname,
        platform: info.platform
      };
    } catch (error) {
      console.error("[WhatsAppManager] Get client info error:", error);
      return null;
    }
  }
}
class MessageProcessor {
  constructor(whatsappManager2, mainWindow2) {
    __publicField(this, "whatsappManager");
    __publicField(this, "mainWindow");
    __publicField(this, "isProcessing", false);
    __publicField(this, "isPaused", false);
    __publicField(this, "currentJob", null);
    this.whatsappManager = whatsappManager2;
    this.mainWindow = mainWindow2;
  }
  /**
   * Process a bulk message job
   */
  async processJob(job) {
    var _a;
    if (this.isProcessing) {
      throw new Error("Already processing a job");
    }
    this.isProcessing = true;
    this.currentJob = job;
    this.isPaused = false;
    console.log(`[MessageProcessor] Starting job ${job.jobId} with ${job.contacts.length} contacts`);
    let processed = 0;
    let success = 0;
    let failed = 0;
    this.reportProgress(job.jobId, processed, job.contacts.length, success, failed, "processing");
    for (const contact of job.contacts) {
      if (this.isPaused) {
        this.reportProgress(job.jobId, processed, job.contacts.length, success, failed, "paused");
        await this.waitForResume();
        this.reportProgress(job.jobId, processed, job.contacts.length, success, failed, "processing");
      }
      if (!this.isProcessing) break;
      try {
        let templateContent = job.template.content || "";
        if (job.template.variants && job.template.variants.length > 0) {
          const randomIndex = Math.floor(Math.random() * job.template.variants.length);
          templateContent = job.template.variants[randomIndex];
        }
        const messageContent = this.formatMessage(templateContent, contact);
        console.log(`[MessageProcessor] Template has ${((_a = job.template.variants) == null ? void 0 : _a.length) || 0} variants`);
        console.log(`[MessageProcessor] Selected template content: "${templateContent}"`);
        console.log(`[MessageProcessor] Formatted message: "${messageContent}"`);
        console.log(`[MessageProcessor] Has assets: ${job.assets && job.assets.length > 0}`);
        if (job.assets && job.assets.length > 0) {
          await this.whatsappManager.sendMessageWithMedia(contact.phone, messageContent, job.assets[0]);
        } else {
          await this.whatsappManager.sendMessage(contact.phone, messageContent);
        }
        success++;
      } catch (error) {
        console.error(`[MessageProcessor] Failed to send to ${contact.phone}:`, error);
        if (this.mainWindow) {
          this.mainWindow.webContents.send("whatsapp:job-error-detail", {
            jobId: job.jobId,
            phone: contact.phone,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        failed++;
      }
      processed++;
      this.reportProgress(job.jobId, processed, job.contacts.length, success, failed, "processing");
      await this.delay(2e3 + Math.random() * 3e3);
    }
    this.isProcessing = false;
    this.currentJob = null;
    this.reportProgress(job.jobId, processed, job.contacts.length, success, failed, "completed");
    console.log(`[MessageProcessor] Job ${job.jobId} completed`);
  }
  /**
   * Pause current job
   */
  pause() {
    if (this.isProcessing && !this.isPaused) {
      this.isPaused = true;
      console.log("[MessageProcessor] Job paused");
      return true;
    }
    return false;
  }
  /**
   * Resume current job
   */
  resume() {
    if (this.isProcessing && this.isPaused) {
      this.isPaused = false;
      console.log("[MessageProcessor] Job resumed");
      return true;
    }
    return false;
  }
  /**
   * Stop current job
   */
  stop() {
    if (this.isProcessing) {
      this.isProcessing = false;
      this.isPaused = false;
      this.currentJob = null;
      console.log("[MessageProcessor] Job stopped");
      return true;
    }
    return false;
  }
  /**
   * Format message by replacing variables
   * Supported variables: {{name}}, {{phone}}, {{var1}}, {{var2}}, etc.
   */
  formatMessage(template, contact) {
    let message = template;
    message = message.replace(/{{name}}/g, contact.name || "");
    message = message.replace(/{{phone}}/g, contact.phone || "");
    const matches = message.match(/{{(.*?)}}/g);
    if (matches) {
      matches.forEach((match) => {
        const key = match.replace(/{{|}}/g, "");
        if (contact[key] !== void 0) {
          message = message.replace(new RegExp(match, "g"), String(contact[key]));
        }
      });
    }
    return message;
  }
  /**
   * Report progress to renderer
   */
  reportProgress(jobId, processed, total, success, failed, status) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send("whatsapp:job-progress", {
        jobId,
        processed,
        total,
        success,
        failed,
        status
      });
    }
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  waitForResume() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!this.isPaused) {
          clearInterval(check);
          resolve();
        }
      }, 500);
    });
  }
}
let whatsappManager = null;
let messageProcessor = null;
const setupIPC = (mainWindow2) => {
  console.log("[IPC] Setting up IPC handlers...");
  whatsappManager = new WhatsAppManager(mainWindow2);
  messageProcessor = new MessageProcessor(whatsappManager, mainWindow2);
  electron.ipcMain.handle("whatsapp:connect", async () => {
    try {
      console.log("[IPC] whatsapp:connect called");
      if (!whatsappManager) {
        throw new Error("WhatsAppManager not initialized");
      }
      const result = await whatsappManager.connect();
      return { success: true, connected: result };
    } catch (error) {
      console.error("[IPC] whatsapp:connect error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("whatsapp:disconnect", async () => {
    try {
      console.log("[IPC] whatsapp:disconnect called");
      if (!whatsappManager) {
        throw new Error("WhatsAppManager not initialized");
      }
      await whatsappManager.disconnect();
      return { success: true };
    } catch (error) {
      console.error("[IPC] whatsapp:disconnect error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("whatsapp:send-message", async (_, { to, content, assets }) => {
    try {
      console.log(`[IPC] whatsapp:send-message called for ${to}`);
      if (!whatsappManager) {
        throw new Error("WhatsAppManager not initialized");
      }
      let result;
      if (assets && assets.length > 0) {
        result = await whatsappManager.sendMessageWithMedia(to, content, assets[0]);
      } else {
        result = await whatsappManager.sendMessage(to, content);
      }
      return { success: result };
    } catch (error) {
      console.error("[IPC] whatsapp:send-message error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("whatsapp:get-status", async () => {
    try {
      if (!whatsappManager) {
        return { status: "disconnected", ready: false };
      }
      const status = whatsappManager.getStatus();
      const ready = whatsappManager.isReady();
      return { status, ready };
    } catch (error) {
      console.error("[IPC] whatsapp:get-status error:", error);
      return { status: "disconnected", ready: false };
    }
  });
  electron.ipcMain.handle("whatsapp:get-client-info", async () => {
    try {
      console.log("[IPC] whatsapp:get-client-info called");
      if (!whatsappManager) {
        return null;
      }
      const info = await whatsappManager.getClientInfo();
      return info;
    } catch (error) {
      console.error("[IPC] whatsapp:get-client-info error:", error);
      return null;
    }
  });
  electron.ipcMain.handle("whatsapp:process-job", async (_, { jobId, contacts, template, assets }) => {
    try {
      console.log(`[IPC] whatsapp:process-job called for job ${jobId}`);
      if (!whatsappManager || !whatsappManager.isReady()) {
        throw new Error("WhatsApp is not ready");
      }
      if (!messageProcessor) {
        throw new Error("MessageProcessor not initialized");
      }
      messageProcessor.processJob({
        jobId,
        contacts,
        template,
        assets
      }).catch((err) => {
        console.error("[IPC] Job processing error:", err);
      });
      return {
        success: true,
        message: "Job started",
        jobId
      };
    } catch (error) {
      console.error("[IPC] whatsapp:process-job error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });
  electron.ipcMain.handle("whatsapp:pause-job", async (_, { jobId }) => {
    console.log(`[IPC] whatsapp:pause-job called for job ${jobId}`);
    if (messageProcessor) {
      const success = messageProcessor.pause();
      return { success, message: success ? "Job paused" : "Failed to pause" };
    }
    return { success: false, message: "Processor not ready" };
  });
  electron.ipcMain.handle("whatsapp:resume-job", async (_, { jobId }) => {
    console.log(`[IPC] whatsapp:resume-job called for job ${jobId}`);
    if (messageProcessor) {
      const success = messageProcessor.resume();
      return { success, message: success ? "Job resumed" : "Failed to resume" };
    }
    return { success: false, message: "Processor not ready" };
  });
  console.log("[IPC] IPC handlers setup complete");
};
let mainWindow = null;
const createWindow = () => {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  setupIPC(mainWindow);
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};
electron.app.on("ready", createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
