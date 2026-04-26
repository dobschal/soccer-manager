import {Application, EventData, isAndroid, isIOS, knownFolders, Page, path, Utils, WebView} from '@nativescript/core'
import {getWebContentPath, wasUpdateInstalled, checkForUpdate, hasStagedUpdate, promoteStagingIfReady} from './ota-update'
import {deviceToken, registrationError, onTokenAvailable} from './pushNotifications'

declare const NSURL: any
declare const UIColor: any
declare const android: any
declare const WKWebsiteDataStore: any
declare const NSSet: any
declare const WKWebsiteDataRecord: any
declare const NSDate: any
declare const UNUserNotificationCenter: any
declare const UNAuthorizationOptionAlert: number
declare const UNAuthorizationOptionBadge: number
declare const UNAuthorizationOptionSound: number
declare const UIApplication: any
declare const NSObject: any
declare const WKUIDelegate: any

let webViewRef: WebView | null = null
let resumeHandler: (() => void) | null = null
let webViewInitialized = false

export function onPageLoaded(args: EventData) {
    const page = args.object as Page
    page.backgroundColor = '#222222'

    // On Android, push the content below the system status bar
    if (isAndroid) {
        const resources = Utils.android.getApplicationContext().getResources()
        const resourceId = resources.getIdentifier('status_bar_height', 'dimen', 'android')
        if (resourceId > 0) {
            const statusBarHeightPx = resources.getDimensionPixelSize(resourceId)
            page.nativeViewProtected.setPadding(0, statusBarHeightPx, 0, 0)
        }
    }

    // Start OTA check in background
    checkForUpdate().catch(err => console.error('[OTA] Background check failed:', err))

    // On resume: if a staged update is ready, promote it and reload the WebView.
    // Otherwise, just trigger the webapp to refresh the current page data.
    if (!resumeHandler) {
        resumeHandler = () => {
            if (!webViewRef) return
            if (hasStagedUpdate()) {
                console.log('[OTA] App resumed with staged update, clearing cache and reloading...')
                promoteStagingIfReady()
                webViewInitialized = false
                const webPath = getWebContentPath()
                clearWebViewCache(webViewRef).then(() => {
                    if (isIOS) {
                        loadWebViewIOS(webViewRef!, webPath)
                        webViewInitialized = true
                    } else if (isAndroid) {
                        loadWebViewAndroid(webViewRef!, webPath)
                        webViewInitialized = true
                    }
                    // Show toast after reload
                    setTimeout(() => showOtaToast(webViewRef!), 3000)
                })
            } else {
                // No OTA update — trigger a data refresh in the webapp
                console.log('[Resume] No OTA update, triggering webapp refresh...')
                triggerWebAppRefresh(webViewRef!)
            }
        }
        Application.on(Application.resumeEvent, resumeHandler)
    }
}

function setWebViewBackgroundColor(webView: WebView) {
    if (isIOS) {
        const wkWebView = webView.ios as any
        wkWebView.opaque = false
        wkWebView.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0x22 / 255, 0x22 / 255, 0x22 / 255, 1)
        wkWebView.scrollView.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0x22 / 255, 0x22 / 255, 0x22 / 255, 1)
    } else if (isAndroid) {
        const nativeWebView = webView.android as any
        nativeWebView.setBackgroundColor(android.graphics.Color.parseColor('#222222'))
    }
}

function clearWebViewCache(webView: WebView): Promise<void> {
    return new Promise((resolve) => {
        if (isIOS) {
            const dataStore = WKWebsiteDataStore.defaultDataStore()
            // Only clear disk/memory cache, NOT localStorage/sessionStorage/cookies
            const cacheTypes = NSSet.setWithArray([
                'WKWebsiteDataTypeDiskCache',
                'WKWebsiteDataTypeMemoryCache'
            ])
            const date = NSDate.dateWithTimeIntervalSince1970(0)
            dataStore.removeDataOfTypesModifiedSinceCompletionHandler(cacheTypes, date, () => {
                console.log('[OTA] iOS WebView resource cache cleared (localStorage preserved)')
                resolve()
            })
        } else if (isAndroid) {
            const nativeWebView = webView.android as any
            nativeWebView.clearCache(true)
            console.log('[OTA] Android WebView cache cleared')
            resolve()
        } else {
            resolve()
        }
    })
}

function triggerWebAppRefresh(webView: WebView) {
    const script = 'if (window.__onAppResume) window.__onAppResume();'
    if (isIOS) {
        const wkWebView = webView.ios as any
        wkWebView.evaluateJavaScriptCompletionHandler(script, () => {})
    } else if (isAndroid) {
        const nativeWebView = webView.android as any
        nativeWebView.evaluateJavascript(script, null)
    }
}

function showOtaToast(webView: WebView) {
    if (isIOS) {
        const wkWebView = webView.ios as any
        wkWebView.evaluateJavaScriptCompletionHandler(
            'if (window.__showOtaToast) window.__showOtaToast();',
            () => {}
        )
    } else if (isAndroid) {
        const nativeWebView = webView.android as any
        nativeWebView.evaluateJavascript(
            'if (window.__showOtaToast) window.__showOtaToast();',
            null
        )
    }
}

export function onWebViewLoaded(args: EventData) {
    const webView = args.object as WebView
    webViewRef = webView
    setWebViewBackgroundColor(webView)

    // Only load the web content on first initialization, not on resume from background
    if (webViewInitialized) {
        console.log('[WebView] Already initialized, skipping reload')
        return
    }
    webViewInitialized = true

    const webPath = getWebContentPath()

    if (isIOS) {
        loadWebViewIOS(webView, webPath)
        setupIOSPushNotifications(webView)
    } else if (isAndroid) {
        loadWebViewAndroid(webView, webPath)
    }

    // If an OTA update was installed in a previous session, show toast after load
    if (wasUpdateInstalled()) {
        setTimeout(() => showOtaToast(webView), 3000)
    }
}

/**
 * Inject a log message into the WebView so it gets sent to the server via sendLog.
 * Falls back to console.log if webView is not available.
 */
function nativeLog(webView: WebView, message: string, level: string = 'info'): void {
    console.log(message)
    try {
        const wkWebView = webView.ios as any
        if (!wkWebView) return
        const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
        const script = `if (typeof window.__nativeLogs === 'undefined') window.__nativeLogs = []; window.__nativeLogs.push('${escaped}'); try { import('./lib/clientLogger.js').then(m => m.sendLog('${escaped}', '${level}')).catch(() => {}); } catch(e) {}`
        wkWebView.evaluateJavaScriptCompletionHandler(script, () => {})
    } catch (e) {
        // ignore — logging must never break the app
    }
}

function setupIOSPushNotifications(webView: WebView): void {
    // Request push notification permissions
    const center = UNUserNotificationCenter.currentNotificationCenter()
    nativeLog(webView, '[Push][Native] Requesting push notification permissions...')
    center.requestAuthorizationWithOptionsCompletionHandler(
        UNAuthorizationOptionAlert | UNAuthorizationOptionBadge | UNAuthorizationOptionSound,
        (granted: boolean, error: any) => {
            nativeLog(webView, `[Push][Native] Permission result: granted=${granted}, error=${error ? error.localizedDescription : 'none'}`)
            if (granted) {
                nativeLog(webView, '[Push][Native] Calling registerForRemoteNotifications...')
                // Must dispatch to main thread — this callback runs on an arbitrary queue
                Utils.executeOnMainThread(() => {
                    UIApplication.sharedApplication.registerForRemoteNotifications()
                    nativeLog(webView, '[Push][Native] registerForRemoteNotifications called on main thread')
                })
            } else {
                nativeLog(webView, '[Push][Native] User denied push notification permission', 'warn')
            }
        }
    )

    // When a device token becomes available, inject it into the WebView
    onTokenAvailable((token: string, platform: string) => {
        nativeLog(webView, `[Push][Native] onTokenAvailable fired - token: ${token ? token.substring(0, 10) + '...' : 'EMPTY'}, platform: ${platform}`)
        const wkWebView = webView.ios as any
        if (!wkWebView) {
            nativeLog(webView, '[Push][Native] onTokenAvailable: wkWebView is null!', 'error')
            return
        }
        const script = `window.__nativeDeviceToken = '${token}'; window.__nativePlatform = '${platform}'; if (typeof window.__onNativeDeviceToken === 'function') { window.__onNativeDeviceToken('${token}', '${platform}'); }`
        wkWebView.evaluateJavaScriptCompletionHandler(script, () => {})
    })

    // Inject platform info (and device token if available) on every page load
    webView.on(WebView.loadFinishedEvent, (loadArgs: any) => {
        if (!loadArgs.error && isIOS) {
            const wkWebView = webView.ios as any
            if (!wkWebView) return
            nativeLog(webView, `[Push][Native] loadFinished - deviceToken: ${deviceToken ? deviceToken.substring(0, 10) + '...' : 'NULL'}, registrationError: ${registrationError || 'none'}`)
            let script = `window.__nativePlatform = 'ios';`
            if (deviceToken) {
                script += ` window.__nativeDeviceToken = '${deviceToken}'; if (typeof window.__onNativeDeviceToken === 'function') { window.__onNativeDeviceToken('${deviceToken}', 'ios'); }`
            }
            wkWebView.evaluateJavaScriptCompletionHandler(script, () => {})
        }
    })
}

function loadWebViewIOS(webView: WebView, webPath: string) {
    const wkWebView = webView.ios as any
    const indexPath = path.join(webPath, 'index.html')

    // Enable Safari Web Inspector
    wkWebView.inspectable = true

    // Disable zoom
    wkWebView.isMultipleTouchEnabled = false

    // Allow cross-origin requests from file:// URLs
    wkWebView.configuration.preferences.setValueForKey(true, 'allowFileAccessFromFileURLs')
    wkWebView.configuration.setValueForKey(true, 'allowUniversalAccessFromFileURLs')

    // Open target="_blank" links in the system browser (Safari)
    const uiDelegate = setupIOSUIDelegate()
    wkWebView.UIDelegate = uiDelegate
    // Keep a strong reference so ARC doesn't deallocate the delegate
    ;(webView as any).__uiDelegate = uiDelegate

    const fileUrl = NSURL.fileURLWithPath(indexPath)
    const dirUrl = NSURL.fileURLWithPath(webPath)

    wkWebView.loadFileURLAllowingReadAccessToURL(fileUrl, dirUrl)
}

/**
 * Creates a WKUIDelegate that intercepts target="_blank" link clicks
 * and opens them in the external system browser instead of the WebView.
 */
function setupIOSUIDelegate(): any {
    const WKUIDelegateImpl = (NSObject as any).extend({
        // Called when a link with target="_blank" is clicked
        webViewCreateWebViewWithConfigurationForNavigationActionWindowFeatures(
            _webView: any, _configuration: any, navigationAction: any, _windowFeatures: any
        ): any {
            const request = navigationAction.request
            if (request && request.URL) {
                const url = request.URL.absoluteString
                if (url && url.length > 0) {
                    Utils.openUrl(url)
                }
            }
            return null
        }
    }, {
        protocols: [WKUIDelegate]
    })

    return WKUIDelegateImpl.new()
}

function loadWebViewAndroid(webView: WebView, webPath: string) {
    const nativeWebView = webView.android as any
    const settings = nativeWebView.getSettings()

    settings.setJavaScriptEnabled(true)
    settings.setDomStorageEnabled(true)
    settings.setAllowFileAccess(true)
    settings.setAllowFileAccessFromFileURLs(true)
    settings.setAllowUniversalAccessFromFileURLs(true)

    // Check if using OTA path (documents dir) or bundled path
    const bundledPath = path.join(knownFolders.currentApp().path, 'web')
    if (webPath === bundledPath) {
        nativeWebView.loadUrl('file:///android_asset/app/web/index.html')
    } else {
        nativeWebView.loadUrl('file://' + path.join(webPath, 'index.html'))
    }
}
