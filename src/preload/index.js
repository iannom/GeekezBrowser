// preload.js
const { contextBridge, ipcRenderer } = require('electron');

const allowedInvokeChannels = new Set([
    'add-user-extension',
    'check-app-update',
    'check-updates',
    'check-xray-update',
    'copy-profiles',
    'delete-profile',
    'download-xray-update',
    'export-data',
    'export-full-backup',
    'export-selected-data',
    'fetch-url',
    'get-api-status',
    'get-app-info',
    'get-data-path-info',
    'get-export-profiles',
    'get-import-progress',
    'get-profiles',
    'get-proxy-remark',
    'get-running-ids',
    'get-settings',
    'get-user-extensions',
    'import-data',
    'import-full-backup',
    'launch-profile',
    'open-url',
    'remove-user-extension',
    'reorder-profiles',
    'reset-data-directory',
    'save-profile',
    'save-settings',
    'search-extension-store',
    'select-backup-file',
    'select-crx-extension',
    'select-data-directory',
    'select-extension-crx',
    'select-extension-folder',
    'select-save-full-backup',
    'set-data-directory',
    'set-title-bar-color',
    'start-api-server',
    'stop-api-server',
    'test-proxy-latency',
    'test-proxy-latency-batch',
    'update-profile',
    'update-profiles-batch',
    'update-user-extension-scope'
]);

function invokeAllowed(channel, ...args) {
    if (!allowedInvokeChannels.has(channel)) {
        throw new Error(`IPC channel is not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('electronAPI', {
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    saveProfile: (data) => ipcRenderer.invoke('save-profile', data),
    updateProfile: (data) => ipcRenderer.invoke('update-profile', data),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    launchProfile: (id, watermarkStyle) => ipcRenderer.invoke('launch-profile', id, watermarkStyle),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
    exportProfile: (id) => ipcRenderer.invoke('export-profile', id),
    importProfile: () => ipcRenderer.invoke('import-profile'),
    // 通用入口仅允许渲染端已声明的 IPC 白名单，避免任意 channel 调用。
    invoke: invokeAllowed,
    getRunningIds: () => ipcRenderer.invoke('get-running-ids'),
    onProfileStatus: (callback) => ipcRenderer.on('profile-status', (event, data) => callback(data)),
    // API events
    onRefreshProfiles: (callback) => ipcRenderer.on('refresh-profiles', () => callback()),
    onApiLaunchProfile: (callback) => ipcRenderer.on('api-launch-profile', (event, id) => callback(id)),
    onExtensionInstallProgress: (callback) => ipcRenderer.on('extension-install-progress', (event, payload) => callback(payload))
});
