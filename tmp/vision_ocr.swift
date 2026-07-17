import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 3 else {
    fputs("usage: vision_ocr.swift <image> <output>\n", stderr)
    exit(2)
}

let imagePath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard let image = NSImage(contentsOfFile: imagePath) else {
    fputs("cannot open image: \(imagePath)\n", stderr)
    exit(3)
}

var rect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    fputs("cannot create CGImage: \(imagePath)\n", stderr)
    exit(4)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["it-IT", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

let observations = (request.results ?? []).sorted { lhs, rhs in
    let yDiff = lhs.boundingBox.midY - rhs.boundingBox.midY
    if abs(yDiff) > 0.006 {
        return lhs.boundingBox.midY > rhs.boundingBox.midY
    }
    return lhs.boundingBox.minX < rhs.boundingBox.minX
}

let lines = observations.compactMap { observation -> String? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    return candidate.string
}

try lines.joined(separator: "\n").write(toFile: outputPath, atomically: true, encoding: .utf8)
