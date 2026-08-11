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
import {deviceToken, devicePlatform, registrationError, onDeviceToken, onTokenAvailable, onDeepLink, onDeepLinkAvailable} from './pushNotifications'

declare const NSURL: any
declare const UIColor: any
declare const android: any
declare const com: any
declare const androidx: any
declare const java: any
declare const WKWebsiteDataStore: any
declare const NSSet: any
declare const WKWebsiteDataRecord: any
declare const NSDate: any
declare const UNUserNotificationCenter: any
declare const UNUserNotificationCenterDelegate: any
declare const SKStoreReviewController: any
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

/** `WKPermissionDecision.grant` — the raw value WebKit expects (#541). */
const WK_PERMISSION_DECISION_GRANT = 1

let webViewRef: WebView | null = null
let resumeHandler: (() => void) | null = null
let webViewInitialized = false

export function onPageLoaded(args: EventData) {
    const page = args.object as Page
    page.backgroundColor = '#222222'

    // On Android, push the content below the system status bar and above the navigation bar.
    // Old phones with hardware navigation keys still expose a `navigation_bar_height`
    // resource, but the on-screen bar is never actually drawn — see #364. Skip the
    // bottom padding in that case so the tab bar sits flush with the screen edge.
    if (isAndroid) {
        const context = Utils.android.getApplicationContext()
        const resources = context.getResources()
        const statusBarId = resources.getIdentifier('status_bar_height', 'dimen', 'android')
        const navBarId = resources.getIdentifier('navigation_bar_height', 'dimen', 'android')
        const statusBarHeightPx = statusBarId > 0 ? resources.getDimensionPixelSize(statusBarId) : 0
        let navBarHeightPx = navBarId > 0 ? resources.getDimensionPixelSize(navBarId) : 0

        try {
            const hasPermanentMenuKey = android.view.ViewConfiguration.get(context).hasPermanentMenuKey()
            const hasBackKey = android.view.KeyCharacterMap.deviceHasKey(android.view.KeyEvent.KEYCODE_BACK)
            if (hasPermanentMenuKey && hasBackKey) {
                navBarHeightPx = 0
            }
        } catch (e) {
            console.warn('[layout] hardware key detection failed', e)
        }

        page.nativeViewProtected.setPadding(0, statusBarHeightPx, 0, navBarHeightPx)
    }

    // Start OTA check in background
    checkForUpdate().catch(err => console.error('[OTA] Background check failed:', err))

    // On resume: if a staged update is ready, promote it and reload the WebView.
    // Otherwise, just trigger the webapp to refresh the current page data.
    if (!resumeHandler) {
        resumeHandler = () => {
            if (!webViewRef) return
            // Always clear the app icon badge the moment the app is foregrounded,
            // independent of OTA promotion or the webapp refresh round-trip (#425).
            clearAppBadge()
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

/**
 * Clear the app icon badge directly on the native side. This is far more
 * reliable than the server round-trip silent push (`server.clearBadge()`),
 * which depends on APNs actually delivering a `badge: 0` push — often
 * throttled or dropped by iOS, leaving the red "1" stuck on the icon (#425).
 *
 * On iOS we reset `applicationIconBadgeNumber` and remove already-delivered
 * notifications from the notification center. On Android the launcher badge
 * dot is tied to active notifications, so cancelling them clears it.
 */
function clearAppBadge(): void {
    try {
        if (isIOS) {
            const app = UIApplication.sharedApplication
            // iOS 16+: prefer the UNUserNotificationCenter API; fall back to the
            // (now-deprecated but still functional) applicationIconBadgeNumber.
            const center = UNUserNotificationCenter.currentNotificationCenter()
            if (center.setBadgeCountWithCompletionHandler) {
                center.setBadgeCountWithCompletionHandler(0, null)
            } else {
                app.applicationIconBadgeNumber = 0
            }
            center.removeAllDeliveredNotifications()
            console.log('[Badge] iOS app icon badge cleared')
        } else if (isAndroid) {
            const context = Utils.android.getApplicationContext()
            const notificationManager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE)
            notificationManager.cancelAll()
            console.log('[Badge] Android notifications cleared')
        }
    } catch (e) {
        console.warn('[Badge] Failed to clear app icon badge', e)
    }
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

    // Clear the app icon badge on cold start too — opening the app from a
    // killed state should also remove the red notification count (#425).
    clearAppBadge()

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

/**
 * Inject a deep link (URL hash) carried by a tapped push notification into the
 * WebView so the web app can navigate to it (#330).
 */
function injectDeepLink(webView: WebView, hash: string): void {
    if (!hash) return
    const escaped = hash.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const script = `if (typeof window.__handleDeepLink === 'function') { window.__handleDeepLink('${escaped}'); }`
    try {
        if (isIOS) {
            const wkWebView = webView.ios as any
            if (wkWebView) wkWebView.evaluateJavaScriptCompletionHandler(script, () => {})
        } else if (isAndroid) {
            const nativeWebView = webView.android as any
            if (nativeWebView) nativeWebView.evaluateJavascript(script, null)
        }
    } catch (e) {
        // navigation is best-effort; never crash the app over it
    }
}

function setupIOSPushNotifications(webView: WebView): void {
    // Request push notification permissions
    const center = UNUserNotificationCenter.currentNotificationCenter()

    // Listen for notification taps so we can deep-link into the web app (#330).
    try {
        const delegate = createIOSNotificationDelegate(webView)
        center.delegate = delegate
        ;(webView as any).__notificationDelegate = delegate // keep a strong ref
    } catch (e: any) {
        nativeLog(webView, `[Push][Native] Failed to set notification delegate: ${e?.message ?? e}`, 'error')
    }

    // Replay a deep link that was tapped before the WebView finished loading.
    onDeepLinkAvailable((hash: string) => injectDeepLink(webView, hash))

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
                } else if (type === 'requestReview') {
                    nativeLog(webView, '[Bridge] requestReview requested')
                    requestIOSReview(webView)
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

/**
 * Build a UNUserNotificationCenterDelegate that reads the `deep_link` field from
 * a tapped notification's payload and forwards it to the web app (#330). Also
 * lets notifications display while the app is in the foreground.
 */
function createIOSNotificationDelegate(webView: WebView): any {
    const DelegateImpl = (NSObject as any).extend({
        // Show banners/sounds even when the app is in the foreground.
        userNotificationCenterWillPresentNotificationWithCompletionHandler(
            _center: any, _notification: any, completionHandler: (options: number) => void
        ): void {
            try {
                // UNNotificationPresentationOptionBanner(16) | Sound(2) | Badge(1)
                completionHandler(16 | 2 | 1)
            } catch (e) {
                completionHandler(0)
            }
        },
        userNotificationCenterDidReceiveNotificationResponseWithCompletionHandler(
            _center: any, response: any, completionHandler: () => void
        ): void {
            try {
                const userInfo = response?.notification?.request?.content?.userInfo
                const deepLink = userInfo && userInfo.objectForKey ? userInfo.objectForKey('deep_link') : null
                if (deepLink) {
                    nativeLog(webView, `[Push][Native] Notification tapped, deep_link=${deepLink}`)
                    onDeepLink(String(deepLink))
                }
            } catch (e: any) {
                nativeLog(webView, `[Push][Native] Failed to read deep link: ${e?.message ?? e}`, 'error')
            } finally {
                completionHandler()
            }
        }
    }, {
        name: 'FmioNotificationDelegate',
        protocols: [UNUserNotificationCenterDelegate]
    })
    return DelegateImpl.new()
}

/**
 * Show the native iOS rating prompt via StoreKit. The OS rate-limits this to a
 * few times per year, so it is safe to call after a win (#371).
 */
function requestIOSReview(webView: WebView): void {
    try {
        Utils.executeOnMainThread(() => {
            try {
                const scene = UIApplication.sharedApplication?.connectedScenes?.anyObject?.()
                if (scene && typeof SKStoreReviewController?.requestReviewInScene === 'function') {
                    SKStoreReviewController.requestReviewInScene(scene)
                } else if (typeof SKStoreReviewController?.requestReview === 'function') {
                    SKStoreReviewController.requestReview()
                }
            } catch (inner: any) {
                nativeLog(webView, `[Review] iOS requestReview failed: ${inner?.message ?? inner}`, 'error')
            }
        })
    } catch (e: any) {
        nativeLog(webView, `[Review] iOS requestReview dispatch failed: ${e?.message ?? e}`, 'error')
    }
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
        },

        // getUserMedia inside the WebView (voice messages, #541). Without this
        // delegate method WebKit denies the request outright on iOS 15+, so the
        // recorder would never start. The content is our own bundle, so the
        // grant is unconditional — iOS still shows its own system prompt the
        // first time, backed by NSMicrophoneUsageDescription.
        webViewRequestMediaCapturePermissionForOriginInitiatedByFrameTypeDecisionHandler(
            _webView: any, _origin: any, _frame: any, _type: number, decisionHandler: (decision: number) => void
        ): void {
            decisionHandler(WK_PERMISSION_DECISION_GRANT)
        }
    }, {
        protocols: [WKUIDelegate]
    })

    return WKUIDelegateImpl.new()
}

/**
 * Read the `deep_link` extra placed on the launch intent when the user taps a
 * notification, and forward it to the web app. Clears the extra so it isn't
 * replayed on the next resume (#330).
 */
function checkAndroidLaunchIntent(): void {
    try {
        const activity = Application.android.foregroundActivity || Application.android.startActivity
        if (!activity) return
        const intent = activity.getIntent()
        if (!intent) return
        const deepLink = intent.getStringExtra('deep_link')
        if (deepLink) {
            console.log('[Push][Android] Launch intent deep_link:', deepLink)
            intent.removeExtra('deep_link')
            onDeepLink(String(deepLink))
        }
    } catch (e: any) {
        console.error('[Push][Android] Error reading launch intent:', e?.message ?? e)
    }
}

function setupAndroidPushNotifications(webView: WebView): void {
    requestAndroidPostNotificationsPermission()
    requestAndroidFcmToken()

    // Forward tapped-notification deep links into the WebView (#330).
    onDeepLinkAvailable((hash: string) => injectDeepLink(webView, hash))
    checkAndroidLaunchIntent()
    // A tap while the app is backgrounded re-delivers the intent on resume.
    Application.on(Application.resumeEvent, () => checkAndroidLaunchIntent())

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

/** Request code for the file-chooser activity result. Arbitrary but unique. */
const ANDROID_FILE_CHOOSER_REQUEST = 5142

/** The callback WebView handed us; resolved (or nulled) by the activity result. */
let androidFilePathCallback: any = null

/** Where the camera app is told to write its picture, so we can hand back a URI. */
let androidCameraOutputUri: any = null

/**
 * Teach the Android WebView how to answer `<input type="file">`.
 *
 * Android's default `WebChromeClient` simply drops the request, which is why
 * every picture upload in the app (avatar, emblem, chat, forum, posts) did
 * nothing on Android (#542). We open the system chooser the page asked for and
 * add a camera intent next to it, so "take a photo" works the same way it does
 * on iOS.
 */
function setupAndroidFileChooser(nativeWebView: any): void {
    const WebChromeClient = android.webkit.WebChromeClient
    const FileChooserClient = (WebChromeClient as any).extend({
        onShowFileChooser(_webView: any, filePathCallback: any, fileChooserParams: any): boolean {
            try {
                const activity = Application.android.foregroundActivity || Application.android.startActivity
                if (!activity) return false

                // A second request while one is open would strand the first
                // callback and hang the page's file input forever.
                if (androidFilePathCallback) androidFilePathCallback.onReceiveValue(null)
                androidFilePathCallback = filePathCallback

                // `createIntent()` already carries the accept types and the
                // multiple flag from the HTML input.
                const contentIntent = fileChooserParams.createIntent()
                const chooser = new android.content.Intent(android.content.Intent.ACTION_CHOOSER)
                chooser.putExtra(android.content.Intent.EXTRA_INTENT, contentIntent)

                const cameraIntent = createAndroidCameraIntent(activity)
                if (cameraIntent) {
                    chooser.putExtra(
                        android.content.Intent.EXTRA_INITIAL_INTENTS,
                        [cameraIntent] as any
                    )
                }
                activity.startActivityForResult(chooser, ANDROID_FILE_CHOOSER_REQUEST)
                return true
            } catch (e: any) {
                console.error('[FileChooser][Android] Failed to open chooser:', e?.message ?? e)
                // Release the input so the page is not stuck waiting.
                if (androidFilePathCallback) {
                    androidFilePathCallback.onReceiveValue(null)
                    androidFilePathCallback = null
                }
                return false
            }
        }
    })
    nativeWebView.setWebChromeClient(new FileChooserClient())

    Application.android.on(
        (Application.android as any).activityResultEvent,
        onAndroidFileChooserResult
    )
}

/**
 * Build the "take a photo" intent that sits beside the gallery in the chooser.
 * Returns null when no camera app can serve it — the chooser then simply shows
 * the gallery.
 */
function createAndroidCameraIntent(activity: any): any {
    try {
        const intent = new android.content.Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
        if (!intent.resolveActivity(activity.getPackageManager())) return null

        // A file in our own cache dir, shared through the FileProvider declared
        // in AndroidManifest.xml — passing a raw file:// URI would throw
        // FileUriExposedException on modern Android.
        const dir = new java.io.File(activity.getCacheDir(), 'camera')
        dir.mkdirs()
        const file = new java.io.File(dir, `capture_${new Date().getTime()}.jpg`)
        androidCameraOutputUri = androidx.core.content.FileProvider.getUriForFile(
            activity, `${activity.getPackageName()}.fileprovider`, file
        )
        intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, androidCameraOutputUri)
        intent.addFlags(android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        return intent
    } catch (e: any) {
        console.error('[FileChooser][Android] Camera intent unavailable:', e?.message ?? e)
        androidCameraOutputUri = null
        return null
    }
}

/**
 * Hand the picked file(s) back to the WebView. Every path out of here has to
 * call `onReceiveValue` exactly once — otherwise the page's file input stays
 * disabled until the app is restarted.
 */
function onAndroidFileChooserResult(args: any): void {
    if (args.requestCode !== ANDROID_FILE_CHOOSER_REQUEST) return
    const callback = androidFilePathCallback
    androidFilePathCallback = null
    if (!callback) return

    try {
        const RESULT_OK = -1
        if (args.resultCode !== RESULT_OK) {
            callback.onReceiveValue(null)
            return
        }
        const uris = collectAndroidPickedUris(args.intent)
        callback.onReceiveValue(uris.length > 0 ? uris : null)
    } catch (e: any) {
        console.error('[FileChooser][Android] Failed to read result:', e?.message ?? e)
        callback.onReceiveValue(null)
    } finally {
        androidCameraOutputUri = null
    }
}

/**
 * The picked URIs, covering all three shapes an Android chooser can return:
 * a single item, a multi-select `ClipData`, or nothing at all — which means
 * the camera wrote to the file we handed it.
 */
function collectAndroidPickedUris(intent: any): any[] {
    const uris: any[] = []
    if (intent) {
        const clipData = intent.getClipData()
        if (clipData) {
            for (let i = 0; i < clipData.getItemCount(); i++) {
                uris.push(clipData.getItemAt(i).getUri())
            }
        } else if (intent.getData()) {
            uris.push(intent.getData())
        }
    }
    if (uris.length === 0 && androidCameraOutputUri) {
        uris.push(androidCameraOutputUri)
    }
    return uris
}

function loadWebViewAndroid(webView: WebView, webPath: string) {
    const nativeWebView = webView.android as any
    const settings = nativeWebView.getSettings()

    settings.setJavaScriptEnabled(true)
    settings.setDomStorageEnabled(true)
    settings.setAllowFileAccess(true)
    settings.setAllowFileAccessFromFileURLs(true)
    settings.setAllowUniversalAccessFromFileURLs(true)

    // Expose window.AndroidBridge.requestReview() for the in-app review prompt (#371)
    setupAndroidReviewBridge(nativeWebView)

    // Make <input type="file"> work at all (#542) — the stock WebChromeClient
    // ignores it, so every upload button in the app was dead on Android.
    setupAndroidFileChooser(nativeWebView)

    // Check if using OTA path (documents dir) or bundled path
    const bundledPath = path.join(knownFolders.currentApp().path, 'web')
    if (webPath === bundledPath) {
        nativeWebView.loadUrl('file:///android_asset/app/web/index.html')
    } else {
        nativeWebView.loadUrl('file://' + path.join(webPath, 'index.html'))
    }
}

/**
 * Register a JS interface so the web app can trigger the Google Play in-app
 * review flow via `window.AndroidBridge.requestReview()` (#371).
 */
function setupAndroidReviewBridge(nativeWebView: any): void {
    try {
        const JavaScriptInterface = (java.lang.Object as any).extend({
            requestReview(): void {
                try {
                    const activity = Application.android.foregroundActivity || Application.android.startActivity
                    if (!activity) return
                    const ReviewManagerFactory = com.google.android.play.core.review.ReviewManagerFactory
                    const manager = ReviewManagerFactory.create(activity)
                    const request = manager.requestReviewFlow()
                    request.addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener({
                        onComplete(task: any): void {
                            try {
                                if (!task.isSuccessful()) {
                                    console.error('[Review][Android] requestReviewFlow failed')
                                    return
                                }
                                const reviewInfo = task.getResult()
                                manager.launchReviewFlow(activity, reviewInfo)
                            } catch (e: any) {
                                console.error('[Review][Android] launchReviewFlow error:', e?.message ?? e)
                            }
                        }
                    }))
                } catch (e: any) {
                    console.error('[Review][Android] requestReview error:', e?.message ?? e)
                }
            }
        })
        nativeWebView.addJavascriptInterface(new JavaScriptInterface(), 'AndroidBridge')
    } catch (e: any) {
        console.error('[Review][Android] Failed to register AndroidBridge:', e?.message ?? e)
    }
}
