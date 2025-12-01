import { app, BrowserWindow } from 'electron';
import path from 'path';
import { setupIPC } from './ipcHandlers';

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
    // Determine icon path based on environment
    const iconPath = process.env.VITE_DEV_SERVER_URL
        ? path.join(__dirname, '../../public/icon.png')
        : path.join(__dirname, '../dist/icon.png');

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: false,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Setup IPC handlers
    setupIPC(mainWindow);

    // Load the index.html of the app.
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    } else {
        // Use app.getAppPath() for reliable path resolution in production
        const appPath = app.getAppPath();
        const indexPath = path.join(appPath, 'dist', 'index.html');
        console.log('App path:', appPath);
        console.log('Loading file from:', indexPath);
        mainWindow.loadFile(indexPath);
    }

    // Debug: Log when page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page finished loading');
    });

    // Debug: Log any errors
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });

    // Prevent window reload (F5, Ctrl+R) which can cause blank screens
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key.toLowerCase() === 'r') {
            event.preventDefault();
        }
        if (input.key === 'F5') {
            event.preventDefault();
        }
    });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
