<template>
    <div
        :data-profile-id="profile.id"
        class="profile-item no-drag"
        :class="{ selected: isSelected, dragging: isDragging, 'drag-over': isDragOver }"
        @dragend="handleDragEnd"
        @dragover.prevent="handleDragOver"
        @drop.prevent="handleDrop"
    >
        <div class="profile-info">
            <div style="display:flex; align-items:center;">
                <button
                    type="button"
                    class="sort-handle no-drag"
                    draggable="true"
                    title="拖拽排序"
                    aria-label="拖拽排序"
                    @dragstart.stop="handleDragStart"
                    @dragend.stop="handleDragEnd"
                >
                    ⋮⋮
                </button>
                <input
                    type="checkbox"
                    class="batch-checkbox no-drag"
                    :checked="isSelected"
                    @change="toggleSelected"
                >
                <h4>{{ profile.name }}</h4>
                <span :id="`status-${profile.id}`" class="running-badge" :class="{ active: isRunning }">{{ t('runningStatus') }}</span>
            </div>
            <div class="profile-meta">
                <span v-for="tag in profile.tags" :key="tag" class="tag"
                      :style="{ background: stringToColor(tag) + '33', color: stringToColor(tag), border: '1px solid ' + stringToColor(tag) + '44' }">
                    {{ tag }}
                </span>
                <span class="tag">{{ displayProto }}</span>
                <span class="tag">{{ displayScreen }}</span>
                <span class="tag" style="border:1px solid var(--accent);">
                    <select class="quick-switch-select no-drag" :value="profile.preProxyOverride || 'default'" @change="quickUpdatePreProxy($event.target.value)">
                        <option value="default">{{ t('qsDefault') }}</option>
                        <option value="on">{{ t('qsOn') }}</option>
                        <option value="off">{{ t('qsOff') }}</option>
                    </select>
                </span>
            </div>
        </div>
        <div class="actions">
            <button class="no-drag" @click="launch">{{ t('launch') }}</button>
            <button class="outline no-drag" @click="edit">{{ t('edit') }}</button>
            <button class="outline no-drag" @click="copy">{{ t('copyProfile') }}</button>
            <button class="danger no-drag" @click="remove">{{ t('delete') }}</button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProfileStore } from '../store/useProfileStore';
import { profileService } from '../services/profile.service';

const uiStore = useUIStore();
const profileStore = useProfileStore();

const props = defineProps({
    profile: {
        type: Object,
        required: true
    },
    isRunning: {
        type: Boolean,
        default: false
    },
    isSelected: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['drag-start', 'drag-over', 'drop', 'drag-end']);

const t = (key) => window.t ? window.t(key) : key;
const isDragging = computed(() => profileStore.draggingProfileId === props.profile.id);
const isDragOver = computed(() => profileStore.dragOverProfileId === props.profile.id && !isDragging.value);

const stringToColor = (str) => {
    if(!str) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

const displayProto = computed(() => {
    if (!props.profile.proxyStr) return 'N/A';
    return (props.profile.proxyStr.split('://')[0] || 'UNK').toUpperCase();
});

const displayScreen = computed(() => {
    const screen = props.profile.fingerprint?.screen;
    if (screen && screen.width && screen.height) {
        return `${screen.width}x${screen.height}`;
    }
    return '0x0';
});

const quickUpdatePreProxy = async (val) => {
    const p = profileStore.profiles.find(x => x.id === props.profile.id);
    if (p) {
        const previous = p.preProxyOverride || 'default';
        p.preProxyOverride = val;
        const safeProfile = JSON.parse(JSON.stringify(p));
        try {
            await profileStore.updateProfile(safeProfile);
        } catch (e) {
            p.preProxyOverride = previous;
            uiStore.showAlert('保存前置代理设置失败: ' + (e?.message || e));
        }
    }
};

const toggleSelected = () => {
    profileStore.toggleSelected(props.profile.id);
};

const handleDragStart = (event) => {
    if (!event.target?.closest?.('.sort-handle')) {
        event.preventDefault();
        return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', props.profile.id);
    profileStore.setDragState(props.profile.id, null);
    emit('drag-start', props.profile.id);
};

const handleDragOver = () => {
    emit('drag-over', props.profile.id);
};

const handleDrop = (event) => {
    const sourceId = event.dataTransfer.getData('text/plain');
    if (!sourceId) return;
    emit('drop', { sourceId, targetId: props.profile.id });
};

const handleDragEnd = () => {
    emit('drag-end');
};

const launch = async () => {
    const res = await profileService.launch(props.profile.id);
    if (!res.success && res.message) {
        uiStore.showAlert('Error: ' + res.message);
    }
};

const edit = () => {
    uiStore.openEditModal(props.profile.id);
};

const copy = () => {
    uiStore.openCopyModal([props.profile.id]);
};

const remove = () => {
    const msg = window.t('confirmDel') || 'Confirm delete?';
    uiStore.showConfirm(msg, async () => {
        await profileStore.deleteProfile(props.profile.id);
    });
};
</script>

<style scoped>
.batch-checkbox {
    width: 14px;
    height: 14px;
    margin-right: 8px;
    margin-bottom: 0;
}

.sort-handle {
    width: 22px;
    height: 22px;
    margin-right: 8px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    cursor: grab;
    line-height: 1;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.sort-handle:hover {
    border-color: var(--border);
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
}

.sort-handle:active {
    cursor: grabbing;
}
</style>
