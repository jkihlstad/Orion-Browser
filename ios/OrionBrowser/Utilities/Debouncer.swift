/**
 * Debouncer.swift
 * Debounce and throttle utilities
 */

import Foundation
import Combine

// MARK: - Debouncer
final class Debouncer {
    private let delay: TimeInterval
    private var workItem: DispatchWorkItem?
    private let queue: DispatchQueue

    init(delay: TimeInterval, queue: DispatchQueue = .main) {
        self.delay = delay
        self.queue = queue
    }

    func debounce(action: @escaping () -> Void) {
        workItem?.cancel()
        workItem = DispatchWorkItem(block: action)

        if let workItem = workItem {
            queue.asyncAfter(deadline: .now() + delay, execute: workItem)
        }
    }

    func cancel() {
        workItem?.cancel()
    }
}

// MARK: - Async Debouncer
actor AsyncDebouncer {
    private let delay: TimeInterval
    private var task: Task<Void, Never>?

    init(delay: TimeInterval) {
        self.delay = delay
    }

    func debounce(action: @escaping () async -> Void) {
        task?.cancel()
        task = Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await action()
        }
    }

    func cancel() {
        task?.cancel()
    }
}

// MARK: - Throttler
final class Throttler {
    private let interval: TimeInterval
    private var lastExecutionTime: Date?
    private let queue: DispatchQueue
    private var pendingWorkItem: DispatchWorkItem?

    init(interval: TimeInterval, queue: DispatchQueue = .main) {
        self.interval = interval
        self.queue = queue
    }

    func throttle(action: @escaping () -> Void) {
        let now = Date()

        if let lastTime = lastExecutionTime {
            let elapsed = now.timeIntervalSince(lastTime)

            if elapsed >= interval {
                // Execute immediately
                lastExecutionTime = now
                queue.async(execute: action)
            } else {
                // Schedule for later
                pendingWorkItem?.cancel()
                let remaining = interval - elapsed
                pendingWorkItem = DispatchWorkItem { [weak self] in
                    self?.lastExecutionTime = Date()
                    action()
                }

                if let workItem = pendingWorkItem {
                    queue.asyncAfter(deadline: .now() + remaining, execute: workItem)
                }
            }
        } else {
            // First execution
            lastExecutionTime = now
            queue.async(execute: action)
        }
    }

    func cancel() {
        pendingWorkItem?.cancel()
    }
}

// MARK: - Publisher Extension
extension Publisher {
    /// Debounce with custom scheduler
    func debounce<S: Scheduler>(
        for dueTime: S.SchedulerTimeType.Stride,
        scheduler: S
    ) -> AnyPublisher<Output, Failure> {
        self.debounce(for: dueTime, scheduler: scheduler)
            .eraseToAnyPublisher()
    }
}

// MARK: - Convenience Functions
func debounced<T>(_ delay: TimeInterval, action: @escaping (T) -> Void) -> (T) -> Void {
    var workItem: DispatchWorkItem?

    return { value in
        workItem?.cancel()
        workItem = DispatchWorkItem {
            action(value)
        }

        if let workItem = workItem {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
        }
    }
}

func throttled<T>(_ interval: TimeInterval, action: @escaping (T) -> Void) -> (T) -> Void {
    var lastTime: Date?

    return { value in
        let now = Date()

        if let last = lastTime, now.timeIntervalSince(last) < interval {
            return
        }

        lastTime = now
        action(value)
    }
}

// MARK: - Leading/Trailing Debouncer
final class EdgeDebouncer {
    enum Edge {
        case leading
        case trailing
        case both
    }

    private let delay: TimeInterval
    private let edge: Edge
    private var lastExecutionTime: Date?
    private var workItem: DispatchWorkItem?
    private let queue: DispatchQueue

    init(delay: TimeInterval, edge: Edge = .trailing, queue: DispatchQueue = .main) {
        self.delay = delay
        self.edge = edge
        self.queue = queue
    }

    func debounce(action: @escaping () -> Void) {
        let now = Date()
        let shouldExecuteLeading = (edge == .leading || edge == .both) &&
            (lastExecutionTime == nil || now.timeIntervalSince(lastExecutionTime!) >= delay)

        workItem?.cancel()

        if shouldExecuteLeading {
            lastExecutionTime = now
            queue.async(execute: action)
        }

        if edge == .trailing || edge == .both {
            workItem = DispatchWorkItem { [weak self] in
                self?.lastExecutionTime = Date()
                action()
            }

            if let workItem = workItem {
                queue.asyncAfter(deadline: .now() + delay, execute: workItem)
            }
        }
    }
}
