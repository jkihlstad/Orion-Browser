/**
 * FollowUpQuestionsView.swift
 * Suggested follow-up questions for AI answers
 */

import SwiftUI

struct FollowUpQuestionsView: View {
    let questions: [FollowUp]
    let onSelect: (FollowUp) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "questionmark.bubble")
                    .foregroundColor(.orionTextSecondary)
                Text("Related questions")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.orionTextSecondary)
            }

            VStack(spacing: 8) {
                ForEach(questions) { question in
                    FollowUpButton(question: question, onSelect: onSelect)
                }
            }
        }
    }
}

// MARK: - Follow Up Button
struct FollowUpButton: View {
    let question: FollowUp
    let onSelect: (FollowUp) -> Void
    @State private var isPressed = false

    var body: some View {
        Button {
            onSelect(question)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: questionIcon)
                    .font(.system(size: 14))
                    .foregroundColor(.orionAccent)
                    .frame(width: 24)

                Text(question.text)
                    .font(.subheadline)
                    .foregroundColor(.orionText)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "arrow.right")
                    .font(.caption)
                    .foregroundColor(.orionTextTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orionSurface)
                    .stroke(Color.orionBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .animation(.spring(response: 0.2), value: isPressed)
    }

    private var questionIcon: String {
        switch question.type {
        case .deepDive:
            return "arrow.down.right.circle"
        case .comparison:
            return "arrow.left.arrow.right"
        case .example:
            return "doc.text"
        case .clarification:
            return "questionmark.circle"
        case .related:
            return "link"
        }
    }
}

// MARK: - Preview
#Preview {
    FollowUpQuestionsView(
        questions: [
            FollowUp(
                id: UUID(),
                text: "How does SwiftUI compare to UIKit?",
                type: .comparison
            ),
            FollowUp(
                id: UUID(),
                text: "Can you show me an example?",
                type: .example
            ),
            FollowUp(
                id: UUID(),
                text: "What are the performance implications?",
                type: .deepDive
            )
        ],
        onSelect: { _ in }
    )
    .padding()
}
