/**
 * DateFormatter+Extensions.swift
 * Date formatting utilities
 */

import Foundation

extension DateFormatter {
    // MARK: - Shared Formatters
    static let iso8601Full: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let shortDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        return formatter
    }()

    static let mediumDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    static let longDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()

    static let shortTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()

    static let mediumDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}

// MARK: - Date Extensions
extension Date {
    /// Format as short date (e.g., "1/15/24")
    var shortDateString: String {
        DateFormatter.shortDate.string(from: self)
    }

    /// Format as medium date (e.g., "Jan 15, 2024")
    var mediumDateString: String {
        DateFormatter.mediumDate.string(from: self)
    }

    /// Format as long date (e.g., "January 15, 2024")
    var longDateString: String {
        DateFormatter.longDate.string(from: self)
    }

    /// Format as short time (e.g., "3:30 PM")
    var shortTimeString: String {
        DateFormatter.shortTime.string(from: self)
    }

    /// Format as medium date and time
    var mediumDateTimeString: String {
        DateFormatter.mediumDateTime.string(from: self)
    }

    /// Format as relative time (e.g., "2 hours ago")
    var relativeString: String {
        DateFormatter.relative.localizedString(for: self, relativeTo: Date())
    }

    /// Format as ISO 8601
    var iso8601String: String {
        DateFormatter.iso8601Full.string(from: self)
    }

    /// Smart format based on how recent the date is
    var smartString: String {
        let calendar = Calendar.current

        if calendar.isDateInToday(self) {
            return "Today at \(shortTimeString)"
        } else if calendar.isDateInYesterday(self) {
            return "Yesterday at \(shortTimeString)"
        } else if calendar.isDate(self, equalTo: Date(), toGranularity: .weekOfYear) {
            let weekday = calendar.component(.weekday, from: self)
            let weekdayName = calendar.weekdaySymbols[weekday - 1]
            return "\(weekdayName) at \(shortTimeString)"
        } else if calendar.isDate(self, equalTo: Date(), toGranularity: .year) {
            return mediumDateString
        } else {
            return longDateString
        }
    }

    /// Time ago in words
    var timeAgoString: String {
        let interval = Date().timeIntervalSince(self)

        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else if interval < 604800 {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        } else {
            return mediumDateString
        }
    }
}

// MARK: - TimeInterval Extensions
extension TimeInterval {
    /// Format as duration (e.g., "2h 30m")
    var durationString: String {
        let hours = Int(self) / 3600
        let minutes = (Int(self) % 3600) / 60
        let seconds = Int(self) % 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        } else {
            return "\(seconds)s"
        }
    }

    /// Format as reading time
    var readingTimeString: String {
        let minutes = Int(self / 60)
        if minutes < 1 {
            return "< 1 min read"
        } else if minutes == 1 {
            return "1 min read"
        } else {
            return "\(minutes) min read"
        }
    }
}
