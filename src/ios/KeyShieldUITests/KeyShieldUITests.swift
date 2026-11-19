import XCTest

final class KeyShieldUITests: XCTestCase {
    private var app: XCUIApplication!
    private let fixture = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "A", count: 32)
    private let rotated = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "B", count: 32)

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-UITestMode"]
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
    #if !DEBUG
    func testReleaseLaunchWithTestArgumentShowsNormalOnboarding() {
        XCTAssertTrue(app.buttons["onboarding.create"].waitForExistence(timeout: 5))
        screenshot("Release-IgnoresUITestMode")
        tap("onboarding.create"); tap("onboarding.cancel")
        XCTAssertTrue(app.buttons["onboarding.create"].exists)
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
    }
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
