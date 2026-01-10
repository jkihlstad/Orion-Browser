/**
 * WebViewContainer.swift
 * WKWebView wrapper for SwiftUI
 */

import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let tab: BrowserTab
    let onNavigationChange: (WebViewNavigationState) -> Void
    let onPageContentLoaded: (String, PageMetadata) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // Enable content blockers if available
        configuration.preferences.isFraudulentWebsiteWarningEnabled = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        // Custom user agent
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OrionBrowser/1.0 Mobile/15E148 Safari/604.1"

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != tab.url {
            webView.load(URLRequest(url: tab.url))
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: WebViewContainer

        init(_ parent: WebViewContainer) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            updateNavigationState(webView, isLoading: true)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            updateNavigationState(webView, isLoading: false)
            extractPageContent(webView)
            captureScreenshot(webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            updateNavigationState(webView, isLoading: false)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            updateNavigationState(webView, isLoading: false)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            // Handle special URL schemes
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if url.scheme == "tel" || url.scheme == "mailto" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        private func updateNavigationState(_ webView: WKWebView, isLoading: Bool) {
            let state = WebViewNavigationState(
                url: webView.url ?? parent.tab.url,
                title: webView.title ?? "",
                canGoBack: webView.canGoBack,
                canGoForward: webView.canGoForward,
                isLoading: isLoading
            )
            parent.onNavigationChange(state)
        }

        private func extractPageContent(_ webView: WKWebView) {
            let script = """
            (function() {
                return {
                    content: document.body.innerText.substring(0, 10000),
                    title: document.title,
                    description: document.querySelector('meta[name="description"]')?.content || '',
                    url: window.location.href,
                    keywords: document.querySelector('meta[name="keywords"]')?.content || '',
                    author: document.querySelector('meta[name="author"]')?.content || ''
                };
            })();
            """

            webView.evaluateJavaScript(script) { [weak self] result, error in
                guard let self = self,
                      let dict = result as? [String: Any],
                      let content = dict["content"] as? String else { return }

                let metadata = PageMetadata(
                    title: dict["title"] as? String ?? "",
                    description: dict["description"] as? String ?? "",
                    url: dict["url"] as? String ?? "",
                    keywords: dict["keywords"] as? String ?? "",
                    author: dict["author"] as? String ?? ""
                )

                self.parent.onPageContentLoaded(content, metadata)
            }
        }

        private func captureScreenshot(_ webView: WKWebView) {
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: webView.bounds.width, height: 300)

            webView.takeSnapshot(with: config) { image, error in
                guard let image = image else { return }

                // Store screenshot (would update tab state)
                let _ = image.jpegData(compressionQuality: 0.5)
            }
        }
    }
}

// MARK: - Navigation State
struct WebViewNavigationState {
    let url: URL
    let title: String
    let canGoBack: Bool
    let canGoForward: Bool
    let isLoading: Bool
}

// MARK: - Page Metadata
struct PageMetadata {
    let title: String
    let description: String
    let url: String
    let keywords: String
    let author: String
}
