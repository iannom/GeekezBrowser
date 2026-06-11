import { defineStore } from 'pinia';
import { settingService } from '../services/setting.service';
import { ipcService } from '../services/ipc.service';

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        enableRemoteDebugging: false,
        enableCustomArgs: false,
        enableUaWebglModify: false,
        enableApiServer: false,
        closeBehavior: 'tray',
        apiPort: 12138,
        apiRunning: false,
        watermarkStyle: 'none',
        apiToken: '',
        userExtensions: [],
        currentDataPath: '',
        isDefaultDataPath: true,
        activeTab: 'extensions'
    }),

    actions: {
        async loadSettings() {
            try {
                const settings = await ipcService.getSettings();
                if (!settings) {
                    console.warn('[SettingsStore] getSettings returned null, using defaults');
                    return;
                }
                this.enableRemoteDebugging = settings.enableRemoteDebugging || false;
                this.enableCustomArgs = settings.enableCustomArgs || false;
                this.enableUaWebglModify = settings.enableUaWebglModify || false;
                this.enableApiServer = settings.enableApiServer || false;
                this.closeBehavior = settings.closeBehavior === 'quit' ? 'quit' : 'tray';
                this.apiPort = settings.apiPort || 12138;
                this.watermarkStyle = settings.watermarkStyle || 'none';
                this.apiToken = settings.apiToken || '';

                // Load API Status
                try {
                    const apiStatus = await settingService.getApiStatus();
                    this.apiRunning = apiStatus ? apiStatus.running : false;
                } catch (e) {
                    console.warn('[SettingsStore] getApiStatus failed:', e);
                    this.apiRunning = false;
                }

                // Load Extensions
                await this.loadExtensions();

                // Load Data Path Info
                try {
                    const pathInfo = await settingService.getDataPathInfo();
                    if (pathInfo) {
                        this.currentDataPath = pathInfo.currentPath || '';
                        this.isDefaultDataPath = pathInfo.isDefault !== false;
                    }
                } catch (e) {
                    console.warn('[SettingsStore] getDataPathInfo failed:', e);
                }
            } catch (e) {
                console.error('[SettingsStore] loadSettings failed:', e);
            }
        },

        async toggleRemoteDebugging(enabled) {
            const settings = await ipcService.getSettings();
            settings.enableRemoteDebugging = enabled;
            await ipcService.saveSettings(settings);
            this.enableRemoteDebugging = enabled;
            return true;
        },

        async toggleCustomArgs(enabled) {
            const settings = await ipcService.getSettings();
            settings.enableCustomArgs = enabled;
            await ipcService.saveSettings(settings);
            this.enableCustomArgs = enabled;
            return true;
        },

        async toggleUaWebglModify(enabled) {
            const settings = await ipcService.getSettings();
            settings.enableUaWebglModify = enabled;
            await ipcService.saveSettings(settings);
            this.enableUaWebglModify = enabled;
            return true;
        },

        async toggleApiServer(enabled) {
            if (enabled) {
                const res = await settingService.startApiServer(this.apiPort);
                if (!res.success) {
                    this.apiRunning = false;
                    throw new Error(res.error || 'API server failed to start');
                }
                const settings = await ipcService.getSettings();
                settings.enableApiServer = true;
                await ipcService.saveSettings(settings);
                this.enableApiServer = true;
                this.apiRunning = true;
                this.apiToken = res.token || settings.apiToken || this.apiToken;
            } else {
                await settingService.stopApiServer();
                const settings = await ipcService.getSettings();
                settings.enableApiServer = false;
                await ipcService.saveSettings(settings);
                this.enableApiServer = false;
                this.apiRunning = false;
            }
        },

        async setCloseBehavior(mode) {
            const nextMode = mode === 'quit' ? 'quit' : 'tray';
            const settings = await ipcService.getSettings();
            settings.closeBehavior = nextMode;
            await ipcService.saveSettings(settings);
            this.closeBehavior = nextMode;
        },

        async saveApiPort(port) {
            const previousPort = this.apiPort;
            const wasEnabled = this.enableApiServer;
            const settings = await ipcService.getSettings();
            settings.apiPort = port;

            if (wasEnabled) {
                await settingService.stopApiServer();
                const res = await settingService.startApiServer(port);
                if (!res.success) {
                    await settingService.startApiServer(previousPort).catch(() => ({ success: false }));
                    throw new Error(res.error || 'API server failed to start on new port');
                }
                this.apiRunning = true;
            }
            await ipcService.saveSettings(settings);
            this.apiPort = port;
            return true;
        },

        async saveWatermarkStyle(style) {
            const nextStyle = style || 'none';
            const settings = await ipcService.getSettings();
            settings.watermarkStyle = nextStyle;
            await ipcService.saveSettings(settings);
            this.watermarkStyle = nextStyle;
            localStorage.setItem('geekez_watermark_style', this.watermarkStyle);
        },

        async loadExtensions() {
            try {
                this.userExtensions = await settingService.getUserExtensions() || [];
            } catch (e) {
                console.warn('[SettingsStore] loadExtensions failed:', e);
                this.userExtensions = [];
            }
        },

        async addExtension(path) {
            await settingService.addUserExtension({ type: 'folder', path });
            await this.loadExtensions();
        },

        async addCrxExtension(path) {
            await settingService.addUserExtension({ type: 'crx', path });
            await this.loadExtensions();
        },

        async addStoreExtension(item) {
            const payload = {
                type: 'store',
                storeId: item?.id || item?.storeId || '',
                name: item?.name || '',
                homepage: item?.homepage || ''
            };
            await settingService.addUserExtension(payload);
            await this.loadExtensions();
        },

        async removeExtension(ext) {
            await settingService.removeUserExtension({ id: ext?.id, path: ext?.path });
            await this.loadExtensions();
        },

        async updateExtensionScope(id, applyMode, profileIds = []) {
            const safeProfileIds = Array.from(profileIds || []).map(v => String(v || '')).filter(Boolean);
            await settingService.updateExtensionScope(String(id || ''), applyMode, safeProfileIds);
            await this.loadExtensions();
        },

        setTab(tab) {
            this.activeTab = tab;
        }
    }
});
