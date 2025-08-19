const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const xlsx = require('xlsx');

let mainWindow;

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- Main App Logic ---
  app.whenReady().then(() => {
    mainWindow = createWindow();
    setupIpcHandlers();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  return win;
}

function setupIpcHandlers() {
    const documentsPath = app.getPath('documents');
    const reportDir = path.join(documentsPath, 'HMI_Test_Reports');

    ipcMain.handle('get-devices', async () => {
      return new Promise((resolve) => {
        exec('adb devices', (error, stdout, stderr) => {
          if (error) resolve({ devices: [], error: stderr || error.message });
          else {
            const lines = stdout.trim().split('\n').slice(1);
            const devices = lines.map(line => line.split('\t')[0]).filter(d => d);
            resolve({ devices, error: null });
          }
        });
      });
    });

    ipcMain.handle('open-report-folder', async () => {
        if (!fs.existsSync(reportDir)) {
          fs.mkdirSync(reportDir, { recursive: true });
        }
        shell.openPath(reportDir);
    });

    ipcMain.handle('inspect-screen', async (event, { deviceId, appPackage, appActivity }) => {
        const tempDir = app.getPath('temp');
        const scriptPath = path.join(tempDir, 'inspector_script.py');
        const screenshotPath = path.join(tempDir, `inspector_screenshot_${Date.now()}.png`);

        const inspectorScript = `
import sys, time, xml.etree.ElementTree as ET
from appium import webdriver
from appium.options.android import UiAutomator2Options

try:
    capabilities = {
        'platformName': 'Android', 'automationName': 'uiautomator2',
        'deviceName': '${deviceId}', 'appPackage': '${appPackage}',
        'appActivity': '${appActivity}', 'noReset': True
    }
    options = UiAutomator2Options().load_capabilities(capabilities)
    driver = webdriver.Remote(command_executor='http://127.0.0.1:4723', options=options)
    time.sleep(3)
    source = driver.page_source
    driver.save_screenshot(r'${screenshotPath.replace(/\\/g, '\\\\')}')
    root = ET.fromstring(source)
    print(f"DIMENSIONS:{root.get('width')},{root.get('height')}")
    print("---XML_SEPARATOR---")
    print(source)
    driver.quit()
except Exception as e:
    print(f"INSPECTOR_ERROR: {e}", file=sys.stderr)
`;
        fs.writeFileSync(scriptPath, inspectorScript);
        return new Promise((resolve) => {
            const pythonProcess = spawn('python', [scriptPath]);
            let fullOutput = '', errorMessage = '';
            pythonProcess.stdout.on('data', (data) => fullOutput += data.toString());
            pythonProcess.stderr.on('data', (data) => errorMessage += data.toString());
            pythonProcess.on('close', (code) => {
                if (code === 0 && fullOutput.includes('---XML_SEPARATOR---')) {
                    const parts = fullOutput.split('---XML_SEPARATOR---');
                    const dims = parts[0].replace('DIMENSIONS:', '').trim().split(',');
                    const dimensions = { width: parseInt(dims[0], 10), height: parseInt(dims[1], 10) };
                    resolve({ success: true, source: parts[1], screenshotPath, dimensions });
                } else {
                    resolve({ success: false, error: errorMessage || "Unknown inspection error." });
                }
            });
        });
    });

    ipcMain.handle('execute-tests', async (event, { testCode, conftestCode }) => {
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        const testFilePath = path.join(reportDir, 'test_generated.py');
        const conftestFilePath = path.join(reportDir, 'conftest.py');
        try {
          fs.writeFileSync(testFilePath, testCode);
          fs.writeFileSync(conftestFilePath, conftestCode);
        } catch (err) {
          mainWindow.webContents.send('execution-finished');
          return;
        }
        const pytestProcess = exec(`python -m pytest "${testFilePath}"`, { cwd: reportDir });
        
        pytestProcess.stdout.on('data', (data) => {
            mainWindow.webContents.send('update-log', { log: data.toString() });
        });
        pytestProcess.stderr.on('data', (data) => {
            mainWindow.webContents.send('update-log', { log: data.toString() });
        });
        pytestProcess.on('close', () => {
            mainWindow.webContents.send('execution-finished');
        });
      });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
