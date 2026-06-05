<template>
    <div v-show="uiStore.copyModalVisible" class="modal-overlay" @mousedown.self="uiStore.closeCopyModal">
        <div class="modal-content copy-modal-content">
            <div class="modal-header">
                <span>{{ t('copyProfileTitle') }}</span>
                <span style="cursor:pointer" @click="uiStore.closeCopyModal">✕</span>
            </div>
            <div class="modal-body">
                <div class="copy-summary">{{ summaryText }}</div>

                <label class="copy-option" :class="{ active: mode === 'profile' }">
                    <input v-model="mode" type="radio" value="profile">
                    <span>
                        <strong>{{ t('copyModeProfile') }}</strong>
                        <small>{{ t('copyModeProfileDesc') }}</small>
                    </span>
                </label>

                <label class="copy-option" :class="{ active: mode === 'full' }">
                    <input v-model="mode" type="radio" value="full">
                    <span>
                        <strong>{{ t('copyModeFull') }}</strong>
                        <small>{{ t('copyModeFullDesc') }}</small>
                    </span>
                </label>
            </div>
            <div class="modal-footer">
                <button class="outline" @click="uiStore.closeCopyModal">{{ t('cancel') }}</button>
                <button :disabled="isCopying || targetCount === 0" @click="handleCopy">
                    {{ isCopying ? '...' : t('copyConfirm') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProfileStore } from '../store/useProfileStore';

const uiStore = useUIStore();
const profileStore = useProfileStore();
const mode = ref('profile');
const isCopying = ref(false);

const t = (key) => window.t ? window.t(key) : key;

const targetCount = computed(() => uiStore.copyProfileIds.length);
const selectedNames = computed(() => {
    const profileMap = new Map(profileStore.profiles.map(profile => [profile.id, profile.name]));
    return uiStore.copyProfileIds
        .map(id => profileMap.get(id))
        .filter(Boolean);
});
const summaryText = computed(() => {
    if (targetCount.value === 1 && selectedNames.value.length === 1) {
        return `${t('copyProfileTarget')}: ${selectedNames.value[0]}`;
    }
    return `${t('copyProfileCount')}: ${targetCount.value}`;
});

watch(() => uiStore.copyModalVisible, (visible) => {
    if (visible) {
        mode.value = 'profile';
        isCopying.value = false;
    }
});

async function handleCopy() {
    const ids = [...uiStore.copyProfileIds];
    if (ids.length === 0) {
        uiStore.showAlert(t('copyNoSelection'));
        return;
    }

    isCopying.value = true;
    try {
        const result = await profileStore.copyProfiles(ids, mode.value);
        const results = Array.isArray(result?.results) ? result.results : [];
        const failed = results.filter(item => !item.success);
        const successCount = results.length - failed.length;

        uiStore.closeCopyModal();
        if (failed.length > 0) {
            const detail = failed.slice(0, 3)
                .map(item => item.message || item.id)
                .join('；');
            uiStore.showAlert(`${t('copyPartialSuccess')}: ${successCount}/${results.length}${detail ? `\n${detail}` : ''}`);
            return;
        }
        uiStore.showAlert(`${t('copySuccess')}: ${successCount}`);
    } catch (err) {
        console.error('Copy profiles failed:', err);
        uiStore.showAlert(`${t('copyFailed')}: ${err?.message || err}`);
    } finally {
        isCopying.value = false;
    }
}
</script>

<style scoped>
.copy-modal-content {
    width: 420px;
    max-width: 90vw;
}

.copy-summary {
    font-size: 13px;
    margin-bottom: 12px;
    opacity: 0.85;
}

.copy-option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
    cursor: pointer;
}

.copy-option.active {
    border-color: var(--accent);
}

.copy-option input {
    width: auto;
    margin: 2px 0 0;
}

.copy-option span {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.copy-option strong {
    font-size: 13px;
}

.copy-option small {
    font-size: 11px;
    opacity: 0.65;
    line-height: 1.4;
}
</style>
