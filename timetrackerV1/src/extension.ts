import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let isOpen = false;
let editTime: string | null = null;
let totalDuration = "00:00:00"; // Format for displaying total duration

let updateInterval: NodeJS.Timeout | undefined; // Interval ID for updating totalDuration
let heartbeatInterval: NodeJS.Timeout | undefined; // Interval ID for sending heartbeat

/**
 * Start tracking time manually.
 */
function startTrackingTime() {
    if (!isOpen) {
        isOpen = true;
        editTime = new Date().toISOString();
        updateData(); // Update initial data when starting manually
        vscode.window.showInformationMessage('Manual time tracking started.');
        updateInterval = setInterval(updateTotalDuration, 10000); // Start update interval
        heartbeatInterval = setInterval(sendHeartbeat, 10000); // Start heartbeat interval
    } else {
        vscode.window.showInformationMessage('Time tracking is already active.');
    }
}

/**
 * Stop tracking time manually and save data.
 */
function stopTrackingTime() {
    if (isOpen) {
        isOpen = false;
        const endTime = new Date().toISOString();
        calculateDuration(editTime!, endTime); // Calculate duration until now
        updateData(); // Update data when manually stopped
        clearInterval(updateInterval!); // Stop the update interval
        clearInterval(heartbeatInterval!); // Stop the heartbeat interval
        vscode.window.showInformationMessage('Manual time tracking stopped.');
    } else {
        vscode.window.showInformationMessage('Time tracking is not active.');
    }
}

/**
 * Send a heartbeat.
 * This function is called every 10 seconds.
 */
async function sendHeartbeat() {
    const editor = vscode.window.activeTextEditor;
    let isTaskRunning = false;
    let isCompiling = false;
    let isDebugging = false;

    // Check if there is an active task
    const tasks = await vscode.tasks.fetchTasks();
    if (tasks.some(task => task.isBackground || task.execution !== undefined)) {
        isTaskRunning = true;
    }

    // Check if there is a task related to compilation
    if (tasks.some(task => task.name.toLowerCase().includes('compile') || task.name.toLowerCase().includes('build'))) {
        isCompiling = true;
    }

    // Check if there is an active debugging session
    const debugSessions = vscode.debug.activeDebugSession;
    if (debugSessions) {
        isDebugging = true;
    }

    if (editor) {
        const timestamp = new Date().toISOString();
        const filePath = editor.document.uri.fsPath; // Get the file path of the current document
        const cursorPosition = editor.selection.active; // Get the current cursor position

        if (filePath === getDataPath()) {
            return; // Ignore changes made to the tracking JSON file itself
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
            isDebugging
        };

        updateDataWithHeartbeat(heartbeat);
    }
}

/**
 * Update totalDuration in memory.
 * This function is called every 10 seconds.
 */
function updateTotalDuration() {
    if (isOpen) {
        const currentTime = new Date().toISOString();
        calculateDuration(editTime!, currentTime);
        updateData(); // Update data with latest totalDuration
    }
}

/**
 * Update data in JSON file.
 */
function updateData() {
    const data: TrackingData = {
        isOpen,
        editTime: editTime!,
        totalDuration,
        heartbeats: readHeartbeats()
    };

    writeDataFile(getDataPath(), data);
}

/**
 * Update data with a new heartbeat.
 * @param {Heartbeat} heartbeat
 */
function updateDataWithHeartbeat(heartbeat: Heartbeat) {
    const data: TrackingData = {
        isOpen,
        editTime: editTime!,
        totalDuration,
        heartbeats: [...readHeartbeats(), heartbeat]
    };

    writeDataFile(getDataPath(), data);
}

/**
 * Calculate duration in hours, minutes, seconds format.
 * @param {string} startTime 
 * @param {string} endTime 
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
 * @returns {string} The path to the data file.
 */
function getDataPath(): string {
    const extensionPath = vscode.workspace.rootPath || vscode.env.appRoot!;
    return path.join(extensionPath, 'vscode-timetracking-data.json');
}

/**
 * Read heartbeats from the JSON file.
 * @returns {Heartbeat[]} The array of heartbeats.
 */
function readHeartbeats(): Heartbeat[] {
    const dataPath = getDataPath();
    if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath, 'utf8');
        const parsedData: TrackingData = JSON.parse(data);
        return parsedData.heartbeats || [];
    }
    return [];
}

/**
 * Write data to the JSON file.
 * @param {string} dataPath The path to the data file.
 * @param {TrackingData} data The data to write to the file.
 */
function writeDataFile(dataPath: string, data: TrackingData) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4), 'utf8');
}

/**
 * Interface for heartbeats stored in JSON.
 */
interface Heartbeat {
    timestamp: string;
    filePath: string;
    cursorPosition: { line: number; character: number };
    isTaskRunning: boolean;
    isCompiling: boolean;
    isDebugging: boolean;
}

/**
 * Interface for the tracking data stored in JSON.
 */
interface TrackingData {
    isOpen: boolean;
    editTime: string;
    totalDuration: string;
    heartbeats: Heartbeat[];
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "timetracking01" is now active!');

    // Register commands for manual start and stop
    let disposableStartTracking = vscode.commands.registerCommand('timetracking01.startTrackingTime', startTrackingTime);
    let disposableStopTracking = vscode.commands.registerCommand('timetracking01.stopTrackingTime', stopTrackingTime);

    // Set intervals to update totalDuration and heartbeat every 10 & 60 seconds
    updateInterval = setInterval(updateTotalDuration, 10000); // 10 seconds interval
    heartbeatInterval = setInterval(sendHeartbeat, 60000); // 60 seconds interval

    context.subscriptions.push(disposableStartTracking, disposableStopTracking);
}

// This method is called when your extension is deactivated
function deactivate() {
    clearInterval(updateInterval!); // Clear the update interval
    clearInterval(heartbeatInterval!); // Clear the heartbeat interval
    updateData(); // Save data when the extension is deactivated
}

export {
    activate,
    deactivate
};
