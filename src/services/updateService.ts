/**
 * Update Check Service - Checks GitHub releases for app updates
 */

import { fetch } from '@tauri-apps/plugin-http';

const GITHUB_REPO = 'StRonKEA/Antigravity-Claude-Proxy-GUI';
const CURRENT_VERSION = '1.0.0';

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    published_at: string;
    body: string;
}

export interface UpdateInfo {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    releaseNotes: string;
}

function compareVersions(current: string, latest: string): boolean {
    const currentParts = current.replace('v', '').split('.').map(Number);
    const latestParts = latest.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const c = currentParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Antigravity-Claude-Proxy-GUI'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const release: GitHubRelease = await response.json();
        const latestVersion = release.tag_name.replace('v', '');
        const updateAvailable = compareVersions(CURRENT_VERSION, latestVersion);

        return {
            updateAvailable,
            currentVersion: CURRENT_VERSION,
            latestVersion,
            releaseUrl: release.html_url,
            releaseNotes: release.body || ''
        };
    } catch (error) {
        console.error('Failed to check for updates:', error);
        return {
            updateAvailable: false,
            currentVersion: CURRENT_VERSION,
            latestVersion: CURRENT_VERSION,
            releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
            releaseNotes: ''
        };
    }
}

export function getCurrentVersion(): string {
    return CURRENT_VERSION;
}
