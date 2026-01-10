/**
 * BrowserModels.swift
 * Core browser data models
 *
 * Note: BrowserTab and HistoryEntry are defined in Models/Browser/BrowserTab.swift
 */

import Foundation

// MARK: - Bookmark
struct Bookmark: Identifiable, Codable, Equatable {
    let id: UUID
    let url: URL
    var title: String
    var folderId: UUID?
    let createdAt: Date
    var favicon: URL?

    init(url: URL, title: String, folderId: UUID? = nil) {
        self.id = UUID()
        self.url = url
        self.title = title
        self.folderId = folderId
        self.createdAt = Date()
        self.favicon = nil
    }
}

// MARK: - Download
struct Download: Identifiable, Codable, Equatable {
    let id: UUID
    let url: URL
    let filename: String
    var progress: Double
    var status: DownloadStatus
    var bytesDownloaded: Int64
    var totalBytes: Int64
    let startedAt: Date
    var completedAt: Date?

    enum DownloadStatus: String, Codable {
        case pending, downloading, paused, completed, failed
    }
}

// MARK: - Browser State
struct BrowserState: Codable {
    var tabs: [BrowserTab]
    var activeTabId: UUID?
    var isPrivateBrowsing: Bool
    var downloadsQueue: [Download]
    var bookmarks: [Bookmark]
}
