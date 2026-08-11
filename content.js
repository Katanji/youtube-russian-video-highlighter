const serverUrl = 'https://highlighter.v2202605359112460867.luckysrv.de/check-channels';
const checkedChannels = {};

const FETCH_TIMEOUT_MS = 20000;
const FETCH_CHUNK_SIZE = 50;
const CACHE_KEY = 'yt_ru_highlighter_checked_channels_v2';
const VIDEO_SELECTOR = 'ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-video-renderer, ytd-reel-item-renderer';
let processing = false;
let pendingRun = false;

// Restore cache from sessionStorage if present
try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
        const obj = JSON.parse(cached);
        if (obj && typeof obj === 'object') {
            Object.entries(obj).forEach(([channelId, isRu]) => {
                // only boolean values are a valid cache entry
                if (typeof isRu === 'boolean') {
                    checkedChannels[channelId] = isRu;
                }
            });
        }
    }
    sessionStorage.removeItem('yt_ru_highlighter_checked_channels');
} catch (_) {}

function extractChannelId(url) {
    const match = url && (
        url.match(/\/channel\/([a-zA-Z0-9_-]+)/) ||
        url.match(/youtube\.com\/@([a-zA-Z0-9._-]+)/)
    );
    return match ? match[1] : null;
}

function getChannelInfo(element) {
    // Try multiple modern and legacy selectors for channel link
    const selectors = [
        '#channel-name a',
        'ytd-channel-name a',
        'a.yt-simple-endpoint.yt-formatted-string[href^="/@"]',
        'a[href^="/@"]',
        'a[href*="/channel/"]',
        'a[href^="https://www.youtube.com/@"]',
        'a[href*="youtube.com/channel/"]'
    ];
    let link = null;
    for (const s of selectors) {
        const candidate = element.querySelector(s);
        if (candidate && candidate.href && /youtube\.com\/(?:@|channel\/)/.test(candidate.href)) {
            link = candidate;
            break;
        }
    }
    if (!link || !link.href) return null;
    const channelId = extractChannelId(link.href);
    return channelId ? { id: channelId, element } : null;
}

async function fetchChannelsInfo(channelIds) {
    if (!channelIds || channelIds.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_ids: channelIds }),
            mode: 'cors',
            signal: controller.signal,
            keepalive: true,
        });
        if (!response.ok) return;
        const data = await response.json();
        Object.entries(data).forEach(([channelId, info]) => {
            checkedChannels[channelId] = info && info.country_code === 'RU';
        });
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(checkedChannels));
        } catch (_) {}
    } catch (_) {
        // swallow network/timeout errors
    } finally {
        clearTimeout(timer);
    }
}

function chunkArray(arr, size) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) {
        res.push(arr.slice(i, i + size));
    }
    return res;
}

async function fetchChannelsInfoBatched(channelIds) {
    const chunks = chunkArray(channelIds, FETCH_CHUNK_SIZE);
    for (const ids of chunks) {
        await fetchChannelsInfo(ids);
    }
}

function setHighlight(video, highlighted) {
    // youtube reuses card nodes, so the border has to be removed explicitly,
    // otherwise it stays on a card that now shows another channel
    if (highlighted) {
        video.style.setProperty('border', '5px solid red', 'important');
        video.style.setProperty('box-sizing', 'border-box', 'important');
        video.dataset.ruHighlighted = '1';
    } else if (video.dataset.ruHighlighted) {
        video.style.removeProperty('border');
        video.style.removeProperty('box-sizing');
        delete video.dataset.ruHighlighted;
    }
}

function highlightVideos() {
    document.querySelectorAll(VIDEO_SELECTOR).forEach(video => {
        const channelInfo = getChannelInfo(video);
        setHighlight(video, Boolean(channelInfo) && checkedChannels[channelInfo.id] === true);
    });
}

function collectChannelIds() {
    const channelIds = new Set();
    document.querySelectorAll(VIDEO_SELECTOR).forEach(video => {
        const channelInfo = getChannelInfo(video);
        if (channelInfo && !checkedChannels.hasOwnProperty(channelInfo.id)) {
            channelIds.add(channelInfo.id);
        }
    });
    return Array.from(channelIds);
}

async function processVideos() {
    if (!window.location.hostname.includes('youtube.com')) return;
    if (processing) {
        // a rerender happened while we were waiting for the server
        pendingRun = true;
        return;
    }
    processing = true;
    try {
        const channelIds = collectChannelIds();
        if (channelIds.length > 0) {
            await fetchChannelsInfoBatched(channelIds);
        }
        highlightVideos();
    } finally {
        processing = false;
    }
    if (pendingRun) {
        pendingRun = false;
        processVideos();
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

if (window.location.hostname.includes('youtube.com')) {
    const debouncedProcessVideos = debounce(processVideos, 250);
    processVideos();
    // href changes matter too: youtube reuses a card node and just repoints its links
    new MutationObserver(debouncedProcessVideos).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href']
    });
    document.addEventListener('yt-navigate-finish', debouncedProcessVideos);
    document.addEventListener('yt-page-data-updated', debouncedProcessVideos);
}