import {ApplicationSettings, File, Folder, Http, knownFolders, path} from '@nativescript/core'

const SERVER_URL = 'https://footballmanager.io'
const OTA_DIR_NAME = 'ota-web'
const STAGING_DIR_NAME = 'ota-web-staging'
const UPDATE_INSTALLED_KEY = 'ota_update_installed'
const LOCAL_VERSION_KEY = 'ota_commit_hash'
const BUNDLED_HASH_KEY = 'ota_bundled_hash'

function getOtaDir(): Folder {
    return knownFolders.documents().getFolder(OTA_DIR_NAME)
}

function getStagingDir(): Folder {
    return knownFolders.documents().getFolder(STAGING_DIR_NAME)
}

/**
 * Returns true if a staged update is ready to be promoted.
 */
export function hasStagedUpdate(): boolean {
    const stagingIndex = path.join(getStagingDir().path, 'index.html')
    return File.exists(stagingIndex)
}

/**
 * Recursively copies the contents of `src` into `dest`. Both folders must exist.
 */
function copyFolderContents(src: Folder, dest: Folder): void {
    const entities = src.getEntitiesSync()
    if (!entities) return

    for (const entity of entities) {
        const destPath = path.join(dest.path, entity.name)
        if (entity instanceof File) {
            entity.copySync(destPath)
        } else if (entity instanceof Folder) {
            const destSubfolder = Folder.fromPath(destPath)
            copyFolderContents(entity, destSubfolder)
        }
    }
}

/**
 * If a staging update exists, promote it to the active OTA dir.
 * Returns true on a successful promotion, false otherwise.
 *
 * Uses a copy-then-clear approach instead of `renameSync`: on Android,
 * `java.io.File.renameTo` is unreliable and can fail silently (especially while
 * the WebView is still referencing files in the active OTA dir on resume),
 * leaving the staging dir intact and `hasStagedUpdate()` perpetually true —
 * which caused the toast to fire on every app start without the WebView
 * content actually being updated.
 */
export function promoteStagingIfReady(): boolean {
    const stagingDir = getStagingDir()
    const stagingIndex = path.join(stagingDir.path, 'index.html')

    if (!File.exists(stagingIndex)) {
        return false
    }

    console.log('[OTA] Promoting staged update to active OTA dir...')

    try {
        const otaDir = getOtaDir()
        // Empty the active OTA dir contents but keep the directory itself,
        // so we don't have to rely on `renameTo` succeeding afterwards.
        otaDir.clearSync()

        copyFolderContents(stagingDir, otaDir)

        const newOtaIndex = path.join(otaDir.path, 'index.html')
        if (!File.exists(newOtaIndex)) {
            console.error('[OTA] Promotion failed: index.html missing in OTA dir after copy')
            return false
        }

        // Clear staging so we don't try to promote the same payload again.
        stagingDir.clearSync()

        ApplicationSettings.setBoolean(UPDATE_INSTALLED_KEY, true)
        console.log('[OTA] Staged update promoted.')
        return true
    } catch (e) {
        console.error('[OTA] Failed to promote staged update:', e)
        return false
    }
}

/**
 * Detects if the native app binary was updated (new install from store).
 * If the bundled commitHash changed, the OTA cache is stale and must be cleared
 * so the newer bundled webapp is used instead.
 */
function clearOtaIfAppUpdated(): void {
    const bundledHash = getBundledCommitHash()
    if (!bundledHash) return

    const lastKnownBundledHash = ApplicationSettings.getString(BUNDLED_HASH_KEY, '')

    if (lastKnownBundledHash && lastKnownBundledHash !== bundledHash) {
        console.log(`[OTA] Native app updated (bundled hash changed: ${lastKnownBundledHash} → ${bundledHash}), clearing OTA cache...`)

        const otaDir = getOtaDir()
        if (Folder.exists(otaDir.path)) {
            otaDir.removeSync()
        }

        const stagingDir = getStagingDir()
        if (Folder.exists(stagingDir.path)) {
            stagingDir.removeSync()
        }

        // Reset stored OTA hash so checkForUpdate compares against bundled version
        ApplicationSettings.remove(LOCAL_VERSION_KEY)
    }

    // Always keep the bundled hash in sync
    ApplicationSettings.setString(BUNDLED_HASH_KEY, bundledHash)
}

/**
 * Returns the path to use for loading web content.
 * First clears stale OTA content if the native app was updated,
 * then promotes any staged OTA update, then checks for OTA dir.
 * Falls back to the bundled web assets.
 */
export function getWebContentPath(): string {
    // Clear OTA if native app binary was updated
    clearOtaIfAppUpdated()

    // Promote staging to active before deciding which path to use
    promoteStagingIfReady()

    const otaDir = getOtaDir()
    const otaIndex = path.join(otaDir.path, 'index.html')

    if (File.exists(otaIndex)) {
        console.log('[OTA] Using OTA web content from:', otaDir.path)
        return otaDir.path
    }

    const bundledPath = path.join(knownFolders.currentApp().path, 'web')
    console.log('[OTA] Using bundled web content from:', bundledPath)
    return bundledPath
}

/**
 * Checks if an update was installed (from a previous session) and clears the flag.
 * Returns true if a new OTA update was applied since last check.
 */
export function wasUpdateInstalled(): boolean {
    const installed = ApplicationSettings.getBoolean(UPDATE_INSTALLED_KEY, false)
    if (installed) {
        ApplicationSettings.setBoolean(UPDATE_INSTALLED_KEY, false)
    }
    return installed
}

/**
 * Fetches the server's native-version.json, compares commitHash with local,
 * downloads and extracts zip to a staging directory (never touching the active OTA dir).
 */
export async function checkForUpdate(): Promise<void> {
    try {
        const versionUrl = `${SERVER_URL}/assets/native-version.json`
        console.log('[OTA] Checking for update at:', versionUrl)

        const response = await Http.getJSON<{ version: string; commitHash: string }>(versionUrl)
        const remoteHash = response.commitHash
        const localHash = getLocalCommitHash()

        console.log(`[OTA] Remote: ${remoteHash}, Local: ${localHash}`)

        if (remoteHash === localHash) {
            console.log('[OTA] Already up to date.')
            return
        }

        console.log('[OTA] New version available, downloading...')
        const zipUrl = `${SERVER_URL}/assets/native-client.zip`
        const tempZip = path.join(knownFolders.temp().path, 'native-client.zip')

        const zipFile = await Http.getFile(zipUrl, tempZip)
        console.log('[OTA] Downloaded zip to:', zipFile.path)

        // Clear old staging dir (safe - WebView never loads from staging)
        const stagingDir = getStagingDir()
        if (Folder.exists(stagingDir.path)) {
            stagingDir.clearSync()
        }

        // Extract zip to staging
        await unzipFile(zipFile.path, stagingDir.path)
        console.log('[OTA] Extracted to staging:', stagingDir.path)

        // Verify extraction
        const indexPath = path.join(stagingDir.path, 'index.html')
        if (!File.exists(indexPath)) {
            console.error('[OTA] Extraction failed - index.html not found in staging')
            return
        }

        // Save new commit hash. The UPDATE_INSTALLED_KEY flag is set later by
        // `promoteStagingIfReady` when the staging payload is actually copied
        // into the active OTA dir, so the toast can never fire without the
        // WebView content really being updated.
        ApplicationSettings.setString(LOCAL_VERSION_KEY, remoteHash)
        console.log('[OTA] Update staged successfully! Will load on next restart.')

        // Clean up temp zip
        const tempFile = File.fromPath(tempZip)
        if (File.exists(tempZip)) {
            tempFile.removeSync()
        }
    } catch (error) {
        console.error('[OTA] Update check failed:', error)
    }
}

/**
 * Reads the commitHash from the bundled native-version.json (shipped with the app binary).
 */
function getBundledCommitHash(): string {
    try {
        const bundledVersionPath = path.join(knownFolders.currentApp().path, 'web', 'native-version.json')
        if (File.exists(bundledVersionPath)) {
            const content = File.fromPath(bundledVersionPath).readTextSync()
            const data = JSON.parse(content)
            return data.commitHash || ''
        }
    } catch (e) {
        console.error('[OTA] Failed to read bundled version:', e)
    }
    return ''
}

/**
 * Gets the locally stored commit hash (from OTA or bundled version).
 */
function getLocalCommitHash(): string {
    // First check ApplicationSettings (set after OTA download)
    const storedHash = ApplicationSettings.getString(LOCAL_VERSION_KEY, '')
    if (storedHash) {
        return storedHash
    }

    // Fall back to reading from bundled native-version.json
    return getBundledCommitHash()
}

/**
 * Extracts a zip file to a destination directory.
 * Uses @nativescript/zip if available, otherwise falls back to native APIs.
 */
async function unzipFile(zipPath: string, destPath: string): Promise<void> {
    try {
        // Try using @nativescript/zip
        const {Zip} = require('@nativescript/zip')
        await Zip.unzip({
            archive: zipPath,
            directory: destPath
        })
    } catch (e) {
        console.warn('[OTA] nativescript-zip not available, using native unzip:', e)
        await nativeUnzip(zipPath, destPath)
    }
}

/**
 * Fallback native unzip implementation using platform APIs.
 */
async function nativeUnzip(zipPath: string, destPath: string): Promise<void> {
    // @ts-ignore - NativeScript platform detection
    if (typeof NSFileManager !== 'undefined') {
        // iOS: Use Foundation framework via NativeScript runtime
        await iosUnzip(zipPath, destPath)
    } else if (typeof java !== 'undefined') {
        // Android: Use java.util.zip
        androidUnzip(zipPath, destPath)
    } else {
        throw new Error('No unzip implementation available for this platform')
    }
}

declare const NSFileManager: any
declare const NSData: any
declare const SSZipArchive: any
declare const java: any

function iosUnzip(zipPath: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            reject(new Error('iOS native unzip requires @nativescript/zip plugin'))
        } catch (e) {
            reject(e)
        }
    })
}

function androidUnzip(zipPath: string, destPath: string): void {
    const ZipInputStream = java.util.zip.ZipInputStream
    const FileInputStream = java.io.FileInputStream
    const FileOutputStream = java.io.FileOutputStream
    const BufferedOutputStream = java.io.BufferedOutputStream

    const fis = new FileInputStream(zipPath)
    const zis = new ZipInputStream(fis)
    let entry = zis.getNextEntry()

    while (entry !== null) {
        const filePath = path.join(destPath, entry.getName())

        if (entry.isDirectory()) {
            const dir = new java.io.File(filePath)
            dir.mkdirs()
        } else {
            // Ensure parent directory exists
            const parent = new java.io.File(filePath).getParentFile()
            if (!parent.exists()) {
                parent.mkdirs()
            }

            const fos = new FileOutputStream(filePath)
            const bos = new BufferedOutputStream(fos)
            const buffer = (Array as any).create('byte', 4096)
            let count: number

            while ((count = zis.read(buffer)) !== -1) {
                bos.write(buffer, 0, count)
            }

            bos.flush()
            bos.close()
            fos.close()
        }

        zis.closeEntry()
        entry = zis.getNextEntry()
    }

    zis.close()
    fis.close()
}
