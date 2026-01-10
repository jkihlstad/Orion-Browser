/**
 * PageMetadata.swift
 * Metadata extracted from web pages
 */

import Foundation

// Note: PageMetadata struct is already defined in WebViewContainer.swift
// This file contains extended metadata models

// MARK: - Extended Page Metadata
struct ExtendedPageMetadata: Codable {
    let url: String
    let title: String
    let description: String
    let keywords: [String]
    let author: String?
    let publishDate: Date?
    let modifiedDate: Date?
    let language: String?
    let charset: String?

    // Open Graph
    let ogTitle: String?
    let ogDescription: String?
    let ogImage: URL?
    let ogType: String?
    let ogSiteName: String?

    // Twitter Card
    let twitterTitle: String?
    let twitterDescription: String?
    let twitterImage: URL?
    let twitterCard: String?

    // Content Analysis
    let wordCount: Int
    let readingTime: Int // minutes
    let hasVideo: Bool
    let hasAudio: Bool
    let links: [PageLink]
    let headings: [PageHeading]

    // MARK: - Initialization
    init(
        url: String,
        title: String,
        description: String = "",
        keywords: [String] = [],
        author: String? = nil,
        publishDate: Date? = nil,
        modifiedDate: Date? = nil,
        language: String? = nil,
        charset: String? = nil,
        ogTitle: String? = nil,
        ogDescription: String? = nil,
        ogImage: URL? = nil,
        ogType: String? = nil,
        ogSiteName: String? = nil,
        twitterTitle: String? = nil,
        twitterDescription: String? = nil,
        twitterImage: URL? = nil,
        twitterCard: String? = nil,
        wordCount: Int = 0,
        readingTime: Int = 0,
        hasVideo: Bool = false,
        hasAudio: Bool = false,
        links: [PageLink] = [],
        headings: [PageHeading] = []
    ) {
        self.url = url
        self.title = title
        self.description = description
        self.keywords = keywords
        self.author = author
        self.publishDate = publishDate
        self.modifiedDate = modifiedDate
        self.language = language
        self.charset = charset
        self.ogTitle = ogTitle
        self.ogDescription = ogDescription
        self.ogImage = ogImage
        self.ogType = ogType
        self.ogSiteName = ogSiteName
        self.twitterTitle = twitterTitle
        self.twitterDescription = twitterDescription
        self.twitterImage = twitterImage
        self.twitterCard = twitterCard
        self.wordCount = wordCount
        self.readingTime = readingTime
        self.hasVideo = hasVideo
        self.hasAudio = hasAudio
        self.links = links
        self.headings = headings
    }

    // MARK: - Computed Properties
    var displayTitle: String {
        ogTitle ?? title
    }

    var displayDescription: String {
        ogDescription ?? twitterDescription ?? description
    }

    var displayImage: URL? {
        ogImage ?? twitterImage
    }

    var isArticle: Bool {
        ogType == "article" || readingTime > 2
    }
}

// MARK: - Page Link
struct PageLink: Codable {
    let href: String
    let text: String
    let isExternal: Bool
    let rel: String?

    var url: URL? {
        URL(string: href)
    }

    var domain: String? {
        url?.host
    }
}

// MARK: - Page Heading
struct PageHeading: Codable {
    let level: Int // 1-6
    let text: String

    var tag: String {
        "h\(level)"
    }
}

// MARK: - Content Summary
struct ContentSummary: Codable {
    let url: String
    let title: String
    let summary: String
    let keyPoints: [String]
    let topics: [String]
    let sentiment: Sentiment?
    let complexity: Complexity
    let generatedAt: Date

    enum Sentiment: String, Codable {
        case positive, negative, neutral, mixed
    }

    enum Complexity: String, Codable {
        case simple, moderate, complex

        var description: String {
            switch self {
            case .simple: return "Easy to read"
            case .moderate: return "Moderate complexity"
            case .complex: return "Complex content"
            }
        }
    }
}

// MARK: - Metadata Extraction Script
struct MetadataExtractionScript {
    static let script = """
    (function() {
        function getMeta(name) {
            const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
            return el ? el.content : null;
        }

        function getHeadings() {
            const headings = [];
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                headings.push({
                    level: parseInt(h.tagName[1]),
                    text: h.innerText.substring(0, 100)
                });
            });
            return headings.slice(0, 20);
        }

        function getLinks() {
            const links = [];
            const baseHost = window.location.host;
            document.querySelectorAll('a[href]').forEach(a => {
                try {
                    const url = new URL(a.href);
                    links.push({
                        href: a.href,
                        text: a.innerText.substring(0, 100),
                        isExternal: url.host !== baseHost,
                        rel: a.rel || null
                    });
                } catch {}
            });
            return links.slice(0, 50);
        }

        return {
            url: window.location.href,
            title: document.title,
            description: getMeta('description') || '',
            keywords: (getMeta('keywords') || '').split(',').map(k => k.trim()).filter(k => k),
            author: getMeta('author'),
            language: document.documentElement.lang || null,
            ogTitle: getMeta('og:title'),
            ogDescription: getMeta('og:description'),
            ogImage: getMeta('og:image'),
            ogType: getMeta('og:type'),
            ogSiteName: getMeta('og:site_name'),
            twitterTitle: getMeta('twitter:title'),
            twitterDescription: getMeta('twitter:description'),
            twitterImage: getMeta('twitter:image'),
            twitterCard: getMeta('twitter:card'),
            wordCount: document.body.innerText.split(/\\s+/).length,
            hasVideo: document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0,
            hasAudio: document.querySelectorAll('audio').length > 0,
            headings: getHeadings(),
            links: getLinks()
        };
    })();
    """
}
