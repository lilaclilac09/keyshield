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
        return try approvals.approve(challenge.id, code: XCTUnwrap(challenge.code), operation: operation)
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
        let code = try XCTUnwrap(challenge.code)
        XCTAssertNotNil(code.range(of: "^[0-9]{6}$", options: .regularExpression))
        _ = try approvals.approve(challenge.id, code: code, operation: op)
        XCTAssertThrowsError(try approvals.approve(challenge.id, code: code, operation: op))
        let expired = try approvals.begin(op); clock.advance(30)
        XCTAssertThrowsError(try approvals.approve(expired.id, code: XCTUnwrap(expired.code), operation: op))
    }
    func testCodeDenyMismatchAndErrorDoesNotEcho() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        do { _ = try approvals.approve(c.id, code: "sensitive-code", operation: op); XCTFail() }
        catch { XCTAssertFalse(String(describing: error).contains("sensitive-code")) }
        XCTAssertThrowsError(try approvals.approve(c.id, code: XCTUnwrap(c.code), operation: Operation(kind: .reveal, keyId: op.keyId)))
        XCTAssertThrowsError(try approvals.approve(c.id, code: XCTUnwrap(c.code), operation: op))
        let denied = try approvals.begin(op); approvals.deny(denied.id)
        XCTAssertThrowsError(try approvals.approve(denied.id, code: XCTUnwrap(denied.code), operation: op))
    }
    func testLockoutPersistsAcrossRestart() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        for _ in 0..<3 { XCTAssertThrowsError(try approvals.approve(c.id, code: "wrong", operation: op)) }
        let restarted = try ApprovalCenter(clock: clock, policy: policy, store: state, lock: lock)
        XCTAssertNil(try restarted.begin(op).code)
        XCTAssertEqual(restarted.codeLockoutRemaining, 120)
        clock.advance(119); lock.unlock(); XCTAssertNil(try restarted.begin(op).code)
        XCTAssertEqual(restarted.codeLockoutRemaining, 1)
        clock.advance(1); XCTAssertNotNil(try restarted.begin(op).code)
        XCTAssertEqual(restarted.codeLockoutRemaining, 0)
    }
    func testApprovalPersistenceFailureFailsClosed() throws {
        let op = Operation(kind: .copy, keyId: UUID()), c = try approvals.begin(op)
        state.fails = true
        XCTAssertThrowsError(try approvals.approve(c.id, code: XCTUnwrap(c.code), operation: op))
        state.fails = false
        XCTAssertThrowsError(try approvals.approve(c.id, code: XCTUnwrap(c.code), operation: op))
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
    func testRestoreAuditFailureReportsCommittedStateWithoutThrowing() throws {
        let id = try entry()
        let service = BackupService(vault: vault, audit: audit)
        let backup = try service.export(passphrase: "audit failure backup")
        try vault.rotate(id, value: second)
        let session = try token(id)
        let brokenAudit = AuditLog(url: directory.appendingPathComponent("vault.json/child"), key: { try self.vault.vaultKey() })
        let result = try BackupService(vault: vault, audit: brokenAudit).restore(backup, passphrase: "audit failure backup")
        XCTAssertEqual(result, .restoredWithoutAudit)
        XCTAssertEqual(try vault.list().first?.version, 1)
        let operation = Operation(kind: .reveal, keyId: id)
        XCTAssertEqual(try vault.withSecret(id, authorization: grant(operation), operation: operation) { $0 }, value)
        XCTAssertThrowsError(try sessions.validate(session, method: "POST", url: url))
        XCTAssertEqual(try service.restore(backup, passphrase: "audit failure backup"), .restored)
    }
    func testRestoreRecoversMigratedVaultWithoutDeviceKey() throws {
        let id = try entry(), originalKey = try XCTUnwrap(keys.key)
        let log = AuditLog(clock: clock, url: directory.appendingPathComponent("audit.jsonl"), key: { try self.vault.vaultKey() })
        let service = BackupService(vault: vault, audit: log)
        let backup = try service.export(passphrase: "migration backup")
        let vaultURL = directory.appendingPathComponent("vault.json")
        let oldVault = try Data(contentsOf: vaultURL)
        let oldAudit = try Data(contentsOf: directory.appendingPathComponent("audit.jsonl"))
        keys.key = nil
        XCTAssertThrowsError(try vault.list())
        XCTAssertThrowsError(try service.restore(backup, passphrase: "wrong"))
        XCTAssertThrowsError(try service.restore(Data(backup.dropLast()), passphrase: "migration backup"))
        XCTAssertNil(keys.key)
        XCTAssertEqual(try Data(contentsOf: vaultURL), oldVault)
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent("audit.jsonl")), oldAudit)
        try service.restore(backup, passphrase: "migration backup")
        XCTAssertNotEqual(keys.key, originalKey)
        XCTAssertEqual(try vault.list().map(\.id), [id])
        let operation = Operation(kind: .reveal, keyId: id)
        XCTAssertEqual(try vault.withSecret(id, authorization: grant(operation), operation: operation) { $0 }, value)
        XCTAssertEqual(try log.events().filter { $0.action == .restore }.count, 1)
        let archives = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.lastPathComponent.hasPrefix("audit.jsonl.unreadable-") }
        XCTAssertEqual(archives.count, 1)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(archives.first)), oldAudit)
    }
    func testCopyAndProviderAuditOnlyTheirFinalOutcomeOnce() async throws {
        let id = try entry()
        let log = AuditLog(clock: clock, url: directory.appendingPathComponent("audit.jsonl"), key: { try self.vault.vaultKey() })
        let board = TestPasteboard()
        let clipboard = ClipboardService(clock: clock, pasteboard: board, vault: vault, audit: log)
        let copy = Operation(kind: .copy, keyId: id)
        try clipboard.copy(id, authorization: grant(copy))
        board.fails = true
        XCTAssertThrowsError(try clipboard.copy(id, authorization: grant(copy)))
        let copies = try log.events().filter { $0.action == .copy }
        XCTAssertEqual(copies.map(\.outcome), [.success, .failure])
        let operation = Operation(kind: .providerRequest, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock")
        _ = try await ProviderRequestExecutor(vault: vault, audit: log).execute(operation: operation, authorization: grant(operation))
        let failure = MockProviderTransport { _ in throw ShieldError.network }
        do {
            _ = try await ProviderRequestExecutor(vault: vault, audit: log, transport: failure).execute(operation: operation, authorization: grant(operation)); XCTFail()
        } catch {}
        let redirect = MockProviderTransport { _ in ProviderResponse(status: 307, headers: [:], body: Data()) }
        do {
            _ = try await ProviderRequestExecutor(vault: vault, audit: log, transport: redirect).execute(operation: operation, authorization: grant(operation)); XCTFail()
        } catch {}
        let requests = try log.events().filter { $0.action == .providerRequest }
        XCTAssertEqual(requests.map(\.outcome), [.success, .failure, .failure])
        let reveal = Operation(kind: .reveal, keyId: id)
        XCTAssertThrowsError(try vault.withSecret(id, authorization: grant(reveal), operation: reveal) { _ in throw ShieldError.storage })
        _ = try vault.withSecret(id, authorization: grant(reveal), operation: reveal) { $0.count }
        XCTAssertEqual(try log.events().filter { $0.action == .reveal }.map(\.outcome), [.failure, .success])
    }
    func testProviderReflectionIsHumanRedactedAndAgentMetadataOnly() async throws {
        let id = try entry(), token = try token(id), secret = value
        let raw = Data(secret.utf8)
        let forms = [secret, raw.base64EncodedString(), raw.map { String(format: "%02x", $0) }.joined(), raw.map { String(format: "%02X", $0) }.joined()]
        let transport = MockProviderTransport { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + secret)
            return ProviderResponse(status: 200, headers: ["Echo": forms.joined()], body: Data(forms.joined().utf8))
        }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, transport: transport)
        let agent = try await executor.execute(token: token, keyId: id, method: "POST", url: url)
        let encoded = try JSONEncoder().encode(agent)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["status", "outcome", "byteCount", "correlationId"])
        XCTAssertEqual(agent.status, 200); XCTAssertEqual(agent.outcome, .success)
        XCTAssertGreaterThan(agent.byteCount, 0)
        XCTAssertEqual(try audit.events().last?.correlationId, agent.correlationId)
        let op = Operation(kind: .providerRequest, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock")
        let human = try await executor.execute(operation: op, authorization: grant(op))
        for form in forms {
            XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains(form))
            XCTAssertFalse(String(decoding: human.body, as: UTF8.self).contains(form))
            XCTAssertFalse(human.headers.values.contains(where: { $0.contains(form) }))
        }
        XCTAssertTrue(String(decoding: human.body, as: UTF8.self).contains("[REDACTED]"))
    }
    func testMockProviderFailureDoesNotRetry() async throws {
        let id = try entry(), token = try token(id)
        var calls = 0
        let transport = MockProviderTransport { _ in calls += 1; throw URLError(.notConnectedToInternet) }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, transport: transport)
        do { _ = try await executor.execute(token: token, keyId: id, method: "POST", url: url); XCTFail() } catch {}
        XCTAssertEqual(calls, 1)
    }
    func testProviderRedirectStatusRejected() async throws {
        let id = try entry(), token = try token(id)
        let transport = MockProviderTransport { _ in ProviderResponse(status: 307, headers: ["Location": "https://evil.test/collect"], body: Data()) }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, transport: transport)
        do { _ = try await executor.execute(token: token, keyId: id, method: "POST", url: url); XCTFail() } catch {}
    }
    func testProviderRefusesEveryNonMockHostBeforeTransport() async throws {
        let id = try entry()
        var calls = 0
        let transport = MockProviderTransport { _ in calls += 1; return ProviderResponse(status: 200, headers: [:], body: Data()) }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, transport: transport)
        for host in ["api.openai.com", "api.anthropic.com", "localhost", "127.0.0.1", "other.test", "api.provider.test.evil.test"] {
            let op = Operation(kind: .providerRequest, keyId: id, host: host, method: "POST", path: "/v1/mock")
            do { _ = try await executor.execute(operation: op, authorization: grant(op)); XCTFail(host) } catch {}
            let request = URLRequest(url: URL(string: "https://" + host + "/v1/mock")!)
            XCTAssertThrowsError(try transport.send(request))
        }
        let op = Operation(kind: .agentToken, keyId: id, host: "api.openai.com", method: "POST", path: "/v1/mock")
        let realHostToken = try sessions.issue(operation: op, authorization: grant(op))
        do { _ = try await executor.execute(token: realHostToken, keyId: id, method: "POST", url: URL(string: "https://api.openai.com/v1/mock")!); XCTFail() } catch {}
        XCTAssertEqual(calls, 0)
        let simulated = try await ProviderRequestExecutor(vault: vault, audit: audit).execute(token: token(id), keyId: id, method: "POST", url: url)
        XCTAssertEqual(simulated.status, 200)
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
        approvals.deny(challenge.id)
        let freshOperation = Operation(kind: .reveal, keyId: UUID())
        let fresh = try approvals.begin(freshOperation)
        XCTAssertNil(fresh.code)
        XCTAssertEqual(approvals.codeLockoutRemaining, 120)
        XCTAssertThrowsError(try approvals.approve(fresh.id, code: "000000", operation: freshOperation))
        let freshAuthorization = try await approvals.approveBiometrically(fresh.id, operation: freshOperation, authorizer: TestBiometrics(accepted: true))
        try freshAuthorization.consume(for: freshOperation)
        XCTAssertThrowsError(try freshAuthorization.consume(for: freshOperation))
        let denied = try approvals.begin(op)
        approvals.deny(denied.id)
        do {
            _ = try await approvals.approveBiometrically(denied.id, operation: op, authorizer: TestBiometrics(accepted: true)); XCTFail()
        } catch {}
        XCTAssertNil(try approvals.begin(op).code)
    }
    func testDeviceOnlyApprovalIssuesNoCodeAndRemainsSingleUse() async throws {
        let op = Operation(kind: .copy, keyId: UUID())
        let id = try approvals.beginDeviceApproval(op)
        XCTAssertThrowsError(try approvals.approve(id, code: "000000", operation: op))
        let authorization = try await approvals.approveBiometrically(id, operation: op, authorizer: TestBiometrics(accepted: true))
        try authorization.consume(for: op)
        XCTAssertThrowsError(try authorization.consume(for: op))
        let denied = try approvals.beginDeviceApproval(op)
        approvals.deny(denied)
        do { _ = try await approvals.approveBiometrically(denied, operation: op, authorizer: TestBiometrics(accepted: true)); XCTFail() } catch {}
        let expired = try approvals.beginDeviceApproval(op)
        clock.advance(policy.codeTTL)
        do { _ = try await approvals.approveBiometrically(expired, operation: op, authorizer: TestBiometrics(accepted: true)); XCTFail() } catch {}
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
        var calls = 0
        let transport = MockProviderTransport { request in
            calls += 1
            XCTAssertEqual(request.httpMethod, "POST")
            return ProviderResponse(status: 204, headers: [:], body: Data())
        }
        let executor = ProviderRequestExecutor(vault: vault, audit: audit, transport: transport)
        let response = try await executor.execute(operation: op, authorization: authorization)
        XCTAssertTrue(response.body.isEmpty); XCTAssertEqual(calls, 1)
        do { _ = try await executor.execute(operation: op, authorization: authorization); XCTFail() } catch {}
        XCTAssertEqual(calls, 1)
        let invalid = Operation(kind: .providerRequest, keyId: id, host: "evil.test", method: "POST", path: "/v1/mock")
        do { _ = try await executor.execute(operation: invalid, authorization: grant(invalid)); XCTFail() } catch {}
        XCTAssertEqual(calls, 1)
    }
}
