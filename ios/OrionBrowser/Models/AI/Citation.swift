/**
 * Citation.swift
 * Source citation for AI answers
 */

import Foundation

struct Citation: Identifiable, Codable, Equatable {
    let id: UUID
    let url: String
    let title: String
    let snippet: String
    let domain: String
    let relevanceScore: Double

    // MARK: - Optional Metadata
    var favicon: URL?
    var publishDate: Date?
    var author: String?

    // MARK: - Computed Properties
    var displayURL: String {
        url.replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    var isHighRelevance: Bool {
        relevanceScore >= 0.8
    }

    var relevanceLabel: String {
        switch relevanceScore {
        case 0.8...: return "High"
        case 0.5..<0.8: return "Medium"
        default: return "Low"
        }
    }

    // MARK: - Initialization
    init(
        id: UUID = UUID(),
        url: String,
        title: String,
        snippet: String,
        domain: String,
        relevanceScore: Double,
        favicon: URL? = nil,
        publishDate: Date? = nil,
        author: String? = nil
    ) {
        self.id = id
        self.url = url
        self.title = title
        self.snippet = snippet
        self.domain = domain
        self.relevanceScore = min(1.0, max(0.0, relevanceScore))
        self.favicon = favicon
        self.publishDate = publishDate
        self.author = author
    }

    // MARK: - Coding Keys
    enum CodingKeys: String, CodingKey {
        case id, url, title, snippet, domain, relevanceScore, favicon, publishDate, author
    }
}

// MARK: - Citation Group
struct CitationGroup: Identifiable {
    let id = UUID()
    let domain: String
    let citations: [Citation]

    var averageRelevance: Double {
        guard !citations.isEmpty else { return 0 }
        return citations.map(\.relevanceScore).reduce(0, +) / Double(citations.count)
    }
}

// MARK: - Citation Extensions
extension [Citation] {
    /// Group citations by domain
    var groupedByDomain: [CitationGroup] {
        let grouped = Dictionary(grouping: self, by: \.domain)
        return grouped.map { CitationGroup(domain: $0.key, citations: $0.value) }
            .sorted { $0.averageRelevance > $1.averageRelevance }
    }

    /// Top citations by relevance
    func top(_ count: Int) -> [Citation] {
        Array(sorted { $0.relevanceScore > $1.relevanceScore }.prefix(count))
    }

    /// Filter by minimum relevance
    func filtered(minRelevance: Double) -> [Citation] {
        filter { $0.relevanceScore >= minRelevance }
    }
}
