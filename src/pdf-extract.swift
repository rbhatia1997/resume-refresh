import Foundation
import PDFKit

let arguments = CommandLine.arguments
guard arguments.count > 1 else {
    fputs("Missing PDF path\n", stderr)
    exit(1)
}

let filePath = arguments[1]
let url = URL(fileURLWithPath: filePath)

guard let document = PDFDocument(url: url) else {
    fputs("Unable to open PDF\n", stderr)
    exit(1)
}

var pages: [String] = []
for index in 0..<document.pageCount {
    if let page = document.page(at: index), let text = page.string {
        pages.append(text)
    }
}

print(pages.joined(separator: "\n\n"))
