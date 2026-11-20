import XCTest

#if SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)
final class KeyShieldE2EJourneyTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "xyz.aileena.keyshield.ios")
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    private let label = "E2E synthetic OpenAI"
    private var entry: XCUIElement { app.buttons["vault.entry." + label] }
    private var secret: XCUIElement { app.staticTexts["detail.secret"] }

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCTAssertTrue(UserDefaults.standard.bool(forKey: "DisableDiagnosticScreenshots"))
        XCTAssertTrue(UserDefaults.standard.bool(forKey: "DisableDiagnosticScreenRecordings"))
        XCTAssertTrue(app.launchArguments.isEmpty)
        app.launch()
    }

    override func tearDownWithError() throws { app.terminate() }

    private func tap(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        let button = app.buttons[id].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 8), "Missing control: " + id, file: file, line: line)
        for _ in 0..<4 {
            if button.isHittable { break }
            app.swipeUp()
        }
        button.tap()
    }

    private func tab(_ name: String) { app.tabBars.buttons[name].tap() }
    private func back() { app.navigationBars.buttons.element(boundBy: 0).tap() }

    private func matchFaceID(awaiting element: XCUIElement) {
        let permission = springboard.alerts.buttons["OK"]
        if permission.waitForExistence(timeout: 2) { permission.tap() }
        let prompt = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.springboard.staticTexts["Face ID"].firstMatch.exists || self.app.staticTexts["Face ID"].firstMatch.exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [prompt], timeout: 8), .completed, "A fresh OS Face ID prompt is required")
        XCTAssertFalse(element.exists, "Operation completed before the matching-face event")
        XCTAssertTrue(E2EHost.perform(.matchFaceID))
        XCTAssertTrue(element.waitForExistence(timeout: 10))
    }

    private func unlock() {
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.tabBars.buttons["Vault"].exists)
        XCTAssertFalse(secret.exists)
        tap("lock.unlock")
        matchFaceID(awaiting: app.tabBars.buttons["Home"])
    }

    private func paste(_ action: E2EHost.Action) {
        XCTAssertTrue(E2EHost.perform(action))
        E2EHost.tapPaste(in: app)
        XCTAssertEqual(app.staticTexts["key.detection"].label, "Format detected: openai")
        XCTAssertTrue(app.buttons["key.save"].isEnabled)
    }

    func testNewUserJourneyWithSyntheticFixturesAndSimulatedFaceID() {
        print("E2E: synthetic fixtures; simulated OS Face ID; opt-in in-process agent demo; no physical-device claim")
        tap("onboarding.create"); tap("onboarding.confirm")
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 8))
        tab("Vault")
        XCTAssertTrue(app.staticTexts["Your vault is empty"].exists)
        tap("vault.add")
        let name = app.textFields["key.label"]
        name.tap(); name.typeText(label)
        if app.buttons["keyboard.done"].exists { tap("keyboard.done") }
        XCTAssertFalse(app.buttons["key.save"].isEnabled)
        XCTAssertTrue(E2EHost.perform(.pasteFixture))
        XCTAssertFalse(app.buttons["key.save"].isEnabled, "Pasteboard import must be explicit")
        E2EHost.tapPaste(in: app)
        XCTAssertEqual(app.staticTexts["key.detection"].label, "Format detected: openai")
        XCTAssertTrue(app.buttons["key.save"].isEnabled)
        tap("key.save")
        XCTAssertTrue(entry.waitForExistence(timeout: 8))
        print("E2E_ONBOARDING_EXPLICIT_PASTE_SAVE=PASS")

        tap("session.lock")
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 8))
        app.terminate(); app.launch(); unlock()
        tab("Vault"); entry.tap()
        XCTAssertFalse(secret.exists)
        tap("detail.copy")
        XCTAssertFalse(app.staticTexts["detail.clipboard"].exists)
        tap("approval.biometric")
        matchFaceID(awaiting: app.staticTexts["detail.clipboard"])
        XCTAssertTrue(E2EHost.perform(.verifyFixture), "Approved Copy must match the synthetic fixture hash")
        print("E2E_RELAUNCH_FACE_ID_AND_APPROVED_COPY=PASS")

        tap("detail.reveal")
        XCTAssertFalse(secret.exists)
        tap("approval.biometric")
        matchFaceID(awaiting: secret)
        XCTAssertTrue(secret.exists)
        tap("session.lock")
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 8))
        XCTAssertFalse(secret.exists)
        unlock(); tab("Vault"); entry.tap()
        XCTAssertFalse(secret.exists, "Unlock must not restore a previous reveal")
        back()
        print("E2E_APPROVED_REVEAL_HIDDEN_ON_LOCK=PASS")

        tab("Home"); tap("home.payments")
        XCTAssertTrue(app.staticTexts["No receipts"].waitForExistence(timeout: 8))
        app.switches["payments.showDemo"].switches.firstMatch.tap()
        XCTAssertEqual(app.staticTexts["payments.demoBanner"].label, "DEMO — synthetic data, no real payments")
        tap("payments.receipt.demo_receipt_mpp_001")
        XCTAssertEqual(app.staticTexts["receipt.field.id"].label, "demo_receipt_mpp_001")
        XCTAssertEqual(app.staticTexts["receipt.field.status"].label, "Simulated settled")
        back()
        app.switches["payments.showDemo"].switches.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["No receipts"].waitForExistence(timeout: 8))
        print("E2E_PAYMENTS_EMPTY_DEMO_DETAIL_AND_OPT_OUT=PASS")

        tab("Settings"); tap("settings.developer")
        XCTAssertTrue(app.staticTexts["Web proxy reference only"].exists)
        tap("developer.example.curl")
        XCTAssertTrue(app.staticTexts["developer.example.source"].label.contains("<YOUR_AGENT_TOKEN>"))
        tap("developer.example.copy")
        XCTAssertTrue(app.staticTexts["Placeholder example copied"].exists)
        back(); tap("developer.docs")
        XCTAssertTrue(app.navigationBars["Docs & Troubleshooting"].exists)
        tap("docs.topic.approvals")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Session-code approval is unavailable")).firstMatch.exists)
        back(); tap("docs.topic.browser")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "lacks the session bridge")).firstMatch.exists)
        print("E2E_DEVELOPER_PLACEHOLDERS_AND_NATIVE_WEB_DOCS=PASS")

        tab("Agents")
        XCTAssertFalse(app.buttons["approvalDemo.request"].exists)
        tap("approvalDemo.enable"); tap("approvalDemo.request")
        XCTAssertTrue(app.navigationBars["Approve operation"].exists)
        XCTAssertEqual(app.staticTexts["approval.host"].label, "api.provider.test")
        XCTAssertTrue(app.descendants(matching: .any)["approvalDemo.requester"].firstMatch.exists)
        XCTAssertFalse(app.buttons["approval.useCode"].isEnabled)
        tap("approval.biometric")
        let receipt = app.staticTexts["Agent receipt: Approved"]
        matchFaceID(awaiting: receipt)
        tap("approvalDemo.request")
        XCTAssertTrue(app.navigationBars["Approve operation"].exists)
        XCTAssertFalse(receipt.exists, "Each request needs fresh approval")
        tap("approval.deny")
        XCTAssertTrue(app.staticTexts["approvalDemo.denied"].waitForExistence(timeout: 8))
        XCTAssertFalse(receipt.exists)
        print("E2E_OPT_IN_MOCK_AGENT_APPROVE_THEN_DENY=PASS")

        tab("Activity")
        XCTAssertTrue(app.staticTexts["Save"].exists)
        let activity = app.debugDescription
        XCTAssertFalse(activity.contains("FAKE_KEYSHIELD_NOT_A_KEY::"))
        XCTAssertFalse(activity.contains("sk-proj-"))
        XCTAssertFalse(activity.contains("ks_sess_"))
        print("E2E_ACTIVITY_CONTAINS_NO_FIXTURE_OR_SESSION_TOKEN=PASS")

        tab("Vault"); entry.tap()
        XCTAssertEqual(app.staticTexts["detail.version.value"].label, "1")
        tap("detail.rotate"); tap("key.cancel")
        XCTAssertEqual(app.staticTexts["detail.version.value"].label, "1")
        tap("detail.rotate"); paste(.pasteRotation); tap("key.save")
        XCTAssertEqual(app.staticTexts["detail.version.value"].label, "2")
        app.terminate(); app.launch(); unlock()
        tab("Vault"); entry.tap()
        XCTAssertEqual(app.staticTexts["detail.version.value"].label, "2")
        tap("detail.copy"); tap("approval.biometric")
        matchFaceID(awaiting: app.staticTexts["detail.clipboard"])
        XCTAssertTrue(E2EHost.perform(.verifyRotation), "Rotated Copy must match the synthetic replacement hash")
        tap("detail.delete"); tap("delete.cancel")
        XCTAssertTrue(app.buttons["detail.reveal"].exists)
        tap("detail.delete"); tap("delete.confirm")
        XCTAssertTrue(app.buttons["vault.entry.Simulator approval fixture"].waitForExistence(timeout: 8))
        XCTAssertFalse(entry.exists)
        app.terminate(); app.launch(); unlock(); tab("Vault")
        XCTAssertFalse(entry.exists)
        XCTAssertTrue(app.buttons["vault.entry.Simulator approval fixture"].exists)
        print("E2E_ROTATE_CANCEL_CONFIRM_PERSIST_AND_DELETE_CANCEL_CONFIRM_PERSIST=PASS")
    }
}
#endif
