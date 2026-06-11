<template>
    <div v-show="uiStore.batchEditModalVisible" class="modal-overlay" @mousedown.self="uiStore.closeBatchEditModal">
        <div class="modal-content batch-edit-modal-content">
            <div class="modal-header">
                <span>{{ t('batchEditTitle') }} ({{ selectedCount }})</span>
                <span style="cursor:pointer" @click="uiStore.closeBatchEditModal">✕</span>
            </div>
            <div class="modal-body">
                <div class="batch-edit-summary">{{ t('batchEditDesc') }}</div>

                <label class="batch-field">
                    <input v-model="enabled.tags" type="checkbox">
                    <span>{{ t('tagsLabel') }}</span>
                </label>
                <div v-if="enabled.tags" class="batch-field-body">
                    <select v-model="form.tagsMode">
                        <option value="replace">{{ t('batchTagsReplace') }}</option>
                        <option value="append">{{ t('batchTagsAppend') }}</option>
                        <option value="remove">{{ t('batchTagsRemove') }}</option>
                    </select>
                    <input v-model="form.tags" type="text" placeholder="tag-a, tag-b" spellcheck="false" autocomplete="off">
                </div>

                <label class="batch-field">
                    <input v-model="enabled.preProxyOverride" type="checkbox">
                    <span>{{ t('preProxySetting') }}</span>
                </label>
                <div v-if="enabled.preProxyOverride" class="batch-field-body">
                    <select v-model="form.preProxyOverride">
                        <option value="default">{{ t('optDefault') }}</option>
                        <option value="on">{{ t('optOn') }}</option>
                        <option value="off">{{ t('optOff') }}</option>
                    </select>
                </div>

                <label class="batch-field">
                    <input v-model="enabled.screen" type="checkbox">
                    <span>{{ t('screenRes') }}</span>
                </label>
                <div v-if="enabled.screen" class="batch-field-body">
                    <div class="flex-row gap-5">
                        <input v-model.number="form.resW" type="number" min="1" placeholder="W">
                        <input v-model.number="form.resH" type="number" min="1" placeholder="H">
                    </div>
                </div>

                <label class="batch-field">
                    <input v-model="enabled.timezone" type="checkbox">
                    <span>{{ t('timezoneLabel') }}</span>
                </label>
                <div v-if="enabled.timezone" class="batch-field-body">
                    <div class="timezone-wrapper">
                        <input v-model="timezoneSearch" type="text" placeholder="Type to search or select..." autocomplete="off" @focus="showTimezoneList = true">
                        <div v-if="showTimezoneList" class="timezone-dropdown active">
                            <div v-for="tz in filteredTimezones" :key="tz" class="timezone-item" @click="selectTimezone(tz)">
                                {{ tz }}
                            </div>
                        </div>
                    </div>
                </div>

                <label class="batch-field">
                    <input v-model="enabled.city" type="checkbox">
                    <span>{{ t('locationLabel') }}</span>
                </label>
                <div v-if="enabled.city" class="batch-field-body">
                    <div class="timezone-wrapper">
                        <input v-model="citySearch" type="text" placeholder="Type to search city..." autocomplete="off" @focus="showCityList = true">
                        <div v-if="showCityList" class="timezone-dropdown active">
                            <div v-for="city in filteredCities" :key="city.name" class="timezone-item" @click="selectCity(city)">
                                {{ city.name }}
                            </div>
                        </div>
                    </div>
                    <div class="hint-text">{{ t('geoHint') }}</div>
                </div>

                <label class="batch-field">
                    <input v-model="enabled.language" type="checkbox">
                    <span>{{ t('languageLabel') }}</span>
                </label>
                <div v-if="enabled.language" class="batch-field-body">
                    <div class="timezone-wrapper">
                        <input v-model="languageSearch" type="text" placeholder="Type to search language..." autocomplete="off" @focus="showLanguageList = true">
                        <div v-if="showLanguageList" class="timezone-dropdown active">
                            <div v-for="lang in filteredLanguages" :key="lang.code" class="timezone-item" @click="selectLanguage(lang)">
                                {{ lang.name }} ({{ lang.code }})
                            </div>
                        </div>
                    </div>
                </div>

                <template v-if="showUaWebglModify">
                    <label class="batch-field">
                        <input v-model="enabled.browserVersionPreset" type="checkbox">
                        <span>{{ t('browserVersionPresetLabel') }}</span>
                    </label>
                    <div v-if="enabled.browserVersionPreset" class="batch-field-body">
                        <select v-model="form.browserVersionPreset">
                            <option v-for="opt in browserVersionPresetOptions" :key="opt.value" :value="opt.value">
                                {{ getOptionLabel(opt) }}
                            </option>
                        </select>
                    </div>

                    <label class="batch-field">
                        <input v-model="enabled.webglProfile" type="checkbox">
                        <span>{{ t('webglProfileLabel') }}</span>
                    </label>
                    <div v-if="enabled.webglProfile" class="batch-field-body">
                        <select v-model="form.webglProfile">
                            <option v-for="opt in webglProfileOptions" :key="opt.value" :value="opt.value">
                                {{ getOptionLabel(opt) }}
                            </option>
                        </select>
                    </div>
                </template>

                <label v-if="settings.enableCustomArgs" class="batch-field">
                    <input v-model="enabled.customArgs" type="checkbox">
                    <span>{{ t('customArgsLabel') }}</span>
                </label>
                <div v-if="settings.enableCustomArgs && enabled.customArgs" class="batch-field-body">
                    <textarea v-model="form.customArgs" rows="2" class="mono-text" spellcheck="false"></textarea>
                    <div class="hint-text">{{ t('customArgsHint') }}</div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="outline" @click="uiStore.closeBatchEditModal">{{ t('cancel') }}</button>
                <button :disabled="isSaving || selectedCount === 0" @click="handleSave">
                    {{ isSaving ? '...' : t('save') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProfileStore } from '../store/useProfileStore';
import {
    browserVersionPresetOptions,
    webglProfileOptions,
    getOptionLabel
} from '../utils/fingerprintOptions';

const uiStore = useUIStore();
const profileStore = useProfileStore();

const t = (key) => window.t ? window.t(key) : key;

const settings = ref({});
const showUaWebglModify = ref(false);
const isSaving = ref(false);

const enabled = reactive({
    tags: false,
    preProxyOverride: false,
    screen: false,
    timezone: false,
    city: false,
    language: false,
    browserVersionPreset: false,
    webglProfile: false,
    customArgs: false
});

const form = reactive({
    tagsMode: 'replace',
    tags: '',
    preProxyOverride: 'default',
    resW: 1920,
    resH: 1080,
    timezone: 'Auto',
    city: null,
    geolocation: null,
    language: 'auto',
    browserVersionPreset: 'none',
    webglProfile: 'none',
    customArgs: ''
});

const timezoneSearch = ref('Auto (No Change)');
const showTimezoneList = ref(false);
const citySearch = ref('Auto (IP Based)');
const showCityList = ref(false);
const languageSearch = ref('Auto (System Default)');
const showLanguageList = ref(false);

const allTimezones = window.TIMEZONES || [];
const allCities = window.CITY_DATA || [];
const allLanguages = window.LANGUAGE_DATA || [
    { name: 'Auto (System Default)', code: 'auto' },
    { name: 'English (US)', code: 'en-US' }
];

const cityTimezoneAliases = {
    'America/Honolulu': 'Pacific/Honolulu',
    'America/Atlanta': 'America/New_York',
    'America/Boston': 'America/New_York',
    'America/Miami': 'America/New_York',
    'America/Philadelphia': 'America/New_York',
    'America/Washington_DC': 'America/New_York',
    'America/Austin': 'America/Chicago',
    'America/Dallas': 'America/Chicago',
    'America/Houston': 'America/Chicago',
    'America/San_Antonio': 'America/Chicago',
    'America/Las_Vegas': 'America/Los_Angeles',
    'America/San_Diego': 'America/Los_Angeles',
    'America/San_Francisco': 'America/Los_Angeles',
    'America/San_Jose': 'America/Los_Angeles',
    'America/Seattle': 'America/Los_Angeles',
    'America/Salt_Lake_City': 'America/Denver',
    'Europe/Birmingham': 'Europe/London',
    'Europe/Manchester': 'Europe/London',
    'Europe/Marseille': 'Europe/Paris',
    'Europe/Barcelona': 'Europe/Madrid',
    'Europe/Frankfurt': 'Europe/Berlin',
    'Europe/Munich': 'Europe/Berlin',
    'Europe/Milan': 'Europe/Rome',
    'Asia/Beijing': 'Asia/Shanghai',
    'Asia/Kyoto': 'Asia/Tokyo',
    'Asia/Osaka': 'Asia/Tokyo',
    'Asia/Mumbai': 'Asia/Kolkata'
};

const selectedCount = computed(() => profileStore.selectedCount);

const filteredTimezones = computed(() => {
    const search = timezoneSearch.value.toLowerCase();
    return allTimezones.filter(tz => tz.toLowerCase().includes(search)).slice(0, 50);
});

const filteredCities = computed(() => {
    const search = citySearch.value.toLowerCase();
    return allCities.filter(city => city.name.toLowerCase().includes(search)).slice(0, 50);
});

const filteredLanguages = computed(() => {
    const search = languageSearch.value.toLowerCase();
    return allLanguages.filter(lang =>
        lang.name.toLowerCase().includes(search) ||
        lang.code.toLowerCase().includes(search)
    );
});

function parseTags(value) {
    return String(value || '')
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(Boolean);
}

function parseBrowserVersionPreset(preset) {
    if (!preset || preset === 'none') {
        return { uaMode: 'none', browserType: 'auto', browserMajorVersion: 'auto' };
    }
    if (preset === 'auto') {
        return { uaMode: 'spoof', browserType: 'auto', browserMajorVersion: 'auto' };
    }
    const [browserTypeRaw, majorRaw] = String(preset).split(':');
    const browserType = browserTypeRaw === 'edge' ? 'edge' : 'chrome';
    const major = Number(majorRaw);
    if (!Number.isFinite(major)) {
        return { uaMode: 'none', browserType: 'auto', browserMajorVersion: 'auto' };
    }
    return { uaMode: 'spoof', browserType, browserMajorVersion: major };
}

function resolveCityTimezone(city) {
    const raw = city?.timezone || cityTimezoneAliases[city?.name] || city?.name;
    if (!raw || raw === 'Auto (IP Based)') return 'Auto';
    return allTimezones.includes(raw) ? raw : 'Auto';
}

function resetForm() {
    Object.keys(enabled).forEach((key) => {
        enabled[key] = false;
    });
    Object.assign(form, {
        tagsMode: 'replace',
        tags: '',
        preProxyOverride: 'default',
        resW: 1920,
        resH: 1080,
        timezone: 'Auto',
        city: null,
        geolocation: null,
        language: 'auto',
        browserVersionPreset: 'none',
        webglProfile: 'none',
        customArgs: ''
    });
    timezoneSearch.value = 'Auto (No Change)';
    citySearch.value = 'Auto (IP Based)';
    languageSearch.value = 'Auto (System Default)';
}

function selectTimezone(tz) {
    form.timezone = tz === 'Auto (No Change)' ? 'Auto' : tz;
    timezoneSearch.value = tz;
    showTimezoneList.value = false;
}

function selectCity(city) {
    if (city.name === 'Auto (IP Based)') {
        form.city = null;
        form.geolocation = null;
        citySearch.value = 'Auto (IP Based)';
    } else {
        form.city = city.name;
        form.geolocation = { latitude: city.lat, longitude: city.lng, accuracy: 100 };
        citySearch.value = city.name;
        const timezone = resolveCityTimezone(city);
        if (timezone !== 'Auto') {
            form.timezone = timezone;
            timezoneSearch.value = timezone;
            enabled.timezone = true;
        }
    }
    showCityList.value = false;
}

function selectLanguage(lang) {
    form.language = lang.code;
    languageSearch.value = lang.name;
    showLanguageList.value = false;
}

function handleGlobalClick(e) {
    if (!e.target.closest('.timezone-wrapper')) {
        showTimezoneList.value = false;
        showCityList.value = false;
        showLanguageList.value = false;
    }
}

function buildUpdatedProfile(profile) {
    const updated = {
        ...profile,
        fingerprint: {
            ...(profile.fingerprint || {})
        }
    };

    if (enabled.tags) {
        const incomingTags = parseTags(form.tags);
        const existingTags = Array.isArray(profile.tags) ? profile.tags : [];
        if (form.tagsMode === 'append') {
            updated.tags = Array.from(new Set([...existingTags, ...incomingTags]));
        } else if (form.tagsMode === 'remove') {
            const removeSet = new Set(incomingTags);
            updated.tags = existingTags.filter(tag => !removeSet.has(tag));
        } else {
            updated.tags = incomingTags;
        }
    }

    if (enabled.preProxyOverride) {
        updated.preProxyOverride = form.preProxyOverride;
    }

    if (enabled.screen) {
        updated.fingerprint.screen = { width: form.resW, height: form.resH };
        updated.fingerprint.window = { width: form.resW, height: form.resH };
        updated.resW = form.resW;
        updated.resH = form.resH;
    }

    if (enabled.timezone) {
        updated.fingerprint.timezone = form.timezone;
        updated.timezone = form.timezone;
    }

    if (enabled.city) {
        updated.fingerprint.city = form.city;
        updated.fingerprint.geolocation = form.geolocation;
        updated.city = form.city;
        updated.geolocation = form.geolocation;
    }

    if (enabled.language) {
        updated.fingerprint.language = form.language;
        updated.language = form.language;
    }

    if (enabled.browserVersionPreset) {
        const browserPreset = parseBrowserVersionPreset(form.browserVersionPreset);
        updated.uaMode = browserPreset.uaMode;
        updated.browserType = browserPreset.browserType;
        updated.browserMajorVersion = browserPreset.browserMajorVersion;
        updated.fingerprint.uaMode = browserPreset.uaMode;
        updated.fingerprint.browserType = browserPreset.browserType;
        updated.fingerprint.browserMajorVersion = browserPreset.browserMajorVersion;
    }

    if (enabled.webglProfile) {
        updated.webglProfile = form.webglProfile;
        updated.fingerprint.webglProfile = form.webglProfile;
    }

    if (enabled.customArgs) {
        updated.customArgs = form.customArgs;
    }

    return JSON.parse(JSON.stringify(updated));
}

async function handleSave() {
    const enabledKeys = Object.keys(enabled).filter(key => enabled[key]);
    if (enabledKeys.length === 0) {
        uiStore.showAlert(t('batchEditNoFields'));
        return;
    }

    if (enabled.screen) {
        const width = Number(form.resW);
        const height = Number(form.resH);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            uiStore.showAlert(t('batchEditInvalidScreen'));
            return;
        }
    }

    const selectedIdSet = new Set(profileStore.selectedIds);
    const updates = profileStore.profiles
        .filter(profile => selectedIdSet.has(profile.id))
        .map(profile => buildUpdatedProfile(profile));

    if (updates.length === 0) {
        uiStore.showAlert(t('copyNoSelection'));
        return;
    }

    isSaving.value = true;
    try {
        const result = await profileStore.updateProfilesBatch(updates);
        const results = Array.isArray(result?.results) ? result.results : [];
        const failed = results.filter(item => !item.success);
        const successCount = results.length - failed.length;

        uiStore.closeBatchEditModal();
        if (failed.length > 0) {
            const detail = failed.slice(0, 3)
                .map(item => item.message || item.id)
                .join('；');
            uiStore.showAlert(`${t('batchEditPartialSuccess')}: ${successCount}/${results.length}${detail ? `\n${detail}` : ''}`);
            return;
        }
        uiStore.showAlert(`${t('batchEditSuccess')}: ${successCount}`);
    } catch (err) {
        console.error('Batch edit profiles failed:', err);
        uiStore.showAlert(`${t('batchEditFailed')}: ${err?.message || err}`);
    } finally {
        isSaving.value = false;
    }
}

watch(() => uiStore.batchEditModalVisible, async (visible) => {
    if (!visible) return;
    resetForm();
    isSaving.value = false;
    try {
        settings.value = await window.electronAPI.getSettings();
        showUaWebglModify.value = !!settings.value?.enableUaWebglModify;
    } catch (e) {
        settings.value = {};
        showUaWebglModify.value = false;
    }
});

onMounted(() => {
    window.addEventListener('mousedown', handleGlobalClick);
});

onUnmounted(() => {
    window.removeEventListener('mousedown', handleGlobalClick);
});
</script>

<style scoped>
.batch-edit-modal-content {
    width: 520px;
    max-width: 92vw;
}

.batch-edit-summary {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 12px;
}

.batch-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: bold;
    margin: 10px 0 8px;
}

.batch-field input {
    width: auto;
    margin: 0;
}

.batch-field-body {
    padding-left: 22px;
}

.hint-text {
    font-size: 10px;
    opacity: 0.5;
    margin-bottom: 8px;
}

.flex-row {
    display: flex;
    gap: 10px;
}

.gap-5 {
    gap: 5px;
}

.mono-text {
    font-family: monospace;
    font-size: 11px;
}
</style>
