import XCTest

enum E2EHost {
    enum Action: String {
        case pasteFixture, pasteRotation, pasteInvalid, matchFaceID
        case verifyFixture, verifyRotation
    }

    private struct Request: Encodable {
        let id: String
        let action: String
    }

    private struct Response: Decodable {
        let id: String
        let success: Bool
    }

    static func tapPaste(in app: XCUIApplication) {
        let button = app.buttons["key.paste"].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        XCTAssertTrue(button.isHittable)
        let frame = button.frame
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        // The app waits synchronously for the system's paste-permission dialog.
        springboard.coordinate(withNormalizedOffset: .zero)
            .withOffset(.init(dx: frame.midX, dy: frame.midY)).tap()
        let permission = springboard.buttons["Allow Paste"].firstMatch
        if permission.waitForExistence(timeout: 3) { permission.tap() }
    }

    static func perform(_ action: Action, file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KeyShieldE2EHost", isDirectory: true)
        let id = UUID().uuidString
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let request = try JSONEncoder().encode(Request(id: id, action: action.rawValue))
            try request.write(to: directory.appendingPathComponent("request.json"), options: .atomic)
        } catch {
            XCTFail("Could not request host action: \(action.rawValue)", file: file, line: line)
            return false
        }
        var response: Response?
        let replied = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard let data = try? Data(contentsOf: directory.appendingPathComponent("response.json")),
                  let decoded = try? JSONDecoder().decode(Response.self, from: data), decoded.id == id else { return false }
            response = decoded
            return true
        }, object: nil)
        let completed = XCTWaiter.wait(for: [replied], timeout: 20) == .completed
        XCTAssertTrue(completed, "Run through scripts/run-e2e-journey.py; host action timed out: \(action.rawValue)", file: file, line: line)
        return completed && response?.success == true
    }
}
