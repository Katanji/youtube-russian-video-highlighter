const serverUrl = 'https://6281-216-98-82-134.ngrok-free.app/check-channels';
const checkedChannels = {};

function extractChannelId(url) {
    const match = url && (url.match(/channel\/([a-zA-Z0-9_-]+)/) || url.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/));
    return match ? match[1] : null;
}

function getChannelInfo(element) {
    const link = element.querySelector("#text.ytd-channel-name a, yt-formatted-string.ytd-channel-name a");
    if (!link || !link.href) return null;
    const channelId = extractChannelId(link.href);
    return channelId ? { id: channelId, element } : null;
}

async function fetchChannelsInfo(channelIds) {
    if (!channelIds || channelIds.length === 0) return;
    const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: channelIds }),
        mode: 'cors',
    });
    if (!response.ok) return;
    const data = await response.json();
    Object.entries(data).forEach(([channelId, info]) => {
        checkedChannels[channelId] = info.country_code === 'RU';
    });
}

function highlightVideos() {
    document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer').forEach(video => {
        const channelInfo = getChannelInfo(video);
        if (channelInfo && checkedChannels[channelInfo.id]) {
            video.style.setProperty('border', '5px solid red', 'important');
            video.style.setProperty('box-sizing', 'border-box', 'important');
        }
    });
}

function collectChannelIds() {
    const channelIds = new Set();
    document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer').forEach(video => {
        const channelInfo = getChannelInfo(video);
        if (channelInfo && !checkedChannels.hasOwnProperty(channelInfo.id)) {
            channelIds.add(channelInfo.id);
        }
    });
    return Array.from(channelIds);
}

async function processVideos() {
    if (!window.location.hostname.includes('youtube.com')) return;
    const channelIds = collectChannelIds();
    if (channelIds.length > 0) {
        await fetchChannelsInfo(channelIds);
    }
    highlightVideos();
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
    new MutationObserver(debouncedProcessVideos).observe(document.body, {
        childList: true,
        subtree: true
    });
}