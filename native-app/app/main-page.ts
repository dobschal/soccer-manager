import {Application, EventData, isAndroid, isIOS, knownFolders, Page, path, Utils, WebView} from '@nativescript/core'
import {
    Environment,
    checkForUpdate,
    getEnvironment,
    getServerUrl,
    getWebContentPath,
    hasStagedUpdate,
    promoteStagingIfReady,
    setEnvironment,
    wasUpdateInstalled
} from './ota-update'
import {deviceToken, devicePlatform, registrationError, onDeviceToken, onTokenAvailable} from './pushNotifications'

declare const NSURL: any
declare const UIColor: any
declare const android: any
declare const com: any
declare const java: any
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
declare const WKUserScript: any
declare const WKUserScriptInjectionTimeAtDocumentStart: number
declare const WKScriptMessageHandler: any
declare const NSString: any

let webViewRef: WebView | null = null
let resumeHandler: (() => void) | null = null
let webViewInitialized = false

export function onPageLoaded(args: EventData) {
    const page = args.object as Page
    page.backgroundColor = '#222222'

    // On Android, push the content below the system status bar and above the navigation bar
    if (isAndroid) {
        const resources = Utils.android.getApplicationContext().getResources()
        const statusBarId = resources.getIdentifier('status_bar_height', 'dimen', 'android')
        const navBarId = resources.getIdentifier('navigation_bar_height', 'dimen', 'android')
        const statusBarHeightPx = statusBarId > 0 ? resources.getDimensionPixelSize(statusBarId) : 0
        const navBarHeightPx = navBarId > 0 ? resources.getDimensionPixelSize(navBarId) : 0
        page.nativeViewProtected.setPadding(0, statusBarHeightPx, 0, navBarHeightPx)
    }

    // Start OTA check in background
    checkForUpdate().catch(err => console.error('[OTA] Background check failed:', err))

    // On resume: if a staged update is ready, promote it and reload the WebView.
    // Otherwise, just trigger the webapp to refresh the current page data.
    if (!resumeHandler) {
        resumeHandler = () => {
            if (!webViewRef) return
            if (!hasStagedUpdate()) {
                // No OTA update — trigger a data refresh in the webapp
                console.log('[Resume] No OTA update, triggering webapp refresh...')
                triggerWebAppRefresh(webViewRef)
                return
            }

            console.log('[OTA] App resumed with staged update, promoting...')
            const promoted = promoteStagingIfReady()
            if (!promoted) {
                // Promotion failed (e.g. WebView still holds file refs on Android).
                // Leave staging in place so the next cold start can retry, and
                // do NOT show the toast — content was not actually updated.
                console.warn('[OTA] Resume-time promotion failed, will retry on cold start')
                triggerWebAppRefresh(webViewRef)
                return
            }

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
                // wasUpdateInstalled() reads + clears the flag set by
                // promoteStagingIfReady, ensuring the toast only fires when the
                // OTA dir really received new content.
                if (wasUpdateInstalled()) {
                    setTimeout(() => showOtaToast(webViewRef!), 3000)
                }
            })
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
        setupAndroidPushNotifications(webView)
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

    // Inject the active environment into the WebView before any page script runs,
    // and register the JS→native bridge used by the admin env switcher.
    setupIOSEnvironmentBridge(webView)

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
 * On iOS, ensures every page load knows which environment it is talking to
 * (production vs sandbox) and provides a `window.webkit.messageHandlers.fmioBridge`
 * channel so the admin page can request an environment switch.
 *
 * The WKUserScript runs at documentStart, so it sets `window.__NATIVE_SERVER_URL`
 * and `window.__nativeEnvironment` before the inline fallback in index.html
 * (which now reads `window.__NATIVE_SERVER_URL || 'https://footballmanager.io'`).
 *
 * Safe to call multiple times — the user content controller is reset before we
 * re-install the script so a re-load after env switch reflects the new env.
 */
function setupIOSEnvironmentBridge(webView: WebView): void {
    const wkWebView = webView.ios as any
    const controller = wkWebView.configuration.userContentController
    if (!controller) {
        nativeLog(webView, '[Bridge] setupIOSEnvironmentBridge: no userContentController', 'error')
        return
    }

    const env = getEnvironment()
    const serverUrl = getServerUrl(env)
    const bootstrapSource =
        `window.__nativePlatform = 'ios';` +
        ` window.__nativeEnvironment = '${env}';` +
        ` window.__NATIVE_SERVER_URL = '${serverUrl}';`

    controller.removeAllUserScripts()
    const userScript = WKUserScript.alloc().initWithSourceInjectionTimeForMainFrameOnly(
        bootstrapSource,
        WKUserScriptInjectionTimeAtDocumentStart,
        true
    )
    controller.addUserScript(userScript)
    nativeLog(webView, `[Bridge] User script installed (env=${env}, alreadyInstalled=${!!(webView as any).__fmioBridgeInstalled})`)

    // Only install the message handler once per WebView, otherwise WKWebKit
    // throws because the name is already registered.
    if (!(webView as any).__fmioBridgeInstalled) {
        const handler = createIOSBridgeHandler(webView)
        try {
            controller.addScriptMessageHandlerName(handler, 'fmioBridge')
            ;(webView as any).__fmioBridgeHandler = handler
            ;(webView as any).__fmioBridgeInstalled = true
            nativeLog(webView, '[Bridge] fmioBridge handler registered')
        } catch (e: any) {
            nativeLog(webView, `[Bridge] Failed to register fmioBridge handler: ${e?.message ?? e}`, 'error')
        }
    }
}

function createIOSBridgeHandler(webView: WebView): any {
    const HandlerImpl = (NSObject as any).extend({
        userContentControllerDidReceiveScriptMessage(_userContentController: any, message: any): void {
            try {
                const body = message.body
                nativeLog(webView, `[Bridge] Message received (body type=${typeof body}, raw=${tryStringify(body)})`)
                let type: string | undefined
                let env: string | undefined
                if (typeof body === 'string') {
                    const parsed = JSON.parse(body)
                    type = parsed?.type
                    env = parsed?.env
                } else if (body) {
                    type = body.type ?? (body.objectForKey && body.objectForKey('type'))
                    env = body.env ?? (body.objectForKey && body.objectForKey('env'))
                }
                if (type === 'setEnvironment') {
                    const target: Environment = env === 'sandbox' ? 'sandbox' : 'production'
                    nativeLog(webView, `[Bridge] setEnvironment requested: ${target}`)
                    handleEnvironmentSwitch(webView, target)
                } else {
                    nativeLog(webView, `[Bridge] Ignoring unknown message type: ${type}`, 'warn')
                }
            } catch (e: any) {
                nativeLog(webView, `[Bridge] Failed to handle script message: ${e?.message ?? e}`, 'error')
            }
        }
    }, {
        name: 'FmioBridgeHandler',
        protocols: [WKScriptMessageHandler]
    })
    return HandlerImpl.new()
}

function tryStringify(v: any): string {
    try {
        return JSON.stringify(v)
    } catch {
        return String(v)
    }
}

function handleEnvironmentSwitch(webView: WebView, env: Environment): void {
    const changed = setEnvironment(env)
    if (!changed) {
        nativeLog(webView, `[Env] Already on ${env}, nothing to do.`, 'warn')
        return
    }
    nativeLog(webView, `[Env] Switching to ${env} and reloading WebView...`)

    // Re-init the bridge so the next page load picks up the new env URL,
    // then clear the WebView cache and reload from the (now-empty) OTA path.
    setupIOSEnvironmentBridge(webView)
    webViewInitialized = false

    clearWebViewCache(webView).then(() => {
        // WKWebsiteDataStore's completion handler runs on a background queue,
        // but WKWebView UI updates (loadFileURL, etc.) must be on main thread.
        Utils.executeOnMainThread(() => {
            const webPath = getWebContentPath()
            nativeLog(webView, `[Env] Cache cleared, reloading from ${webPath}`)
            loadWebViewIOS(webView, webPath)
            webViewInitialized = true
            // Kick off a fresh OTA check so the new env's bundle is fetched.
            checkForUpdate().catch(err => nativeLog(webView, `[OTA] Post-switch check failed: ${err?.message ?? err}`, 'error'))
        })
    })
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

function setupAndroidPushNotifications(webView: WebView): void {
    requestAndroidPostNotificationsPermission()
    requestAndroidFcmToken()

    onTokenAvailable((token: string, platform: string) => {
        if (platform !== 'android') return
        const nativeWebView = webView.android as any
        if (!nativeWebView) return
        const escaped = token.replace(/'/g, "\\'")
        const script = `window.__nativeDeviceToken = '${escaped}'; window.__nativePlatform = 'android'; if (typeof window.__onNativeDeviceToken === 'function') { window.__onNativeDeviceToken('${escaped}', 'android'); }`
        nativeWebView.evaluateJavascript(script, null)
    })

    webView.on(WebView.loadFinishedEvent, (loadArgs: any) => {
        if (loadArgs.error || !isAndroid) return
        const nativeWebView = webView.android as any
        if (!nativeWebView) return
        let script = `window.__nativePlatform = 'android';`
        if (deviceToken && devicePlatform === 'android') {
            const escaped = deviceToken.replace(/'/g, "\\'")
            script += ` window.__nativeDeviceToken = '${escaped}'; if (typeof window.__onNativeDeviceToken === 'function') { window.__onNativeDeviceToken('${escaped}', 'android'); }`
        }
        nativeWebView.evaluateJavascript(script, null)
    })
}

function requestAndroidPostNotificationsPermission(): void {
    try {
        const sdkInt = android.os.Build.VERSION.SDK_INT
        if (sdkInt < 33) return // Android 12 and below grants this implicitly
        const activity = Application.android.foregroundActivity || Application.android.startActivity
        if (!activity) {
            console.warn('[Push][Android] No activity available to request POST_NOTIFICATIONS')
            return
        }
        const PackageManager = android.content.pm.PackageManager
        const permission = 'android.permission.POST_NOTIFICATIONS'
        if (activity.checkSelfPermission(permission) === PackageManager.PERMISSION_GRANTED) return
        activity.requestPermissions([permission], 1234)
    } catch (e: any) {
        console.error('[Push][Android] Error requesting POST_NOTIFICATIONS:', e?.message ?? e)
    }
}

function requestAndroidFcmToken(): void {
    try {
        const FirebaseMessaging = com.google.firebase.messaging.FirebaseMessaging
        const OnSuccessListener = com.google.android.gms.tasks.OnSuccessListener
        const OnFailureListener = com.google.android.gms.tasks.OnFailureListener
        const messaging = FirebaseMessaging.getInstance()
        const task = messaging.getToken()

        task.addOnSuccessListener(new OnSuccessListener({
            onSuccess(token: string): void {
                if (typeof token === 'string' && token.length > 0) {
                    console.log(`[Push][Android] FCM token received: ${token.substring(0, 10)}... (length: ${token.length})`)
                    onDeviceToken(token, 'android')
                } else {
                    console.error('[Push][Android] FCM returned empty token')
                }
            }
        }))
        task.addOnFailureListener(new OnFailureListener({
            onFailure(error: any): void {
                const msg = error?.getMessage?.() || String(error)
                console.error('[Push][Android] FCM getToken failed:', msg)
            }
        }))
    } catch (e: any) {
        console.error('[Push][Android] Error initializing FCM:', e?.message ?? e)
    }
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
