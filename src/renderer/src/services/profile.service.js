import { ipcService } from './ipc.service';

/**
 * 环境管理服务 - 处理环境启动、删除与状态同步
 */
export const profileService = {
    /**
     * 加载所有环境列表
     */
    async loadProfiles() {
        return await ipcService.invoke('get-profiles');
    },

    /**
     * 启动指定环境
     */
    async launch(id) {
        try {
            const settings = await ipcService.getSettings().catch(() => ({}));
            const watermarkStyle = settings?.watermarkStyle || localStorage.getItem('geekez_watermark_style') || 'none';
            const msg = await ipcService.invoke('launch-profile', id, watermarkStyle);
            return {
                success: true,
                message: msg || ''
            };
        } catch (error) {
            return { success: false, message: error.message || 'Launch failed' };
        }
    },

    /**
     * 批量启动环境（顺序启动，降低资源峰值）
     */
    async launchBatch(ids = []) {
        const results = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const result = await this.launch(id);
            results.push({ id, ...result });
        }
        return results;
    },

    /**
     * 创建/保存新环境
     */
    async saveProfile(data) {
        return await ipcService.invoke('save-profile', data);
    },

    /**
     * 复制一个或多个环境
     */
    async copyProfiles(ids = [], mode = 'profile') {
        const payload = {
            ids: Array.isArray(ids) ? ids : [ids],
            mode
        };
        return await ipcService.invoke('copy-profiles', payload);
    },

    /**
     * 获取当前运行中的环境 ID 列表
     */
    async getRunningIds() {
        try {
            return await ipcService.invoke('get-running-ids') || [];
        } catch (e) {
            console.error('Failed to get running IDs:', e);
            return [];
        }
    },


    /**
     * 删除指定环境
     */
    async deleteProfile(id) {
        try {
            const result = await ipcService.invoke('delete-profile', id);
            if (result && result.success === false) {
                throw new Error(result.error || result.message || 'Delete failed');
            }
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message || 'Delete failed' };
        }
    },

    /**
     * 批量删除环境（顺序删除，避免文件锁冲突）
     */
    async deleteBatch(ids = []) {
        const results = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const result = await this.deleteProfile(id);
            results.push({ id, ...result });
        }
        return results;
    },

    /**
     * 更新环境配置
     */
    async updateProfile(profile) {
        const result = await ipcService.invoke('update-profile', profile);
        if (result === false || (result && result.success === false)) {
            throw new Error(result?.error || result?.message || 'Update failed');
        }
        return result;
    },

    /**
     * 批量更新环境配置
     */
    async updateProfilesBatch(items = []) {
        return await ipcService.invoke('update-profiles-batch', items);
    },

    /**
     * 保存环境列表顺序
     */
    async reorderProfiles(ids = []) {
        return await ipcService.invoke('reorder-profiles', ids);
    },

    /**
     * 监听环境运行状态变化
     */
    onStatusChange(callback) {
        if (window.electronAPI && typeof window.electronAPI.onProfileStatus === 'function') {
            window.electronAPI.onProfileStatus(callback);
            return;
        }
        ipcService.on('profile-status', (_event, payload) => callback(payload));
    },

    /**
     * 监听环境列表刷新请求
     */
    onRefreshProfiles(callback) {
        if (window.electronAPI && typeof window.electronAPI.onRefreshProfiles === 'function') {
            window.electronAPI.onRefreshProfiles(callback);
            return;
        }
        ipcService.on('refresh-profiles', () => callback());
    },

    /**
     * 监听来自 API 的启动请求
     */
    onApiLaunchProfile(callback) {
        if (window.electronAPI && typeof window.electronAPI.onApiLaunchProfile === 'function') {
            window.electronAPI.onApiLaunchProfile(callback);
            return;
        }
        ipcService.on('api-launch-profile', (_event, profileId) => callback(profileId));
    }
};
