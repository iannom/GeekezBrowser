import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { profileService } from '../services/profile.service';

export const useProfileStore = defineStore('profile', () => {
    // State
    const profiles = ref([]);
    const runningIds = ref([]);
    const searchText = ref('');
    const selectedTag = ref('');
    const selectedIds = ref([]);
    const draggingProfileId = ref(null);
    const dragOverProfileId = ref(null);
    const viewMode = ref(localStorage.getItem('geekez_view') || 'list');

    // Actions
    const loadProfiles = async () => {
        try {
            const loadedProfiles = await profileService.loadProfiles();
            profiles.value = Array.isArray(loadedProfiles) ? loadedProfiles : [];
            const loadedRunningIds = await profileService.getRunningIds();
            runningIds.value = Array.isArray(loadedRunningIds) ? loadedRunningIds : [];
            const profileIdSet = new Set(profiles.value.map(p => p.id));
            selectedIds.value = selectedIds.value.filter(id => profileIdSet.has(id));
        } catch (e) {
            console.error('Failed to load profiles:', e);
            profiles.value = [];
            runningIds.value = [];
            selectedIds.value = [];
        }
    };

    const toggleViewMode = () => {
        viewMode.value = viewMode.value === 'list' ? 'grid' : 'list';
        localStorage.setItem('geekez_view', viewMode.value);
    };

    const setSearchText = (text) => {
        searchText.value = text;
    };

    const setSelectedTag = (tag) => {
        selectedTag.value = tag || '';
    };

    // Getters
    const filteredProfiles = computed(() => {
        let next = profiles.value;
        if (selectedTag.value) {
            next = next.filter(profile => (profile.tags || []).includes(selectedTag.value));
        }
        if (!searchText.value) return next;
        const text = searchText.value.toLowerCase();
        return next.filter(p => {
            return (p.name || '').toLowerCase().includes(text) ||
                (p.proxyStr && p.proxyStr.toLowerCase().includes(text)) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(text)));
        });
    });

    const availableTags = computed(() => {
        const tagSet = new Set();
        profiles.value.forEach(profile => {
            (profile.tags || []).forEach(tag => {
                if (tag) tagSet.add(tag);
            });
        });
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    });

    const selectedCount = computed(() => selectedIds.value.length);

    const isSelected = (id) => selectedIds.value.includes(id);

    const toggleSelected = (id, forceValue = null) => {
        const has = selectedIds.value.includes(id);
        const shouldSelect = forceValue === null ? !has : !!forceValue;
        if (shouldSelect && !has) selectedIds.value.push(id);
        if (!shouldSelect && has) selectedIds.value = selectedIds.value.filter(item => item !== id);
    };

    const clearSelection = () => {
        selectedIds.value = [];
    };

    const setSelectedIds = (ids = []) => {
        if (!Array.isArray(ids)) {
            selectedIds.value = [];
            return;
        }

        const validIds = new Set(profiles.value.map(profile => profile.id));
        const next = [];
        const seen = new Set();
        ids.forEach((id) => {
            if (!validIds.has(id) || seen.has(id)) return;
            seen.add(id);
            next.push(id);
        });
        selectedIds.value = next;
    };

    const setDragState = (draggingId = null, overId = null) => {
        draggingProfileId.value = draggingId;
        dragOverProfileId.value = overId;
    };

    const setDragOverProfile = (id = null) => {
        dragOverProfileId.value = id;
    };

    const toggleSelectAllFiltered = () => {
        const filteredIds = filteredProfiles.value.map(profile => profile.id);
        const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.value.includes(id));
        if (allSelected) {
            selectedIds.value = selectedIds.value.filter(id => !filteredIds.includes(id));
            return;
        }
        const next = new Set(selectedIds.value);
        filteredIds.forEach(id => next.add(id));
        selectedIds.value = Array.from(next);
    };

    const isRunning = (id) => runningIds.value.includes(id);

    const createProfile = async (data) => {
        try {
            await profileService.saveProfile(data);
            await loadProfiles();
        } catch (e) {
            console.error('Failed to create profile:', e);
            throw e;
        }
    };

    const copyProfiles = async (ids, mode) => {
        try {
            const result = await profileService.copyProfiles(ids, mode);
            await loadProfiles();
            return result;
        } catch (e) {
            console.error('Failed to copy profiles:', e);
            throw e;
        }
    };

    const updateProfile = async (profile) => {
        try {
            await profileService.updateProfile(profile);
            await loadProfiles();
        } catch (e) {
            console.error('Failed to update profile:', e);
            throw e;
        }
    };

    const updateProfilesBatch = async (items) => {
        try {
            const result = await profileService.updateProfilesBatch(items);
            await loadProfiles();
            return result;
        } catch (e) {
            console.error('Failed to batch update profiles:', e);
            throw e;
        }
    };

    const reorderProfiles = async (ids) => {
        try {
            await profileService.reorderProfiles(ids);
            await loadProfiles();
        } catch (e) {
            console.error('Failed to reorder profiles:', e);
            throw e;
        }
    };

    const deleteProfile = async (id) => {
        try {
            const result = await profileService.deleteProfile(id);
            if (result && result.success === false) {
                throw new Error(result.message || result.error || 'Delete failed');
            }
            await loadProfiles();
        } catch (e) {
            console.error('Failed to delete profile:', e);
            throw e;
        }
    };

    return {
        profiles,
        runningIds,
        searchText,
        selectedTag,
        selectedIds,
        draggingProfileId,
        dragOverProfileId,
        viewMode,
        loadProfiles,
        toggleViewMode,
        setSearchText,
        setSelectedTag,
        filteredProfiles,
        availableTags,
        selectedCount,
        isSelected,
        toggleSelected,
        clearSelection,
        setSelectedIds,
        setDragState,
        setDragOverProfile,
        toggleSelectAllFiltered,
        isRunning,
        createProfile,
        copyProfiles,
        updateProfile,
        updateProfilesBatch,
        reorderProfiles,
        deleteProfile
    };
});
