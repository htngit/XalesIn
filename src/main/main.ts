import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupIPC } from './ipcHandlers';
import { WhatsAppManager } from './WhatsAppManager';
import { MessageProcessor } from './MessageProcessor';
import { QueueWorker } from './workers/QueueWorker';
import { StatusWorker } from './workers/StatusWorker';
import { MessageReceiverWorker } from './workers/MessageReceiverWorker';

/**
 * Check if a file exists and is accessible
 * @param filePath - Path to check
 * @returns Promise<boolean> - True if file exists and is accessible
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK | fs.constants.R_OK);
        return true;
    } catch (error) {
        console.debug(`[Main] File does not exist or is not accessible: ${filePath}`, error);
        return false;
    }
}

let mainWindow: BrowserWindow | null = null;
let whatsappManager: WhatsAppManager | null = null;
let messageProcessor: MessageProcessor | null = null;
let queueWorker: QueueWorker | null = null;
let statusWorker: StatusWorker | null = null;
let messageReceiverWorker: MessageReceiverWorker | null = null;

const createWindow = async () => {
    // Determine icon path based on environment with proper error handling
    let iconPath;
    try {
        if (process.env.VITE_DEV_SERVER_URL) {
            // Development mode - use path relative to project root
            iconPath = path.join(app.getAppPath(), 'public', 'icon.png');
            console.log('[Main] Development mode - trying icon path:', iconPath);
        } else {
            // Production mode
            // On Windows, use .ico if available, otherwise .png
            // On Mac/Linux, .png is preferred
            const iconExt = process.platform === 'win32' ? 'ico' : 'png';
            iconPath = path.join(app.getAppPath(), 'public', `icon.${iconExt}`);

            // If the extension-specific icon doesn't exist, try the other one
            if (!fs.existsSync(iconPath)) {
                iconPath = path.join(app.getAppPath(), 'public', 'icon.png');
            }

            console.log('[Main] Production mode - trying icon path:', iconPath);
        }

        // Final check if file exists
        if (iconPath && !fs.existsSync(iconPath)) {
            console.warn('[Main] Icon not found at:', iconPath);
            iconPath = undefined;
        }
    } catch (error) {
        console.error('[Main] Error determining icon path:', error);
        iconPath = undefined;
    }

    // Create the browser window.
    try {
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            autoHideMenuBar: true,
            icon: iconPath,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                // Enable web security but allow local file access for packaged app
                webSecurity: true,
                webviewTag: true,
            },
        });

        // Handle external links
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            // Check if the URL is external (http/https and not localhost/127.0.0.1 if strictly needed, but generally safe to open all external links in browser)
            // For now, simpler approach: open all new windows in default browser
            if (url.startsWith('https:') || url.startsWith('http:')) {
                import('electron').then(({ shell }) => {
                    shell.openExternal(url);
                });
            }
            return { action: 'deny' };
        });

        // Disable ALT key menu behavior
        mainWindow.webContents.on('before-input-event', (_event, input) => {
            if (input.alt) {
                _event.preventDefault();
            }
        });

        // Set application icon for Windows taskbar and window with error handling
        if (process.platform === 'win32' && iconPath) {
            try {
                mainWindow.setIcon(iconPath);
            } catch (iconError) {
                console.error('[Main] Failed to set window icon:', iconError);
                // Continue without icon rather than failing
            }
        }
    } catch (windowError) {
        console.error('[Main] Failed to create browser window:', windowError);
        // Fallback: create window without icon if icon loading fails
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
            },
        });

        // Disable ALT key menu behavior for fallback window
        mainWindow.webContents.on('before-input-event', (_event, input) => {
            if (input.alt) {
                _event.preventDefault();
            }
        });
    }

    // Initialize Workers
    console.log('[Main] Initializing workers...');

    // 1. WhatsApp Manager (Core)
    whatsappManager = new WhatsAppManager(mainWindow);

    // 2. Message Processor (State Machine)
    messageProcessor = new MessageProcessor(whatsappManager, mainWindow);

    // 3. Queue Worker (Job Management)
    queueWorker = new QueueWorker(messageProcessor);

    // 4. Status Worker (Monitoring)
    statusWorker = new StatusWorker(whatsappManager, mainWindow);

    // 5. Message Receiver Worker (Incoming Messages)
    messageReceiverWorker = new MessageReceiverWorker(whatsappManager, mainWindow);

    // Inject MessageReceiverWorker into WhatsAppManager
    whatsappManager.setMessageReceiverWorker(messageReceiverWorker);

    // Start Status Worker
    statusWorker.startMonitoring();

    // Setup IPC handlers with dependencies
    setupIPC(mainWindow, whatsappManager, messageProcessor, queueWorker);

    // Load the app
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        // In production, load from app.asar
        const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
        console.log('[Main] Loading from:', indexPath);
        mainWindow.loadFile(indexPath);
    }

    // Prevent reload (F5, Ctrl+R)
    mainWindow.webContents.on('before-input-event', (_event, input) => {
        if (input.key === 'F5' || (input.control && input.key === 'r')) {
            _event.preventDefault();
        }
    });

    // Error listeners
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('[Main] Failed to load:', errorCode, errorDescription);
    });

    mainWindow.webContents.on('crashed', (_event, killed) => {
        console.error('[Main] Renderer crashed:', killed);
    });
};

app.whenReady().then(async () => {
    // Register custom protocol for local media
    protocol.handle('media', (request) => {
        const filePath = request.url.replace('media://', '');
        const decodedPath = decodeURIComponent(filePath);
        // Map to userData/media
        const fullPath = path.join(app.getPath('userData'), 'media', decodedPath);
        return net.fetch('file://' + fullPath);
    });

    await createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow().catch(error => {
                console.error('[Main] Error in activate handler:', error);
            });
        }
    });
});

app.on('window-all-closed', () => {
    // Stop workers
    if (statusWorker) {
        statusWorker.stopMonitoring();
    }

    if (whatsappManager) {
        whatsappManager.disconnect();
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});
