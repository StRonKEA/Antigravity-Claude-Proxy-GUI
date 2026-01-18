/**
 * Autostart Service - Controls Windows startup behavior
 */

import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

export async function enableAutoStart(): Promise<boolean> {
    try {
        await enable();
        return true;
    } catch (error) {
        console.error('Failed to enable autostart:', error);
        return false;
    }
}

export async function disableAutoStart(): Promise<boolean> {
    try {
        await disable();
        return true;
    } catch (error) {
        console.error('Failed to disable autostart:', error);
        return false;
    }
}

export async function getAutoStartStatus(): Promise<boolean> {
    try {
        return await isEnabled();
    } catch (error) {
        console.error('Failed to get autostart status:', error);
        return false;
    }
}

export async function setAutoStart(enabled: boolean): Promise<boolean> {
    if (enabled) {
        return enableAutoStart();
    } else {
        return disableAutoStart();
    }
}
