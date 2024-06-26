import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let isOpen = false;
let editTime: string | null = null;
let totalDuration = "00:00:00";
let previousCharCount = 0;
let keystrokeCount = 0;

let updateInterval: NodeJS.Timeout | undefined;
let heartbeatInterval: NodeJS.Timeout | undefined;
let keystrokeInterval: NodeJS.Timeout | undefined;

/**
 * Start tracking time manually.
 */
function startTrackingTime(context: vscode.ExtensionContext) {
    if (!isOpen) {
        isOpen = true;
        editTime = new Date().toISOString();
        updateData(context);
        vscode.window.showInformationMessage('Manual time tracking started.');
        updateInterval = setInterval(() => updateTotalDuration(context), 10000);
        heartbeatInterval = setInterval(() => sendHeartbeat(context), 10000);
        keystrokeInterval = setInterval(() => trackKeystrokes(context), 10000);
    } else {
        vscode.window.showInformationMessage('Time tracking is already active.');
    }
}

/**
 * Stop tracking time manually and save data.
 */
function stopTrackingTime(context: vscode.ExtensionContext) {
    if (isOpen) {
        isOpen = false;
        const endTime = new Date().toISOString();
        calculateDuration(editTime!, endTime);
        updateData(context);
        clearInterval(updateInterval!);
        clearInterval(heartbeatInterval!);
        clearInterval(keystrokeInterval!);
        vscode.window.showInformationMessage('Manual time tracking stopped.');
    } else {
        vscode.window.showInformationMessage('Time tracking is not active.');
    }
}

/**
 * Send a heartbeat.
 * This function is called every 10 seconds.
 */
async function sendHeartbeat(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const timestamp = new Date().toISOString();
        const filePath = editor.document.uri.fsPath;
        const cursorPosition = editor.selection.active;

        let isTaskRunning = false;
        let isCompiling = false;
        let isDebugging = false;

        const tasks = await vscode.tasks.fetchTasks();
        if (tasks.some(task => task.isBackground || task.execution !== undefined)) {
            isTaskRunning = true;
        }

        if (tasks.some(task => task.name.toLowerCase().includes('compile') || task.name.toLowerCase().includes('build'))) {
            isCompiling = true;
        }

        const debugSessions = vscode.debug.activeDebugSession;
        if (debugSessions) {
            isDebugging = true;
        }

        const heartbeat: Heartbeat = {
            timestamp,
            filePath,
            cursorPosition: {
                line: cursorPosition.line,
                character: cursorPosition.character
            },
            isTaskRunning,
            isCompiling,
            isDebugging,
            keystrokeCount
        };

        updateDataWithHeartbeat(context, heartbeat);
    }
}

/**
 * Update totalDuration in memory.
 * This function is called every 10 seconds.
 */
function updateTotalDuration(context: vscode.ExtensionContext) {
    if (isOpen) {
        const currentTime = new Date().toISOString();
        calculateDuration(editTime!, currentTime);
        updateData(context);
    }
}

/**
 * Track keystrokes and update keystrokeCount.
 */
function trackKeystrokes(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const currentCharCount = editor.document.getText().length;
        const charsTyped = currentCharCount - previousCharCount;
        previousCharCount = currentCharCount;
        keystrokeCount += charsTyped;

        vscode.window.showInformationMessage(`Characters typed in the last interval: ${charsTyped}`);
        updateData(context);
    }
}

/**
 * Update data in JSON file.
 */
function updateData(context: vscode.ExtensionContext) {
    const data: TrackingData = {
        isOpen,
        editTime: editTime!,
        totalDuration,
        keystrokeCount,
        heartbeats: readHeartbeats(context)
    };

    const dataPath = getDataPath(context);
    writeDataFile(dataPath, data);
}

/**
 * Update data with a new heartbeat.
 * @param heartbeat The heartbeat object to update.
 */
function updateDataWithHeartbeat(context: vscode.ExtensionContext, heartbeat: Heartbeat) {
    console.log('Updating data with new heartbeat:', heartbeat);

    const data: TrackingData = {
        isOpen,
        editTime: editTime!,
        totalDuration,
        keystrokeCount,
        heartbeats: [...readHeartbeats(context), heartbeat]
    };

    const dataPath = getDataPath(context);
    writeDataFile(dataPath, data);
}

/**
 * Calculate duration in hours, minutes, seconds format.
 * @param startTime The start time in ISO string format.
 * @param endTime The end time in ISO string format.
 */
function calculateDuration(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = end.getTime() - start.getTime();

    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);

    totalDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the path to the data file.
 */
function getDataPath(context: vscode.ExtensionContext) {
    const extensionPath = context.extensionPath;
    return path.join(extensionPath, 'vscode-timetracking-data.json');
}

/**
 * Read heartbeats from the JSON file.
 */
function readHeartbeats(context: vscode.ExtensionContext) {
    const dataPath = getDataPath(context);
    try {
        if (fs.existsSync(dataPath)) {
            const data = fs.readFileSync(dataPath, 'utf8');
            const parsedData: TrackingData = JSON.parse(data);
            return parsedData.heartbeats || [];
        }
    } catch (error) {
        console.error('Error reading heartbeats:', error);
    }
    return [];
}

/**
 * Write data to the JSON file.
 * @param dataPath The path to the data file.
 * @param data The data to write to the file.
 */
function writeDataFile(dataPath: string, data: TrackingData) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4), 'utf8');
        console.log(`Data written to file: ${dataPath}`);
    } catch (error) {
        console.error(`Failed to write data to file ${dataPath}:`, error);
    }
}

/**
 * Extension activation.
 */
function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "timetracking01" is now active!');

    let disposableStartTracking = vscode.commands.registerCommand('timetracking01.startTrackingTime', () => startTrackingTime(context));
    let disposableStopTracking = vscode.commands.registerCommand('timetracking01.stopTrackingTime', () => stopTrackingTime(context));

    updateInterval = setInterval(() => updateTotalDuration(context), 10000);
    heartbeatInterval = setInterval(() => sendHeartbeat(context), 10000);
    keystrokeInterval = setInterval(() => trackKeystrokes(context), 10000);

    context.subscriptions.push(disposableStartTracking);
    context.subscriptions.push(disposableStopTracking);

    // Check and create initial data file if it doesn't exist
    const dataPath = getDataPath(context);
    if (!fs.existsSync(dataPath)) {
        const initialData: TrackingData = {
            isOpen: false,
            editTime: "",
            totalDuration: "00:00:00",
            keystrokeCount: 0,
            heartbeats: []
        };
        writeDataFile(dataPath, initialData);
    }
}

/**
 * Extension deactivation.
 */
function deactivate(context: vscode.ExtensionContext) {
    clearInterval(updateInterval!);
    clearInterval(heartbeatInterval!);
    clearInterval(keystrokeInterval!);
    updateData(context); 
}

interface Heartbeat {
    timestamp: string;
    filePath: string;
    cursorPosition: { line: number; character: number };
    isTaskRunning: boolean;
    isCompiling: boolean;
    isDebugging: boolean;
    keystrokeCount: number;
}

interface TrackingData {
    isOpen: boolean;
    editTime: string;
    totalDuration: string;
    keystrokeCount: number;
    heartbeats: Heartbeat[];
}

export { activate, deactivate };
