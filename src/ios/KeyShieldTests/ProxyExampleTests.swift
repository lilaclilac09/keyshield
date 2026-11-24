import XCTest
@testable import KeyShield

final class ProxyExampleTests: XCTestCase {
    func testEveryExampleUsesOnlyTheAgentPlaceholderWithTheReferenceProxy() throws {
        let bearer = try NSRegularExpression(pattern: #"Bearer ([^"\s]+)"#)
        let url = try NSRegularExpression(pattern: #"https?://[^"\s]+"#)
        for example in ProxyExample.allCases {
            let source = example.source
            let range = NSRange(source.startIndex..., in: source)
            let tokens = bearer.matches(in: source, range: range).compactMap {
                Range($0.range(at: 1), in: source).map { String(source[$0]) }
            }
            XCTAssertEqual(tokens, ["<YOUR_AGENT_TOKEN>"], example.rawValue)

            let endpoints = url.matches(in: source, range: range).compactMap {
                Range($0.range, in: source).map { String(source[$0]) }
            }
            XCTAssertEqual(endpoints.count, 1, example.rawValue)
            for endpoint in endpoints {
                XCTAssertTrue(endpoint.hasPrefix("https://keyshield.example/vproxy/"), example.rawValue)
            }
            for forbidden in ["/manage/", "/sessions/", "/agents/", "X-Upstream-API-Key", "ks_sess_", "ksv2_", "sk-proj-", "sk-or-v1-"] {
                XCTAssertFalse(source.localizedCaseInsensitiveContains(forbidden), example.rawValue)
            }
        }
    }
}
