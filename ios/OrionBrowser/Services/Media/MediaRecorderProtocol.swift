/**
 * MediaRecorderProtocol.swift
 * Protocol for media recording operations
 */

import Foundation
import UIKit

struct MediaRef: Codable {
    let id: String
    let kind: String          // "audio" | "image" | "video"
    let localPath: String?
    let remoteURL: String?
}

struct RecordingResult {
    let url: URL
    let duration: TimeInterval
    let fileSize: Int64
    let mediaType: String

    init(url: URL, duration: TimeInterval = 0, fileSize: Int64 = 0, mediaType: String = "audio") {
        self.url = url
        self.duration = duration
        self.fileSize = fileSize
        self.mediaType = mediaType
    }
}

protocol MediaRecorderProtocol {
    func startAudioRecording() throws
    func stopAudioRecording() async throws -> RecordingResult?
    func captureScreenshot() async throws -> UIImage?
}
