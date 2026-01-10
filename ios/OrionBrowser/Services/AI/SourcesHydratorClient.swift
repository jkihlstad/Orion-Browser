/**
 * SourcesHydratorClient.swift
 * Fetches and hydrates citation sources with metadata
 */

import Foundation

actor SourcesHydratorClient {
    // MARK: - Singleton
    static let shared = SourcesHydratorClient()

    // MARK: - Properties
    private var cache: [String: HydratedSource] = [:]
    private let session: URLSession

    // MARK: - Initialization
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        self.session = URLSession(configuration: config)
    }

    // MARK: - Hydrate Citations
    func hydrateCitations(_ citations: [Citation]) async -> [HydratedSource] {
        await withTaskGroup(of: HydratedSource?.self) { group in
            for citation in citations {
                group.addTask {
                    await self.hydrateSource(citation)
                }
            }

            var results: [HydratedSource] = []
            for await result in group {
                if let source = result {
                    results.append(source)
                }
            }
            return results.sorted { $0.relevanceScore > $1.relevanceScore }
        }
    }

    // MARK: - Hydrate Single Source
    func hydrateSource(_ citation: Citation) async -> HydratedSource? {
        // Check cache
        if let cached = cache[citation.url] {
            return cached
        }

        // Fetch metadata
        do {
            let metadata = try await fetchMetadata(for: citation.url)

            let hydrated = HydratedSource(
                citation: citation,
                favicon: metadata.favicon,
                siteName: metadata.siteName,
                publishDate: metadata.publishDate,
                author: metadata.author,
                imageURL: metadata.imageURL,
                readingTime: metadata.readingTime
            )

            cache[citation.url] = hydrated
            return hydrated
        } catch {
            // Return basic hydrated source without extra metadata
            return HydratedSource(
                citation: citation,
                favicon: nil,
                siteName: nil,
                publishDate: nil,
                author: nil,
                imageURL: nil,
                readingTime: nil
            )
        }
    }

    // MARK: - Fetch Metadata
    private func fetchMetadata(for urlString: String) async throws -> SourceMetadata {
        guard let url = URL(string: urlString) else {
            throw SourcesError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw SourcesError.fetchFailed
        }

        // Extract metadata from headers or fetch full page
        let favicon = URL(string: "\(url.scheme ?? "https")://\(url.host ?? "")/favicon.ico")

        return SourceMetadata(
            favicon: favicon,
            siteName: url.host,
            publishDate: nil,
            author: nil,
            imageURL: nil,
            readingTime: nil
        )
    }

    // MARK: - Clear Cache
    func clearCache() {
        cache.removeAll()
    }
}

// MARK: - Hydrated Source
struct HydratedSource: Identifiable {
    let id: UUID
    let citation: Citation
    let favicon: URL?
    let siteName: String?
    let publishDate: Date?
    let author: String?
    let imageURL: URL?
    let readingTime: Int? // minutes

    var relevanceScore: Double { citation.relevanceScore }

    init(
        citation: Citation,
        favicon: URL?,
        siteName: String?,
        publishDate: Date?,
        author: String?,
        imageURL: URL?,
        readingTime: Int?
    ) {
        self.id = citation.id
        self.citation = citation
        self.favicon = favicon
        self.siteName = siteName
        self.publishDate = publishDate
        self.author = author
        self.imageURL = imageURL
        self.readingTime = readingTime
    }
}

// MARK: - Source Metadata
struct SourceMetadata {
    let favicon: URL?
    let siteName: String?
    let publishDate: Date?
    let author: String?
    let imageURL: URL?
    let readingTime: Int?
}

// MARK: - Errors
enum SourcesError: LocalizedError {
    case invalidURL
    case fetchFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid source URL"
        case .fetchFailed: return "Failed to fetch source metadata"
        }
    }
}
