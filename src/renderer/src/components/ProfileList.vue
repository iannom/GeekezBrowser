<template>
    <div class="layout">
        <div
            ref="listRef"
            class="main-list"
            id="profileList"
            :class="{ 'grid-view': isGridView, selecting: dragSelect.active, 'selection-tracking': dragSelect.tracking }"
            @pointerdown="handleSelectionPointerDown"
            @pointermove="handleSelectionPointerMove"
            @pointerup="handleSelectionPointerUp"
            @pointercancel="handleSelectionPointerCancel"
            @lostpointercapture="handleSelectionLostPointerCapture"
        >
            <template v-if="filteredProfiles.length > 0">
                <ProfileCard 
                    v-for="profile in filteredProfiles" 
                    :key="profile.id" 
                    :profile="profile" 
                    :isRunning="profileStore.isRunning(profile.id)"
                    :isSelected="profileStore.isSelected(profile.id)"
                    @drag-start="handleDragStart"
                    @drag-over="handleDragOver"
                    @drop="handleDrop"
                    @drag-end="handleDragEnd"
                />
                <div
                    v-if="dragSelect.active"
                    class="selection-marquee"
                    :style="selectionBoxStyle"
                ></div>
            </template>
            <div v-else class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <div class="empty-state-text">{{ emptyMessage }}</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useProfileStore } from '../store/useProfileStore';
import { useUIStore } from '../store/useUIStore';
import ProfileCard from './ProfileCard.vue';

const profileStore = useProfileStore();
const uiStore = useUIStore();
const listRef = ref(null);

const dragSelect = reactive({
    tracking: false,
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    pointerId: null,
    baseIds: [],
    mode: 'replace'
});

const filteredProfiles = computed(() => profileStore.filteredProfiles);
const isGridView = computed(() => profileStore.viewMode === 'grid');
const selectionBoxStyle = computed(() => {
    if (!listRef.value) return {};

    const listRect = listRef.value.getBoundingClientRect();
    const left = Math.min(dragSelect.startX, dragSelect.currentX);
    const top = Math.min(dragSelect.startY, dragSelect.currentY);
    const width = Math.abs(dragSelect.currentX - dragSelect.startX);
    const height = Math.abs(dragSelect.currentY - dragSelect.startY);

    return {
        left: `${left - listRect.left + listRef.value.scrollLeft}px`,
        top: `${top - listRect.top + listRef.value.scrollTop}px`,
        width: `${width}px`,
        height: `${height}px`
    };
});

const emptyMessage = computed(() => {
    const t = window.t || ((key) => key);
    if (profileStore.searchText.length > 0) {
        return "No Search Results";
    }
    return t('emptyStateMsg');
});

onMounted(() => {
    profileStore.loadProfiles();
    window.addEventListener('blur', handleSelectionWindowBlur);
});

onBeforeUnmount(() => {
    resetSelectionDrag();
    window.removeEventListener('blur', handleSelectionWindowBlur);
});

const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};

const getPointInList = (event) => {
    const list = listRef.value;
    if (!list) return null;

    const rect = list.getBoundingClientRect();
    return {
        x: clamp(event.clientX, rect.left, rect.right),
        y: clamp(event.clientY, rect.top, rect.bottom)
    };
};

const isSelectionIgnoredTarget = (target) => {
    return !!target?.closest?.('button, input, select, textarea, a, label, [contenteditable="true"], .sort-handle, .actions');
};

const getSelectionRect = () => {
    return {
        left: Math.min(dragSelect.startX, dragSelect.currentX),
        right: Math.max(dragSelect.startX, dragSelect.currentX),
        top: Math.min(dragSelect.startY, dragSelect.currentY),
        bottom: Math.max(dragSelect.startY, dragSelect.currentY)
    };
};

const intersects = (a, b) => {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
};

const getProfileIdsInRect = (selectionRect) => {
    const list = listRef.value;
    if (!list) return [];

    return Array.from(list.querySelectorAll('[data-profile-id]'))
        .filter((element) => intersects(selectionRect, element.getBoundingClientRect()))
        .map((element) => element.dataset.profileId)
        .filter(Boolean);
};

const applySelectionRect = () => {
    const hitIds = getProfileIdsInRect(getSelectionRect());

    if (dragSelect.mode === 'add') {
        profileStore.setSelectedIds([...dragSelect.baseIds, ...hitIds]);
        return;
    }

    if (dragSelect.mode === 'toggle') {
        const next = new Set(dragSelect.baseIds);
        hitIds.forEach((id) => {
            if (next.has(id)) next.delete(id);
            else next.add(id);
        });
        profileStore.setSelectedIds(Array.from(next));
        return;
    }

    profileStore.setSelectedIds(hitIds);
};

const resetSelectionDrag = () => {
    const list = listRef.value;
    const pointerId = dragSelect.pointerId;
    dragSelect.tracking = false;
    dragSelect.active = false;
    dragSelect.pointerId = null;
    dragSelect.baseIds = [];
    document.body.classList.remove('profile-drag-selecting');

    if (list && pointerId !== null && list.hasPointerCapture?.(pointerId)) {
        try {
            list.releasePointerCapture(pointerId);
        } catch (err) {
            // 指针可能已被浏览器取消，释放失败时只需确保本地状态已清理。
        }
    }
};

const handleSelectionPointerDown = (event) => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || isSelectionIgnoredTarget(event.target) || profileStore.draggingProfileId) return;

    const point = getPointInList(event);
    if (!point) return;

    event.preventDefault();
    dragSelect.tracking = true;
    dragSelect.active = false;
    dragSelect.startX = point.x;
    dragSelect.startY = point.y;
    dragSelect.currentX = point.x;
    dragSelect.currentY = point.y;
    dragSelect.pointerId = event.pointerId;
    dragSelect.baseIds = [...profileStore.selectedIds];
    dragSelect.mode = event.ctrlKey || event.metaKey ? 'toggle' : (event.shiftKey ? 'add' : 'replace');
    document.body.classList.add('profile-drag-selecting');

    if (listRef.value?.setPointerCapture) {
        try {
            listRef.value.setPointerCapture(event.pointerId);
        } catch (err) {
            resetSelectionDrag();
        }
    }
};

const handleSelectionPointerMove = (event) => {
    if (!dragSelect.tracking || event.pointerId !== dragSelect.pointerId) return;

    const point = getPointInList(event);
    if (!point) return;

    event.preventDefault();
    dragSelect.currentX = point.x;
    dragSelect.currentY = point.y;

    const moved = Math.hypot(dragSelect.currentX - dragSelect.startX, dragSelect.currentY - dragSelect.startY);
    if (!dragSelect.active && moved < 5) return;

    if (!dragSelect.active) {
        dragSelect.active = true;
        document.body.classList.add('profile-drag-selecting');
    }

    applySelectionRect();
};

const handleSelectionPointerUp = (event) => {
    if (!dragSelect.tracking || event.pointerId !== dragSelect.pointerId) return;
    event.preventDefault();
    resetSelectionDrag();
};

const handleSelectionPointerCancel = (event) => {
    if (!dragSelect.tracking || event.pointerId !== dragSelect.pointerId) return;
    resetSelectionDrag();
};

const handleSelectionLostPointerCapture = () => {
    if (dragSelect.tracking) resetSelectionDrag();
};

const handleSelectionWindowBlur = () => {
    if (dragSelect.tracking) resetSelectionDrag();
};

const handleDragStart = (sourceId) => {
    profileStore.setDragState(sourceId, null);
};

const handleDragOver = (targetId) => {
    if (profileStore.draggingProfileId && targetId && targetId !== profileStore.draggingProfileId) {
        profileStore.setDragOverProfile(targetId);
    }
};

const moveIdInList = (ids, sourceId, targetId) => {
    const next = [...ids];
    const fromIndex = next.findIndex(id => id === sourceId);
    const toIndex = next.findIndex(id => id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return null;

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
};

const mergeVisibleOrder = (profiles, visibleIds) => {
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const visibleIdSet = new Set(visibleIds);
    let visibleIndex = 0;

    return profiles.map((profile) => {
        if (!visibleIdSet.has(profile.id)) return profile;
        const nextVisibleId = visibleIds[visibleIndex++];
        return profileMap.get(nextVisibleId) || profile;
    });
};

const handleDrop = async ({ sourceId, targetId }) => {
    if (!sourceId || !targetId || sourceId === targetId) {
        profileStore.setDragState(null, null);
        return;
    }

    const visibleIds = filteredProfiles.value.map(profile => profile.id);
    const reorderedVisibleIds = moveIdInList(visibleIds, sourceId, targetId);
    if (!reorderedVisibleIds) {
        profileStore.setDragState(null, null);
        return;
    }

    const reordered = mergeVisibleOrder(profileStore.profiles, reorderedVisibleIds);
    const previousProfiles = [...profileStore.profiles];
    profileStore.profiles = reordered;
    profileStore.setDragState(null, null);

    try {
        await profileStore.reorderProfiles(reordered.map(profile => profile.id));
    } catch (err) {
        profileStore.profiles = previousProfiles;
        uiStore.showAlert(`${window.t?.('reorderFailed') || 'Reorder failed'}: ${err?.message || err}`);
    }
};

const handleDragEnd = () => {
    profileStore.setDragState(null, null);
};
</script>

<style scoped>
.main-list {
    position: relative;
}

.main-list.selection-tracking,
.main-list.selecting {
    cursor: crosshair;
    user-select: none;
}

.selection-marquee {
    position: absolute;
    z-index: 20;
    pointer-events: none;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: rgba(0, 224, 255, 0.12);
    box-shadow: 0 0 0 1px rgba(0, 224, 255, 0.18);
}

:global(body.profile-drag-selecting) {
    user-select: none;
}
</style>
