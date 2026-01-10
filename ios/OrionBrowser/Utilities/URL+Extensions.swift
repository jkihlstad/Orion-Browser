/**
 * URL+Extensions.swift
 * URL utilities
 */

import Foundation

extension URL {
    // MARK: - Display Properties
    /// Domain without www prefix
    var cleanDomain: String {
        host?.replacingOccurrences(of: "www.", with: "") ?? ""
    }

    /// Display URL without protocol
    var displayString: String {
        absoluteString
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /// Shortened display (domain only)
    var shortDisplayString: String {
        cleanDomain
    }

    // MARK: - URL Analysis
    /// Check if URL is secure (HTTPS)
    var isSecure: Bool {
        scheme == "https"
    }

    /// Check if URL is a search query
    var isSearchQuery: Bool {
        guard let host = host else { return false }
        let searchDomains = ["google.com", "bing.com", "duckduckgo.com", "yahoo.com", "ecosia.org"]
        return searchDomains.contains(where: { host.contains($0) }) && absoluteString.contains("?")
    }

    /// Check if URL is a data URL
    var isDataURL: Bool {
        scheme == "data"
    }

    /// Check if URL is a file URL
    var isFileURL: Bool {
        scheme == "file"
    }

    /// Check if URL is a special browser URL
    var isSpecialURL: Bool {
        ["about", "javascript", "data", "blob"].contains(scheme ?? "")
    }

    // MARK: - Search Query Extraction
    /// Extract search query from URL
    var searchQuery: String? {
        guard let components = URLComponents(url: self, resolvingAgainstBaseURL: true),
              let queryItems = components.queryItems else { return nil }

        // Common query parameter names
        let queryParams = ["q", "query", "search", "s", "text"]

        for param in queryParams {
            if let value = queryItems.first(where: { $0.name == param })?.value {
                return value
            }
        }

        return nil
    }

    // MARK: - Query Parameters
    /// Get query parameters as dictionary
    var queryParameters: [String: String]? {
        guard let components = URLComponents(url: self, resolvingAgainstBaseURL: true),
              let queryItems = components.queryItems else { return nil }

        return queryItems.reduce(into: [String: String]()) { result, item in
            result[item.name] = item.value
        }
    }

    /// Create URL with added query parameter
    func addingQueryParameter(name: String, value: String) -> URL? {
        var components = URLComponents(url: self, resolvingAgainstBaseURL: true)
        var queryItems = components?.queryItems ?? []
        queryItems.append(URLQueryItem(name: name, value: value))
        components?.queryItems = queryItems
        return components?.url
    }

    /// Create URL with removed query parameter
    func removingQueryParameter(name: String) -> URL? {
        var components = URLComponents(url: self, resolvingAgainstBaseURL: true)
        components?.queryItems?.removeAll { $0.name == name }
        return components?.url
    }

    // MARK: - Favicon
    /// Favicon URL for this domain
    var faviconURL: URL? {
        guard let scheme = scheme, let host = host else { return nil }
        return URL(string: "\(scheme)://\(host)/favicon.ico")
    }

    /// Google Favicon service URL
    var googleFaviconURL: URL? {
        guard let host = host else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=64")
    }

    // MARK: - Path Analysis
    /// File extension from path
    var fileExtension: String? {
        let ext = pathExtension
        return ext.isEmpty ? nil : ext.lowercased()
    }

    /// Check if URL points to an image
    var isImageURL: Bool {
        let imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "ico"]
        guard let ext = fileExtension else { return false }
        return imageExtensions.contains(ext)
    }

    /// Check if URL points to a video
    var isVideoURL: Bool {
        let videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"]
        guard let ext = fileExtension else { return false }
        return videoExtensions.contains(ext)
    }

    /// Check if URL points to a document
    var isDocumentURL: Bool {
        let docExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]
        guard let ext = fileExtension else { return false }
        return docExtensions.contains(ext)
    }

    // MARK: - URL Creation
    /// Create URL from string, handling common issues
    static func from(_ string: String) -> URL? {
        var urlString = string.trimmingCharacters(in: .whitespacesAndNewlines)

        // Add scheme if missing
        if !urlString.contains("://") {
            if urlString.contains(".") && !urlString.contains(" ") {
                urlString = "https://\(urlString)"
            } else {
                // Treat as search query
                let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? urlString
                urlString = "https://www.google.com/search?q=\(encoded)"
            }
        }

        return URL(string: urlString)
    }

    /// Create search URL for query
    static func searchURL(for query: String, engine: SearchEngine = .google) -> URL? {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return URL(string: "\(engine.searchURL)\(encoded)")
    }
}
