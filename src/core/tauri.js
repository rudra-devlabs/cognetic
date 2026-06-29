import { invoke } from '@tauri-apps/api/core';

export const tauriApi = {
    /**
     * Safely invoke a Tauri backend command.
     * If the app is running in a normal browser (not Tauri), it returns a fallback or logs a warning.
     * @param {string} cmd - The Rust command name
     * @param {object} args - Arguments to pass to the command
     */
    async invoke(cmd, args = {}) {
        if (window.__TAURI_INTERNALS__) {
            try {
                return await invoke(cmd, args);
            } catch (err) {
                console.error(`Tauri command '${cmd}' failed:`, err);
                throw err;
            }
        } else {
            console.warn(`Tauri is not available. Ignored command: ${cmd}`);
            return `[Browser Mock] Result of ${cmd}`;
        }
    },
    
    /**
     * Open a URL in the system's default browser
     * @param {string} url - The URL to open
     */
    async openExternal(url) {
        if (window.__TAURI_INTERNALS__) {
            try {
                // Using Tauri's shell API to open external URLs
                const { open } = await import('@tauri-apps/plugin-shell');
                await open(url);
            } catch (err) {
                console.error('Failed to open external URL:', err);
                throw err;
            }
        } else {
            // Fallback for browser environment - opens in new tab
            window.open(url, '_blank');
        }
    },
    
    isTauri: !!window.__TAURI_INTERNALS__
};
