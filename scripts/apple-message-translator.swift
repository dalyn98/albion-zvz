import SwiftUI
import Translation

private struct TranslationJob: Decodable {
    let locale: String
    let jobDigest: String
    let items: [JobItem]
}

private struct JobItem: Decodable {
    let id: String
    let text: String
}

private struct TranslationResult: Codable {
    let locale: String
    let jobDigest: String
    let items: [ResultItem]
}

private struct ResultItem: Codable {
    let id: String
    let text: String
}

private struct LaunchOptions {
    let sourceLanguage: String
    let targetLanguage: String
    let inputPath: String
    let outputPath: String
    let errorPath: String

    static func parse() -> LaunchOptions {
        let arguments = Array(CommandLine.arguments.dropFirst())
        func value(after flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else {
                return nil
            }
            return arguments[index + 1]
        }

        guard
            let targetLanguage = value(after: "--target"),
            let inputPath = value(after: "--input"),
            let outputPath = value(after: "--output"),
            let errorPath = value(after: "--error")
        else {
            fatalError("Required: --target <language> --input <job.json> --output <result.json> --error <error.txt>")
        }

        return LaunchOptions(
            sourceLanguage: value(after: "--source") ?? "en",
            targetLanguage: targetLanguage,
            inputPath: inputPath,
            outputPath: outputPath,
            errorPath: errorPath
        )
    }
}

private let launchOptions = LaunchOptions.parse()

@main
struct AppleMessageTranslatorApp: App {
    @State private var configuration: TranslationSession.Configuration
    @State private var status = "Preparing translation…"
    @State private var progress = 0.0
    @State private var didStart = false

    init() {
        _configuration = State(initialValue: TranslationSession.Configuration(
            source: Locale.Language(identifier: launchOptions.sourceLanguage),
            target: Locale.Language(identifier: launchOptions.targetLanguage)
        ))
    }

    var body: some Scene {
        WindowGroup("AGM Message Translator") {
            VStack(alignment: .leading, spacing: 16) {
                Text("AlbionGuildManager")
                    .font(.headline)
                Text(status)
                    .font(.body)
                ProgressView(value: progress)
                    .frame(width: 420)
                Text("Keep this window open. Translation runs locally on this Mac.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
            .translationTask(configuration) { session in
                guard !didStart else { return }
                didStart = true
                await run(session: session)
            }
        }
        .windowResizability(.contentSize)
    }

    @MainActor
    private func run(session: TranslationSession) async {
        var stage = "reading input"
        do {
            let inputData = try Data(contentsOf: URL(fileURLWithPath: launchOptions.inputPath))
            let job = try JSONDecoder().decode(TranslationJob.self, from: inputData)
            status = "Preparing \(job.locale) language model…"
            stage = "preparing language model"
            try await session.prepareTranslation()

            let partialPath = launchOptions.outputPath + ".partial"
            var resultsByID: [String: ResultItem] = [:]
            if let partialData = try? Data(contentsOf: URL(fileURLWithPath: partialPath)),
               let partial = try? JSONDecoder().decode(TranslationResult.self, from: partialData),
               partial.locale == job.locale,
               partial.jobDigest == job.jobDigest {
                for item in partial.items {
                    resultsByID[item.id] = item
                }
            }

            let pending = job.items.filter { resultsByID[$0.id] == nil }
            let batchSize = 16
            for start in stride(from: 0, to: pending.count, by: batchSize) {
                let end = min(start + batchSize, pending.count)
                let batch = Array(pending[start..<end])
                stage = "translating batch \(start + 1)-\(end) of \(pending.count)"
                let translated = try await translateBatch(batch, session: session)
                for item in translated {
                    resultsByID[item.id] = item
                }

                let orderedPartial = job.items.compactMap { resultsByID[$0.id] }
                let partial = TranslationResult(
                    locale: job.locale,
                    jobDigest: job.jobDigest,
                    items: orderedPartial
                )
                let partialData = try JSONEncoder().encode(partial)
                try partialData.write(to: URL(fileURLWithPath: partialPath), options: .atomic)

                progress = Double(orderedPartial.count) / Double(max(job.items.count, 1))
                status = "Translating \(job.locale)… \(orderedPartial.count) / \(job.items.count)"
            }

            let results = job.items.compactMap { resultsByID[$0.id] }
            guard results.count == job.items.count else {
                throw NSError(
                    domain: "AGMTranslation",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Expected \(job.items.count) results, received \(results.count)"]
                )
            }

            let output = TranslationResult(
                locale: job.locale,
                jobDigest: job.jobDigest,
                items: results
            )
            let outputData = try JSONEncoder().encode(output)
            try outputData.write(to: URL(fileURLWithPath: launchOptions.outputPath), options: .atomic)
            try? FileManager.default.removeItem(atPath: partialPath)
            status = "Finished \(job.locale)."
            progress = 1
            try? FileManager.default.removeItem(atPath: launchOptions.errorPath)
            NSApplication.shared.terminate(nil)
        } catch {
            status = "Translation failed: \(error.localizedDescription)"
            let nsError = error as NSError
            let details = [
                "Stage: \(stage)",
                "Error: \(String(describing: error))",
                "Domain: \(nsError.domain)",
                "Code: \(nsError.code)",
                "User info: \(nsError.userInfo)",
            ].joined(separator: "\n")
            try? details.write(
                toFile: launchOptions.errorPath,
                atomically: true,
                encoding: .utf8
            )
        }
    }

    private func translateBatch(
        _ batch: [JobItem],
        session: TranslationSession
    ) async throws -> [ResultItem] {
        let requests = batch.map {
            TranslationSession.Request(sourceText: $0.text, clientIdentifier: $0.id)
        }

        do {
            let responses = try await session.translations(from: requests)
            let results = responses.compactMap { response -> ResultItem? in
                guard let identifier = response.clientIdentifier else { return nil }
                return ResultItem(id: identifier, text: response.targetText)
            }
            if results.count == batch.count { return results }
        } catch {
            // A malformed or unusually long string can fail an entire batch. Retry each
            // request separately so successful work remains checkpointed and the error
            // identifies the smallest possible unit.
        }

        var results: [ResultItem] = []
        for item in batch {
            var lastError: Error?
            for attempt in 1...3 {
                do {
                    let request = TranslationSession.Request(
                        sourceText: item.text,
                        clientIdentifier: item.id
                    )
                    let responses = try await session.translations(from: [request])
                    if let response = responses.first {
                        results.append(ResultItem(id: item.id, text: response.targetText))
                        lastError = nil
                        break
                    }
                } catch {
                    lastError = error
                    if attempt < 3 {
                        try? await Task.sleep(for: .milliseconds(500 * attempt))
                    }
                }
            }
            if let lastError { throw lastError }
        }
        return results
    }
}
