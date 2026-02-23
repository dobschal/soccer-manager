import {Application, EventData, isAndroid, isIOS, knownFolders, Page, path, WebView} from '@nativescript/core'
import {getWebContentPath, wasUpdateInstalled, checkForUpdate, hasStagedUpdate, promoteStagingIfReady} from './ota-update'

declare const NSURL: any
declare const UIColor: any
declare const android: any
declare const WKWebsiteDataStore: any
declare const NSSet: any
declare const WKWebsiteDataRecord: any
declare const NSDate: any

let webViewRef: WebView | null = null
let resumeHandler: (() => void) | null = null

export function onPageLoaded(args: EventData) {
    const page = args.object as Page
    page.backgroundColor = '#222222'

    // Start OTA check in background
    checkForUpdate().catch(err => console.error('[OTA] Background check failed:', err))

    // On resume: if a staged update is ready, promote it and reload the WebView
    if (!resumeHandler) {
        resumeHandler = () => {
            if (hasStagedUpdate() && webViewRef) {
                console.log('[OTA] App resumed with staged update, clearing cache and reloading...')
                promoteStagingIfReady()
                const webPath = getWebContentPath()
                clearWebViewCache(webViewRef).then(() => {
                    if (isIOS) {
                        loadWebViewIOS(webViewRef!, webPath)
                    } else if (isAndroid) {
                        loadWebViewAndroid(webViewRef!, webPath)
                    }
                    // Show toast after reload
                    setTimeout(() => showOtaToast(webViewRef!), 3000)
                })
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

    const webPath = getWebContentPath()

    if (isIOS) {
        loadWebViewIOS(webView, webPath)
    } else if (isAndroid) {
        loadWebViewAndroid(webView, webPath)
    }

    // If an OTA update was installed in a previous session, show toast after load
    if (wasUpdateInstalled()) {
        setTimeout(() => showOtaToast(webView), 3000)
    }
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

    const fileUrl = NSURL.fileURLWithPath(indexPath)
    const dirUrl = NSURL.fileURLWithPath(webPath)

    wkWebView.loadFileURLAllowingReadAccessToURL(fileUrl, dirUrl)
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
