import { Command } from '@tauri-apps/plugin-shell';

const PACKAGE_NAME = 'antigravity-claude-proxy';
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

export interface PackageStatus {
    isInstalled: boolean;
    installedVersion: string | null;
    latestVersion: string | null;
    updateAvailable: boolean;
}

/**
 * Helper: Run any promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallbackValue), ms);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId!);
        return result;
    } catch (error) {
        clearTimeout(timeoutId!);
        throw error;
    }
}

/**
 * Get the latest version from NPM registry
 */
export async function getLatestVersion(): Promise<string> {
    const fetchVersion = async () => {
        try {
            // Try fetch first (fastest)
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000); // 3s fetch timeout

            const response = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
            clearTimeout(id);

            if (!response.ok) return '2.0.7';
            const data = await response.json();
            return data.version || '2.0.7';
        } catch {
            // Fallback to npm view
            try {
                // Tauri capability: "npm" -> "npm.cmd"
                const cmd = Command.create('npm', ['view', PACKAGE_NAME, 'version']);
                const output = await cmd.execute();
                if (output.code === 0) return output.stdout.trim();
            } catch (e) {
                // NPM view failed
            }
            return '2.0.7';
        }
    };

    return withTimeout(fetchVersion(), 5000, '2.0.7');
}

/**
 * Check if the package is installed globally using Tauri Shell
 */
export async function checkInstallation(): Promise<PackageStatus> {
    let installedVersion: string | null = null;
    let isInstalled = false;

    // FAST CHECK: Try running the command directly for version
    try {
        const checkCmd = async () => {
            try {
                // Tauri capability: "check-version" -> "antigravity-claude-proxy.cmd --version"
                const cmd = Command.create('check-version');
                const output = await cmd.execute();
                if (output.code === 0) {
                    return { installed: true, version: output.stdout.trim() };
                }
            } catch {
                // Binary not found
            }
            return { installed: false, version: null };
        };

        // 3 second timeout for fast check
        const result = await withTimeout(checkCmd(), 3000, { installed: false, version: null });
        if (result.installed) {
            isInstalled = true;
            installedVersion = result.version;
        } else {
            const npmCheck = async () => {
                try {
                    const cmd = Command.create('npm', ['list', '-g', PACKAGE_NAME, '--depth=0', '--json']);
                    const output = await cmd.execute();
                    if (output.code === 0) {
                        const data = JSON.parse(output.stdout);
                        const pkg = data.dependencies?.[PACKAGE_NAME];
                        if (pkg) {
                            return { installed: true, version: pkg.version };
                        }
                    }
                } catch {
                    // npm list failed
                }
                return { installed: false, version: null };
            };
            // 7 second timeout for npm list (reduced from 15s to prevent "freezing" feeling)
            const result = await withTimeout(npmCheck(), 7000, { installed: false, version: null });
            isInstalled = result.installed;
            installedVersion = result.version;
        }

    } catch {
        // Installation check failed
    }

    const latestVersion = await getLatestVersion();

    const status: PackageStatus = {
        isInstalled,
        installedVersion,
        latestVersion,
        updateAvailable: false,
    };

    if (status.isInstalled && status.installedVersion && latestVersion) {
        status.updateAvailable = compareVersions(latestVersion, status.installedVersion) > 0;
    }

    return status;
}

/**
 * Compare two semver versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
        if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
    }
    return 0;
}

/**
 * Install the package globally using Tauri Shell
 */
export async function installPackage(onProgress?: (msg: string) => void): Promise<boolean> {
    try {
        onProgress?.(`Running: npm install -g ${PACKAGE_NAME}@latest --force`);

        const cmd = Command.create('npm', ['install', '-g', `${PACKAGE_NAME}@latest`, '--force']);

        cmd.on('close', () => { });
        cmd.on('error', () => { });

        // 2 minute timeout for installation
        const installPromise = cmd.execute();
        const output = await withTimeout(installPromise, 120000, { code: -1, stdout: '', stderr: 'Timeout' } as Awaited<ReturnType<typeof cmd.execute>>);

        if (output.code === 0) {
            onProgress?.('Installation complete!');
            return true;
        } else {
            onProgress?.(`Error: ${output.stderr}`);
            return false;
        }
    } catch {
        onProgress?.('Installation exception');
        return false;
    }
}

/**
 * Update the package to latest version
 */
export async function updatePackage(onProgress?: (msg: string) => void): Promise<boolean> {
    try {
        onProgress?.(`Running: npm update -g ${PACKAGE_NAME}`);

        const cmd = Command.create('npm', ['update', '-g', PACKAGE_NAME]);
        const output = await cmd.execute();

        if (output.code === 0) {
            onProgress?.('Update complete!');
            return true;
        } else {
            onProgress?.(`Error: ${output.stderr}`);
            return false;
        }

    } catch {
        onProgress?.('Update failed');
        return false;
    }
}


