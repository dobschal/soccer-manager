import {EventData, isAndroid, isIOS, knownFolders, Page, path, WebView} from '@nativescript/core'

declare const NSURL: any

export function onPageLoaded(args: EventData) {
    const page = args.object as Page
    page.backgroundColor = '#222222'
}

export function onWebViewLoaded(args: EventData) {
    const webView = args.object as WebView

    if (isIOS) {
        loadWebViewIOS(webView)
    } else if (isAndroid) {
        loadWebViewAndroid(webView)
    }
}

function loadWebViewIOS(webView: WebView) {
    const wkWebView = webView.ios as any
    const appPath = knownFolders.currentApp().path
    const webPath = path.join(appPath, 'web')
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

function loadWebViewAndroid(webView: WebView) {
    const nativeWebView = webView.android as any
    const settings = nativeWebView.getSettings()

    settings.setJavaScriptEnabled(true)
    settings.setDomStorageEnabled(true)
    settings.setAllowFileAccess(true)
    settings.setAllowFileAccessFromFileURLs(true)
    settings.setAllowUniversalAccessFromFileURLs(true)

    nativeWebView.loadUrl('file:///android_asset/app/web/index.html')
}
