import XCTest
import CoreFoundation

final class KeyShieldUITests: XCTestCase {
    private var app: XCUIApplication!
    private let fixture = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "A", count: 32)
    private let rotated = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "B", count: 32)

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        #if DEBUG
        app.launchArguments = ["-UITestMode"]
        #endif
        app.launch()
    }
    override func tearDownWithError() throws { app.terminate() }
    private func tap(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        let element = app.buttons[id].firstMatch
        XCTAssertTrue(element.exists || element.waitForExistence(timeout: 5), "Missing \(id)", file: file, line: line)
        if !element.isHittable { app.swipeUp() }
        element.tap()
    }
    private func type(_ id: String, _ text: String, secure: Bool = false) {
        let field = secure ? app.secureTextFields[id] : app.textFields[id]
        XCTAssertTrue(field.exists || field.waitForExistence(timeout: 5)); field.tap(); field.typeText(text)
    }
    private func done() {
        let button = app.buttons["keyboard.done"].firstMatch
        if button.exists { button.tap() }
    }
    private func create() {
        tap("onboarding.create"); tap("onboarding.confirm")
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 5))
    }
    private func tab(_ name: String) { app.tabBars.buttons[name].tap() }
    private func add(_ value: String? = nil, label: String = "Test OpenAI") {
        tap("vault.add")
        type("key.label", label)
        type("key.value", value ?? fixture, secure: true); done()
    }
    private func savedKey() {
        create(); tab("Vault"); add(); tap("key.save")
        XCTAssertTrue(app.buttons["vault.entry.Test OpenAI"].waitForExistence(timeout: 5))
    }
    private func detail() { tap("vault.entry.Test OpenAI") }
    private func approveBiometric() { tap("approval.biometric") }
    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func paymentField(_ id: String, _ value: String) {
        let field = app.staticTexts["receipt.field." + id]
        for _ in 0..<8 {
            if field.exists && field.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(field.exists)
        XCTAssertEqual(field.label, value)
    }
    private func paymentsFlow() {
        create()
        XCTAssertEqual(app.tabBars.buttons.count, 5)
        if !app.buttons["home.payments"].isHittable { app.swipeUp() }
        screenshot("Payments-01-Home")
        tap("home.payments")
        XCTAssertTrue(app.staticTexts["No receipts"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["The iOS app does not make or record payments yet. Turn on demo receipts to explore synthetic examples."].exists)
        XCTAssertFalse(app.staticTexts["payments.demoBanner"].exists)
        screenshot("Payments-02-Empty")
        app.switches["payments.showDemo"].switches.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["payments.demoBanner"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["payments.demoBanner"].label, "DEMO — synthetic data, no real payments")
        XCTAssertTrue(app.staticTexts["payments.badge.demo_receipt_mpp_001"].exists)
        screenshot("Payments-03-DemoLedger")
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["payments.badge.demo_receipt_x402_002"].exists)
        app.swipeDown()
        tap("payments.receipt.demo_receipt_mpp_001")
        XCTAssertTrue(app.staticTexts["payments.demoBanner"].exists)
        paymentField("id", "demo_receipt_mpp_001")
        paymentField("status", "Simulated settled")
        paymentField("provider", "Demo Metered API")
        paymentField("endpoint", "POST https://api.mpp-provider.test/v1/demo")
        screenshot("Payments-04-ReceiptDetail")
        paymentField("amount", "123.456789 DEMO_USDC")
        paymentField("timestamp", "2030-01-02T12:00:00Z")
        paymentField("actor", "Human")
        paymentField("wallet", "DEMO_HUMAN_WALLET")
        paymentField("agent", "demo_agent_none")
        paymentField("session", "demo_session_human")
        XCTAssertTrue(app.staticTexts["payments.demoBanner"].isHittable)
        screenshot("Payments-05-ReceiptActor")
        app.navigationBars.buttons["Payments"].tap()
        app.switches["payments.showDemo"].switches.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["No receipts"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["payments.demoBanner"].exists)
        XCTAssertFalse(app.buttons["payments.receipt.demo_receipt_mpp_001"].exists)
        screenshot("Payments-06-DemoOff")
        tab("Vault")
        XCTAssertTrue(app.staticTexts["Your vault is empty"].exists)
        tab("Activity")
        XCTAssertFalse(app.debugDescription.contains("demo_receipt_"))
    }
    #if DEBUG
    func testPaymentsDemoLedgerIsOptInAndDetailIsMarked() { paymentsFlow() }
    #endif
    #if !DEBUG
    func testReleasePaymentsZipSmoke() {
        XCTAssertTrue(app.launchArguments.isEmpty)
        paymentsFlow()
    }
    func testReleaseLaunchWithTestArgumentShowsNormalOnboarding() {
        app.terminate()
        app.launchArguments = ["-UITestMode"]
        app.launch()
        XCTAssertTrue(app.buttons["onboarding.create"].waitForExistence(timeout: 5))
        screenshot("Release-IgnoresUITestMode")
        tap("onboarding.create"); tap("onboarding.cancel")
        XCTAssertTrue(app.buttons["onboarding.create"].exists)
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
    }
    #if targetEnvironment(simulator)
    private func matchFaceID(_ screenshotName: String, awaiting element: XCUIElement) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = screenshotName; attachment.lifetime = .keepAlways; add(attachment)
        let authenticated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            if element.exists { return true }
            CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                CFNotificationName(rawValue: "com.apple.BiometricKit_Sim.pearl.match" as CFString), nil, nil, true)
            return false
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [authenticated], timeout: 15), .completed)
    }
    func testReleaseSignedZipPersistsVaultAndRequiresFaceID() {
        XCTAssertTrue(app.launchArguments.isEmpty)
        screenshot("Release-01-Onboarding")
        create(); screenshot("Release-02-CreatedVault")
        tab("Vault"); add(); tap("key.save")
        XCTAssertTrue(app.buttons["vault.entry.Test OpenAI"].waitForExistence(timeout: 5))
        screenshot("Release-03-SavedSyntheticKey")
        XCTAssertFalse(app.debugDescription.contains(fixture))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.debugDescription.contains(fixture))
        screenshot("Release-04-RelaunchedLocked")
        tap("lock.unlock")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let permission = springboard.alerts.buttons["OK"]
        if permission.waitForExistence(timeout: 3) { permission.tap() }
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
        matchFaceID("Release-05-FaceIDUnlockPrompt", awaiting: app.tabBars.buttons["Home"])
        screenshot("Release-06-Authenticated")
        tab("Vault"); detail(); tap("detail.reveal")
        XCTAssertFalse(app.staticTexts["detail.secret"].exists)
        XCTAssertFalse(app.buttons["approval.useCode"].isEnabled)
        screenshot("Release-07-RevealApproval")
        approveBiometric()
        XCTAssertFalse(app.staticTexts["detail.secret"].exists)
        matchFaceID("Release-08-FaceIDRevealPrompt", awaiting: app.staticTexts["detail.secret"])
        XCTAssertEqual(app.staticTexts["detail.secret"].label, fixture)
        screenshot("Release-09-ApprovedReveal")
    }
    #endif
    #endif
    func testOnboardingCancelThenCreateAndMainScreens() {
        tap("onboarding.create"); tap("onboarding.cancel")
        XCTAssertTrue(app.buttons["onboarding.create"].exists)
        screenshot("01-Onboarding")
        create(); screenshot("02-Home")
        tab("Vault"); XCTAssertTrue(app.staticTexts["Your vault is empty"].exists); screenshot("03-Vault")
        tab("Agents"); XCTAssertTrue(app.staticTexts["No pending requests"].exists); screenshot("04-Agents")
        tab("Activity"); XCTAssertTrue(app.buttons["activity.export"].exists); screenshot("05-Activity")
        tab("Settings"); XCTAssertTrue(app.buttons["settings.backup"].exists); screenshot("06-Settings")
    }
    func testDeveloperExampleCopiesOnlyThePlaceholderSnippet() throws {
        create()
        tab("Settings")
        tap("settings.developer")
        XCTAssertTrue(app.navigationBars["Developer"].exists)
        XCTAssertTrue(app.staticTexts["Web proxy reference only"].exists)
        screenshot("18-Developer")

        tap("developer.example.curl")
        let source = app.staticTexts["developer.example.source"]
        XCTAssertTrue(source.exists)
        XCTAssertTrue(source.label.contains("<YOUR_AGENT_TOKEN>"))
        XCTAssertTrue(source.label.contains("/vproxy/openai/v1/models"))
        let expected = source.label.filter { !$0.isWhitespace }
        tap("developer.example.copy")
        XCTAssertTrue(app.staticTexts["Placeholder example copied"].exists)
        screenshot("19-PlaceholderExampleCopied")

        tab("Vault")
        tap("vault.add")
        let label = app.textFields["key.label"]
        XCTAssertTrue(label.exists)
        label.tap()
        label.press(forDuration: 1)
        let paste = try XCTUnwrap(app.menuItems.matching(NSPredicate(format: "label == 'Paste'"))
            .allElementsBoundByIndex.first { $0.isHittable }
            ?? app.buttons.matching(NSPredicate(format: "label == 'Paste'"))
            .allElementsBoundByIndex.first { $0.identifier != "key.paste" && $0.isHittable })
        paste.tap()
        let pasted = try XCTUnwrap(label.value as? String)
        XCTAssertEqual(pasted.filter { !$0.isWhitespace }, expected)
        XCTAssertFalse(pasted.contains(fixture))
        tap("key.cancel")
    }
    func testDocsSupportsNativeAndWebOnlyTroubleshooting() {
        create()
        tab("Settings")
        tap("settings.docs")
        XCTAssertTrue(app.navigationBars["Docs & Troubleshooting"].exists)
        screenshot("20-DocsAndTroubleshooting")
        tap("docs.topic.approvals")
        XCTAssertTrue(app.navigationBars["Unlock and approvals"].exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Session-code approval is unavailable")).firstMatch.exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()

        tap("docs.topic.browser")
        XCTAssertTrue(app.navigationBars["Legacy browser extension"].exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "lacks the session bridge")).firstMatch.exists)
        XCTAssertFalse(app.buttons["Copy example"].exists)
        screenshot("21-LegacyBrowserHelp")

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tap("settings.developer")
        tap("developer.docs")
        XCTAssertTrue(app.navigationBars["Docs & Troubleshooting"].exists)
    }
    func testExplicitSaveAndDuplicateCancel() {
        create(); tab("Vault"); add()
        XCTAssertTrue(app.buttons["key.save"].isEnabled)
        screenshot("07-ExplicitImport")
        tap("key.cancel")
        XCTAssertTrue(app.staticTexts["Your vault is empty"].exists)
        add(); tap("key.save")
        XCTAssertTrue(app.buttons["vault.entry.Test OpenAI"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.debugDescription.contains(fixture))
        add(); tap("key.save")
        XCTAssertTrue(app.buttons["Replace"].waitForExistence(timeout: 5))
        screenshot("08-Conflict")
        app.buttons.matching(NSPredicate(format: "label == 'Cancel'")).firstMatch.tap()
        tap("key.cancel")
        XCTAssertEqual(app.buttons.matching(identifier: "vault.entry.Test OpenAI").count, 1)
    }
    func testNegativeNotRecognizedAndSaveDisabled() {
        create(); tab("Vault"); add("YOUR_API_KEY_HERE")
        XCTAssertTrue(app.staticTexts["Format not recognized"].exists)
        XCTAssertFalse(app.buttons["key.save"].isEnabled)
    }
    func testCopyRequiresDeviceApprovalAndSessionCodesAreUnavailable() {
        savedKey(); detail(); tap("detail.copy")
        XCTAssertFalse(app.staticTexts["detail.clipboard"].exists)
        XCTAssertFalse(app.buttons["approval.useCode"].isEnabled)
        XCTAssertEqual(app.buttons["approval.useCode"].label, "Session code — unavailable until secure out-of-band issuance")
        XCTAssertFalse(app.staticTexts["approval.code"].exists)
        XCTAssertFalse(app.textFields["approval.input"].exists)
        XCTAssertFalse(app.buttons["approval.submitCode"].exists)
        screenshot("09-DeviceApprovalOnly")
        tap("approval.deny")
        XCTAssertFalse(app.staticTexts["detail.clipboard"].exists)
        tap("detail.copy"); approveBiometric()
        XCTAssertTrue(app.staticTexts["detail.clipboard"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["detail.clipboard"].label.contains("Clipboard clears"))
        XCTAssertFalse(app.debugDescription.contains(fixture))
    }
    func testBackgroundLocksAndClearsRevealedSecret() {
        savedKey(); detail(); tap("detail.reveal"); approveBiometric()
        XCTAssertTrue(app.staticTexts["detail.secret"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.debugDescription.contains(fixture))
        screenshot("10-BackgroundLocked")
        tap("lock.unlock"); tab("Vault"); detail()
        XCTAssertFalse(app.staticTexts["detail.secret"].exists)
    }
    func testRevealThenLockClearsVisibleSecret() {
        savedKey(); detail(); tap("detail.reveal"); approveBiometric()
        XCTAssertTrue(app.staticTexts["detail.secret"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["detail.secret"].label, fixture)
        tap("session.lock")
        XCTAssertTrue(app.buttons["lock.unlock"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.debugDescription.contains(fixture)); screenshot("11-Locked")
        tap("lock.unlock")
        tab("Vault"); detail()
        XCTAssertFalse(app.staticTexts["detail.secret"].exists)
    }
    func testAgentApproveAndRevoke() {
        savedKey(); tab("Agents"); tap("agents.simulate"); tap("agents.review")
        XCTAssertEqual(app.staticTexts["approval.host"].label, "api.provider.test")
        approveBiometric()
        XCTAssertTrue(app.staticTexts["ks_sess_…"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.debugDescription.contains(fixture)); screenshot("12-ActiveSession")
        tap("session.revoke")
        XCTAssertTrue(app.staticTexts["session.revoked"].exists)
    }
    func testApprovedSimulatedProviderResultIsVisible() {
        savedKey(); detail(); tap("detail.provider")
        XCTAssertFalse(app.staticTexts["session.notice"].exists)
        tap("approval.deny")
        XCTAssertFalse(app.staticTexts["session.notice"].exists)
        tap("detail.provider"); approveBiometric()
        XCTAssertTrue(app.staticTexts["session.notice"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["session.notice"].label, "Provider response: HTTP 200")
        screenshot("17-SimulatedProviderResult")
        tap("notice.dismiss")
        XCTAssertFalse(app.staticTexts["session.notice"].exists)
    }
    func testRotateBumpsVersion() {
        savedKey(); detail(); tap("detail.rotate")
        type("key.value", rotated, secure: true); done(); tap("key.save")
        XCTAssertEqual(app.staticTexts["detail.version.value"].label, "2")
        screenshot("13-KeyDetailRotated")
    }
    func testDeleteCancelThenConfirm() {
        savedKey(); detail(); tap("detail.delete"); tap("delete.cancel")
        XCTAssertTrue(app.buttons["detail.reveal"].exists)
        tap("detail.delete"); tap("delete.confirm")
        XCTAssertTrue(app.staticTexts["Your vault is empty"].waitForExistence(timeout: 5))
    }
    func testActivityEventsContainNoSecret() {
        savedKey(); tab("Activity")
        XCTAssertTrue(app.staticTexts["Save"].exists)
        XCTAssertFalse(app.debugDescription.contains(fixture))
        tap("activity.export")
        XCTAssertTrue(app.buttons["activity.share"].waitForExistence(timeout: 5))
        screenshot("14-ActivityExport")
    }
    func testBackupWrongPassphraseLeavesVaultUnchanged() {
        savedKey(); tab("Settings"); tap("settings.backup")
        type("backup.passphrase", "synthetic backup passphrase", secure: true); done(); tap("backup.submit")
        XCTAssertTrue(app.buttons["backup.share"].waitForExistence(timeout: 5)); screenshot("15-BackupExport")
        tap("backup.cancel"); tap("settings.restore"); tap("backup.useLast")
        type("backup.passphrase", "wrong passphrase", secure: true); done(); tap("backup.submit")
        XCTAssertTrue(app.staticTexts["backup.message"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["backup.message"].label.contains("Vault unchanged")); screenshot("16-RestoreError")
        tap("backup.cancel"); tab("Vault")
        XCTAssertEqual(app.buttons.matching(identifier: "vault.entry.Test OpenAI").count, 1)
    }
}
