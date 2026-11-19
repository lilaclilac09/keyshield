import XCTest
@testable import KeyShield

typealias Operation = KeyShield.Operation

final class TestClock: Clock {
    var now = Date(timeIntervalSince1970: 1_893_456_000)
    func advance(_ seconds: TimeInterval) { now.addTimeInterval(seconds) }
}
final class MemoryKeys: VaultKeyStore {
    var key: Data?
    func load() throws -> Data? { key }
    func save(_ key: Data) throws { self.key = key }
}
final class MemoryState: ApprovalStateStore {
    var data: Data?
    var fails = false
    func read() throws -> Data? { data }
    func write(_ data: Data) throws { if fails { throw ShieldError.storage }; self.data = data }
}
struct TestLocation: VaultLocation { let directory: URL }
final class TestPasteboard: Pasteboard {
    var changeCount = 0
    var value: String?
    var expires: Date?
    var fails = false
    func write(_ value: String, expires: Date) throws {
        if fails { throw ShieldError.storage }
        self.value = value; self.expires = expires; changeCount += 1
    }
    func clear() throws { if fails { throw ShieldError.storage }; value = nil; changeCount += 1 }
}
struct TestBiometrics: BiometricAuthorizer {
    let accepted: Bool
    func approve(_ operation: Operation) async throws -> Bool { accepted }
}
final class MockURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (response, data) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class CoreTests: XCTestCase {
    var clock: TestClock!
    var policy: Policy!
    var lock: LockManager!
    var keys: MemoryKeys!
    var state: MemoryState!
    var sessions: AgentSessions!
    var approvals: ApprovalCenter!
    var vault: VaultStore!
    var audit: AuditLog!
    var directory: URL!
    let value = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "A", count: 32)
    let second = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "B", count: 32)
    override func setUpWithError() throws {
        clock = TestClock(); policy = Policy(); policy.approvedProviders.append("api.provider.test")
        lock = LockManager(clock: clock, policy: policy); lock.unlock()
        keys = MemoryKeys(); state = MemoryState()
        sessions = AgentSessions(clock: clock, policy: policy, lock: lock)
        approvals = try ApprovalCenter(clock: clock, policy: policy, store: state, lock: lock)
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        vault = VaultStore(clock: clock, lock: lock, keyStore: keys, location: TestLocation(directory: directory), sessions: sessions)
        audit = AuditLog(clock: clock, url: directory.appendingPathComponent("events"), key: { try self.vault.vaultKey() })
    }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
        MockURLProtocol.handler = nil
    }
    func fixture(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    func entry() throws -> UUID {
        if keys.key == nil { try vault.createVault() }
        guard case .saved(let id) = try vault.save(label: "Test", value: value, resolution: .keepBoth) else { throw ShieldError.invalid }
        return id
    }
    func grant(_ operation: Operation) throws -> Authorization {
        let challenge = try approvals.begin(operation)
        return try approvals.approve(challenge.id, code: challenge.code, operation: operation)
    }
    func token(_ id: UUID) throws -> String {
        let op = Operation(kind: .agentToken, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock")
        return try sessions.issue(operation: op, authorization: grant(op))
    }
    let url = URL(string: "https://api.provider.test/v1/mock")!

    func testEveryKeyFixtureAndNegative() throws {
        let json = try fixture("keys")
        for sample in json["samples"] as! [[String: String]] {
            let result = KeyDetector().detect(sample["value"]!)
            XCTAssertEqual(result?.provider, sample["provider"], sample["id"]!)
            XCTAssertEqual(result?.value, sample["value"])
        }
        for sample in json["negatives"] as! [[String: String]] { XCTAssertNil(KeyDetector().detect(sample["value"]!), sample["id"]!) }
        XCTAssertNil(KeyDetector().detect(""))
        XCTAssertNil(KeyDetector().detect("…sk-proj-abc"))
    }
    func testPolicyFixture() throws {
        let json = try fixture("policy")
        XCTAssertEqual(policy.sessionTTL, json["session_ttl_seconds"] as! Double)
        XCTAssertEqual(policy.codeTTL, json["code_ttl_seconds"] as! Double)
        XCTAssertEqual(policy.codeAttemptLimit, json["code_attempt_limit"] as! Int)
        XCTAssertEqual(policy.lockout, json["lockout_seconds"] as! Double)
        XCTAssertEqual(policy.clipboardClear, json["clipboard_clear_seconds"] as! Double)
        XCTAssertEqual(policy.idleLock, json["idle_lock_seconds"] as! Double)
        XCTAssertEqual(Policy().approvedProviders, ["api.openai.com", "api.anthropic.com", "api.github.com", "api.stripe.com"])
    }
    func testExplicitCreationAndCiphertext() throws {
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path)); XCTAssertNil(keys.key)
        try vault.createVault(); XCTAssertTrue(try vault.list().isEmpty)
        let id = try entry(); XCTAssertEqual(try vault.list().first?.id, id)
        let bytes = try Data(contentsOf: directory.appendingPathComponent("vault.json"))
        XCTAssertNil(String(data: bytes, encoding: .utf8)?.range(of: value))
        XCTAssertEqual(keys.key?.count, 32)
    }
    func testDuplicatesReplaceKeepBothAndRotate() throws {
        let id = try entry()
        XCTAssertEqual(try vault.save(label: "Other", value: value), .duplicate(id))
        XCTAssertEqual(try vault.save(label: "Test", value: second), .duplicate(id))
        XCTAssertEqual(try vault.save(label: "Test", value: second, resolution: .replace), .saved(id))
        XCTAssertEqual(try vault.list().first?.version, 2)
        _ = try vault.save(label: "Test", value: second, resolution: .keepBoth)
        XCTAssertEqual(try vault.list().count, 2)
        try vault.rotate(id, value: value); XCTAssertEqual(try vault.list().first?.version, 3)
    }
    func testSyntheticOnlyStorageAndEmptyErrors() throws {
        try vault.createVault()
        XCTAssertThrowsError(try vault.save(label: "x", value: "sk-proj-" + String(repeating: "A", count: 32)))
        XCTAssertThrowsError(try vault.save(label: "", value: value))
        XCTAssertThrowsError(try vault.delete(UUID()))
    }
    func testSingleUseSecretAuthorizationAndMismatch() throws {
        let id = try entry(), op = Operation(kind: .reveal, keyId: UUID())
        let wrong = try grant(op)
        XCTAssertThrowsError(try vault.withSecret(id, authorization: wrong, operation: Operation(kind: .reveal, keyId: id)) { $0 })
        let actual = Operation(kind: .reveal, keyId: id), authorization = try grant(actual)
        XCTAssertEqual(try vault.withSecret(id, authorization: authorization, operation: actual) { $0 }, value)
        XCTAssertThrowsError(try vault.withSecret(id, authorization: authorization, operation: actual) { $0 })
    }
    func testLockedIdleAndBackground() throws {
        let id = try entry()
        clock.advance(60); XCTAssertTrue(lock.isLocked); XCTAssertThrowsError(try vault.list())
        lock.unlock(); XCTAssertFalse(lock.isLocked)
        lock.background(); XCTAssertThrowsError(try vault.rotate(id, value: second))
        lock.unlock(); lock.lock(); XCTAssertThrowsError(try approvals.begin(Operation(kind: .copy, keyId: id)))
    }
    func testCodeFixtureExpiryAndReplay() throws {
        let fixture = try fixture("auth")
        XCTAssertEqual((fixture["codes"] as! [[String: Any]])[0]["single_use"] as? Bool, true)
        let op = Operation(kind: .copy, keyId: UUID()), challenge = try approvals.begin(op)
        XCTAssertNotNil(challenge.code.range(of: "^[0-9]{6}$", options: .regularExpression))
        _ = try approvals.approve(challenge.id, code: challenge.code, operation: op)
        XCTAssertThrowsError(try approvals.approve(challenge.id, code: challenge.code, operation: op))
        let expired = try approvals.begin(op); clock.advance(30)
        XCTAssertThrowsError(try approvals.approve(expired.id, code: expired.code, operation: op))
    }
    func testCodeDenyMismatchAndErrorDoesNotEcho() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        do { _ = try approvals.approve(c.id, code: "sensitive-code", operation: op); XCTFail() }
        catch { XCTAssertFalse(String(describing: error).contains("sensitive-code")) }
        XCTAssertThrowsError(try approvals.approve(c.id, code: c.code, operation: Operation(kind: .reveal, keyId: op.keyId)))
        XCTAssertThrowsError(try approvals.approve(c.id, code: c.code, operation: op))
        let denied = try approvals.begin(op); approvals.deny(denied.id)
        XCTAssertThrowsError(try approvals.approve(denied.id, code: denied.code, operation: op))
    }
    func testLockoutPersistsAcrossRestart() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        for _ in 0..<3 { XCTAssertThrowsError(try approvals.approve(c.id, code: "wrong", operation: op)) }
        let restarted = try ApprovalCenter(clock: clock, policy: policy, store: state, lock: lock)
        XCTAssertThrowsError(try restarted.begin(op))
        clock.advance(119); lock.unlock(); XCTAssertThrowsError(try restarted.begin(op))
        clock.advance(1); _ = try restarted.begin(op)
    }
    func testApprovalPersistenceFailureFailsClosed() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        state.fails = true
        XCTAssertThrowsError(try approvals.approve(c.id, code: c.code, operation: op))
        state.fails = false
        XCTAssertThrowsError(try approvals.approve(c.id, code: c.code, operation: op))
    }
    func testBiometricSingleDisplayedOperation() async throws {
        let op = Operation(kind: .reveal, keyId: UUID()), c = try approvals.begin(op)
        let approved = try await approvals.approveBiometrically(c.id, operation: op, authorizer: TestBiometrics(accepted: true))
        try approved.consume(for: op); XCTAssertThrowsError(try approved.consume(for: op))
        let denied = try approvals.begin(op)
        do { _ = try await approvals.approveBiometrically(denied.id, operation: op, authorizer: TestBiometrics(accepted: false)); XCTFail() } catch {}
    }
    func testAgentFixtureScopesAndAliases() throws {
        let json = try fixture("agents"), id = try entry(), token = try token(id)
        XCTAssertTrue(token.hasPrefix("ks_sess_")); XCTAssertEqual(token.count, 51)
        XCTAssertEqual(try sessions.validate(token, method: "POST", url: url).keyId, id)
        for request in json["requests"] as! [[String: Any]] {
            if let alias = request["token"] as? String { XCTAssertThrowsError(try sessions.validate(alias, method: "POST", url: url)) }
        }
        for badURL in ["http://api.provider.test/v1/mock", "https://evil.test/v1/mock", "https://api.provider.test.evil.test/v1/mock", "https://x@api.provider.test/v1/mock", "https://api.provider.test:444/v1/mock", "https://api.provider.test/admin", "https://api.provider.test/v1/mock?x=y"] {
            XCTAssertThrowsError(try sessions.validate(token, method: "POST", url: URL(string: badURL)!))
        }
        XCTAssertThrowsError(try sessions.validate(token, method: "DELETE", url: url))
        XCTAssertThrowsError(try sessions.validate(token, method: "POST", url: url, keyId: UUID()))
        XCTAssertThrowsError(try sessions.validate(String(token.dropLast()), method: "POST", url: url))
    }
    func testSessionsExactExpiryRevokeAndRestart() throws {
        let id = try entry(), first = try token(id)
        clock.advance(60); lock.unlock(); XCTAssertThrowsError(try sessions.validate(first, method: "POST", url: url))
        let second = try token(id); sessions.revoke(second)
        XCTAssertThrowsError(try sessions.validate(second, method: "POST", url: url))
        let third = try token(id), restarted = AgentSessions(clock: clock, policy: policy, lock: lock)
        XCTAssertThrowsError(try restarted.validate(third, method: "POST", url: url))
    }
    func testRotateDeleteRevokeSessions() throws {
        let id = try entry(), first = try token(id)
        try vault.rotate(id, value: second)
        XCTAssertThrowsError(try sessions.validate(first, method: "POST", url: url))
        let next = try token(id); try vault.delete(id)
        XCTAssertThrowsError(try sessions.validate(next, method: "POST", url: url)); XCTAssertTrue(try vault.list().isEmpty)
    }
    func testClipboardExpiryAndUserTextPreserved() throws {
        let id = try entry(), board = TestPasteboard()
        let service = ClipboardService(clock: clock, policy: policy, pasteboard: board, vault: vault, audit: audit)
        let op = Operation(kind: .copy, keyId: id)
        try service.copy(id, authorization: grant(op)); XCTAssertEqual(board.value, value)
        XCTAssertEqual(board.expires, clock.now.addingTimeInterval(30))
        clock.advance(30); try service.clearIfExpired(); XCTAssertNil(board.value)
        try service.copy(id, authorization: grant(op))
        try board.write("user text", expires: clock.now.addingTimeInterval(100))
        clock.advance(30); try service.clearIfExpired(); XCTAssertEqual(board.value, "user text")
    }
    func testClipboardFailure() throws {
        let id = try entry(), board = TestPasteboard(); board.fails = true
        let service = ClipboardService(clock: clock, pasteboard: board, vault: vault, audit: audit)
        XCTAssertThrowsError(try service.copy(id, authorization: grant(Operation(kind: .copy, keyId: id))))
    }
    func testAuditEncryptedAppendAndFailure() throws {
        _ = try entry()
        XCTAssertTrue(try audit.events().isEmpty)
        try audit.append(actor: .human, action: .copy, outcome: .success)
        try audit.append(actor: .agent(UUID()), action: .providerRequest, outcome: .denied)
        XCTAssertEqual(try audit.events().count, 2)
        let bytes = try Data(contentsOf: directory.appendingPathComponent("events"))
        XCTAssertFalse(String(decoding: bytes, as: UTF8.self).contains("providerRequest"))
        let bad = AuditLog(url: directory.appendingPathComponent("vault.json/child"), key: { try self.vault.vaultKey() })
        XCTAssertThrowsError(try bad.append(actor: .human, action: .copy, outcome: .success))
    }
    func testBackupRoundTripWrongPasswordCorruptionAndEmpty() throws {
        try vault.createVault()
        let service = BackupService(vault: vault, audit: audit)
        let empty = try service.export(passphrase: "synthetic passphrase")
        let id = try entry(), token = try token(id)
        let backup = try service.export(passphrase: "synthetic passphrase")
        XCTAssertThrowsError(try service.restore(backup, passphrase: "wrong")); XCTAssertEqual(try vault.list().count, 1)
        XCTAssertThrowsError(try service.restore(Data(backup.dropLast()), passphrase: "synthetic passphrase")); XCTAssertEqual(try vault.list().count, 1)
        try vault.delete(id); try service.restore(backup, passphrase: "synthetic passphrase")
        XCTAssertEqual(try vault.list().first?.id, id)
        XCTAssertThrowsError(try sessions.validate(token, method: "POST", url: url))
        try service.restore(empty, passphrase: "synthetic passphrase"); XCTAssertTrue(try vault.list().isEmpty)
    }
    func testProviderRedactionAndOfflineFailure() async throws {
        let id = try entry(), token = try token(id), secret = value
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, session: URLSession(configuration: config))
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + secret)
            let encoded = Data(secret.utf8).base64EncodedString(), hex = Data(secret.utf8).map { String(format: "%02x", $0) }.joined()
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Echo": secret])!, Data((secret + encoded + hex).utf8))
        }
        let result = try await executor.execute(token: token, keyId: id, method: "POST", url: url)
        XCTAssertEqual(result.status, 200)
        XCTAssertFalse(String(decoding: result.body, as: UTF8.self).contains(secret))
        XCTAssertFalse(result.headers.values.contains(where: { $0.contains(secret) }))
        var calls = 0
        MockURLProtocol.handler = { _ in calls += 1; throw URLError(.notConnectedToInternet) }
        do { _ = try await executor.execute(token: token, keyId: id, method: "POST", url: url); XCTFail() } catch { XCTAssertEqual(calls, 1) }
    }
    func testProviderRedirectStatusRejected() async throws {
        let id = try entry(), token = try token(id)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        MockURLProtocol.handler = { request in (HTTPURLResponse(url: request.url!, statusCode: 307, httpVersion: nil, headerFields: ["Location": "https://evil.test/collect"])!, Data()) }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, session: URLSession(configuration: config))
        do { _ = try await executor.execute(token: token, keyId: id, method: "POST", url: url); XCTFail() } catch {}
    }
    func testRedirectDelegateNeverFollows() {
        let delegate = RefuseRedirects(), session = URLSession(configuration: .ephemeral)
        let request = URLRequest(url: URL(string: "https://evil.test/collect")!)
        let response = HTTPURLResponse(url: url, statusCode: 307, httpVersion: nil, headerFields: nil)!
        var completed = false
        delegate.urlSession(session, task: session.dataTask(with: url), willPerformHTTPRedirection: response, newRequest: request) {
            XCTAssertNil($0); completed = true
        }
        XCTAssertTrue(completed); session.invalidateAndCancel()
    }
    func testExpiredGrantAndUnapprovedProvider() throws {
        let id = try entry(), op = Operation(kind: .reveal, keyId: id), auth = try grant(op)
        clock.advance(30)
        XCTAssertThrowsError(try vault.withSecret(id, authorization: auth, operation: op) { $0 })
        let untrusted = Operation(kind: .agentToken, keyId: id, host: "evil.test", method: "POST", path: "/v1/mock")
        XCTAssertThrowsError(try sessions.issue(operation: untrusted, authorization: grant(untrusted)))
    }
    func testClipboardClearAndAuditFailuresAreReported() throws {
        let id = try entry(), board = TestPasteboard(), op = Operation(kind: .copy, keyId: id)
        let service = ClipboardService(clock: clock, pasteboard: board, vault: vault, audit: audit)
        try service.copy(id, authorization: grant(op)); board.fails = true
        clock.advance(30)
        XCTAssertThrowsError(try service.clearIfExpired()); XCTAssertTrue(service.clearFailed)
        board.fails = false
        let bad = AuditLog(url: directory.appendingPathComponent("vault.json/child"), key: { try self.vault.vaultKey() })
        let failing = ClipboardService(clock: clock, pasteboard: board, vault: vault, audit: bad)
        XCTAssertThrowsError(try failing.copy(id, authorization: grant(op))) { error in
            guard case ShieldError.audit = error else { return XCTFail("Expected audit failure") }
        }
    }
    func testBiometricsMismatchExpiryReplayAndDenial() async throws {
        let op = Operation(kind: .copy, keyId: UUID()), mismatch = try approvals.begin(op)
        do {
            _ = try await approvals.approveBiometrically(mismatch.id, operation: Operation(kind: .reveal, keyId: op.keyId), authorizer: TestBiometrics(accepted: true)); XCTFail()
        } catch {}
        do { _ = try await approvals.approveBiometrically(mismatch.id, operation: op, authorizer: TestBiometrics(accepted: true)); XCTFail() } catch {}
        let expired = try approvals.begin(op); clock.advance(30)
        do { _ = try await approvals.approveBiometrically(expired.id, operation: op, authorizer: TestBiometrics(accepted: true)); XCTFail() } catch {}
    }
    func testCodeLockoutStillAllowsIndependentBiometricApproval() async throws {
        let op = Operation(kind: .copy, keyId: UUID()), challenge = try approvals.begin(op)
        for _ in 0..<3 { XCTAssertThrowsError(try approvals.approve(challenge.id, code: "wrong", operation: op)) }
        let authorization = try await approvals.approveBiometrically(challenge.id, operation: op, authorizer: TestBiometrics(accepted: true))
        try authorization.consume(for: op)
        XCTAssertThrowsError(try authorization.consume(for: op))
        XCTAssertThrowsError(try approvals.begin(op))
    }
    func testIdleCountdownDoesNotRenewSession() {
        XCTAssertEqual(lock.secondsUntilLock, 60)
        clock.advance(20); XCTAssertEqual(lock.secondsUntilLock, 40)
        clock.advance(40); XCTAssertEqual(lock.secondsUntilLock, 0); XCTAssertTrue(lock.isLocked)
    }
    func testDirectProviderApprovalIsSingleUseAndScoped() async throws {
        let id = try entry()
        let op = Operation(kind: .providerRequest, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock")
        let authorization = try grant(op)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockURLProtocol.self]
        var calls = 0
        MockURLProtocol.handler = { request in
            calls += 1
            XCTAssertEqual(request.httpMethod, "POST")
            return (HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!, Data())
        }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, session: URLSession(configuration: config))
        let response = try await executor.execute(operation: op, authorization: authorization)
        XCTAssertTrue(response.body.isEmpty); XCTAssertEqual(calls, 1)
        do { _ = try await executor.execute(operation: op, authorization: authorization); XCTFail() } catch {}
        XCTAssertEqual(calls, 1)
        let invalid = Operation(kind: .providerRequest, keyId: id, host: "evil.test", method: "POST", path: "/v1/mock")
        do { _ = try await executor.execute(operation: invalid, authorization: grant(invalid)); XCTFail() } catch {}
        XCTAssertEqual(calls, 1)
    }
}
