"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  whatsapp: {
    // Connection methods
    connect: () => electron.ipcRenderer.invoke("whatsapp:connect"),
    disconnect: () => electron.ipcRenderer.invoke("whatsapp:disconnect"),
    // Messaging methods
    sendMessage: (to, content, assets) => electron.ipcRenderer.invoke("whatsapp:send-message", { to, content, assets }),
    // Status methods
    getStatus: () => electron.ipcRenderer.invoke("whatsapp:get-status"),
    getClientInfo: () => electron.ipcRenderer.invoke("whatsapp:get-client-info"),
    // Job processing methods (for Week 3)
    // Updated to accept options object from SendPage: { template, assets, mode, delayRange }
    processJob: (jobId, contacts, options) => electron.ipcRenderer.invoke("whatsapp:process-job", {
      jobId,
      contacts,
      template: options.template,
      // Extract template from options
      assets: options.assets,
      delayConfig: { mode: options.mode, delayRange: options.delayRange }
    }),
    pauseJob: (jobId) => electron.ipcRenderer.invoke("whatsapp:pause-job", { jobId }),
    resumeJob: (jobId) => electron.ipcRenderer.invoke("whatsapp:resume-job", { jobId }),
    resyncContacts: () => electron.ipcRenderer.invoke("whatsapp:resync-contacts"),
    fetchHistory: () => electron.ipcRenderer.invoke("whatsapp:fetch-history"),
    // Event listeners
    onQRCode: (callback) => {
      const subscription = (_event, qr) => callback(qr);
      electron.ipcRenderer.on("whatsapp:qr-code", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:qr-code", subscription);
      };
    },
    onStatusChange: (callback) => {
      const subscription = (_event, status) => callback(status);
      electron.ipcRenderer.on("whatsapp:status-change", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:status-change", subscription);
      };
    },
    onMessageReceived: (callback) => {
      const subscription = (_event, data) => callback(data);
      electron.ipcRenderer.on("whatsapp:message-received", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:message-received", subscription);
      };
    },
    onContactsReceived: (callback) => {
      const subscription = (_event, contacts) => callback(contacts);
      electron.ipcRenderer.on("whatsapp:contacts-received", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:contacts-received", subscription);
      };
    },
    onError: (callback) => {
      const subscription = (_event, error) => callback(error);
      electron.ipcRenderer.on("whatsapp:error", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:error", subscription);
      };
    },
    onSyncStatus: (callback) => {
      const subscription = (_event, status) => callback(status);
      electron.ipcRenderer.on("whatsapp:sync-status", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:sync-status", subscription);
      };
    },
    onJobProgress: (callback) => {
      const subscription = (_event, progress) => callback(progress);
      electron.ipcRenderer.on("whatsapp:job-progress", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:job-progress", subscription);
      };
    },
    onJobErrorDetail: (callback) => {
      const subscription = (_event, errorDetail) => callback(errorDetail);
      electron.ipcRenderer.on("whatsapp:job-error-detail", subscription);
      return () => {
        electron.ipcRenderer.removeListener("whatsapp:job-error-detail", subscription);
      };
    }
  },
  // Map Scraping API
  mapScraping: {
    scrape: (keyword, limit) => electron.ipcRenderer.invoke("maps:scrape", { keyword, limit }),
    cancel: () => electron.ipcRenderer.invoke("maps:cancel"),
    onProgress: (callback) => {
      const subscription = (_event, progress) => callback(progress);
      electron.ipcRenderer.on("maps:progress", subscription);
      return () => {
        electron.ipcRenderer.removeListener("maps:progress", subscription);
      };
    }
  }
});
