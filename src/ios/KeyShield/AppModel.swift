import SwiftUI
import LocalAuthentication

#if DEBUG
private final class EphemeralKeys: VaultKeyStore {
    private var key: Data?
    func load() throws -> Data? { key }
    func save(_ key: Data) throws { self.key = key }
}
private final class EphemeralApprovalState: ApprovalStateStore {
    private var data: Data?
    func read() throws -> Data? { data }
    func write(_ data: Data) throws { self.data = data }
}
private struct TestVaultLocation: VaultLocation { let directory: URL }
private struct UITestBiometrics: BiometricAuthorizer {
    func approve(_ operation: Operation) async throws -> Bool { true }
}
#endif

struct DisplayApproval: Identifiable {
    let id: UUID
    let operation: Operation
    let expires: Date
}
struct DisplaySession: Identifiable {
    let id = UUID()
    let keyId: UUID
    let token: String
    let expires: Date
    var revoked = false
}

@MainActor
final class AppModel: ObservableObject {
    let clock: Clock = SystemClock()
    let policy: Policy
    let lock: LockManager
    let vault: VaultStore
    let sessions: AgentSessions
    let audit: AuditLog
    let backup: BackupService
    let clipboard: ClipboardService
    private let approvals: ApprovalCenter?
    #if DEBUG
    let testMode: Bool
    #endif
    @Published var created: Bool
    @Published var unlocked = false
    @Published var entries: [VaultEntry] = []
    @Published var events: [AuditEvent] = []
    @Published var activeSessions: [DisplaySession] = []
    @Published var pendingAgent: UUID?
    @Published var approval: DisplayApproval?
    @Published var error: String?
    @Published var now = Date()
    @Published var revealed: [UUID: String] = [:]
    private var revealExpiry: [UUID: Date] = [:]
    @Published var clipboardExpires: Date?
    @Published var backupURL: URL?
    @Published var activityURL: URL?
    @Published var notice: String?

    init() {
        #if DEBUG
        let testing = ProcessInfo.processInfo.arguments.contains("-UITestMode")
        testMode = testing
        #endif
        var rules = Policy()
        rules.approvedProviders.append("api.provider.test")
        policy = rules
        let manager = LockManager(policy: rules)
        lock = manager
        let agents = AgentSessions(policy: rules, lock: manager)
        sessions = agents
        #if DEBUG
        let location: VaultLocation = testing
            ? TestVaultLocation(directory: FileManager.default.temporaryDirectory.appendingPathComponent("KeyShieldUITest-" + UUID().uuidString))
            : ApplicationSupportLocation()
        let keyStore: VaultKeyStore = testing ? EphemeralKeys() : KeychainVaultKeyStore()
        let approvalStore: ApprovalStateStore = testing ? EphemeralApprovalState() : DefaultsApprovalStateStore()
        #else
        let location: VaultLocation = ApplicationSupportLocation()
        let keyStore: VaultKeyStore = KeychainVaultKeyStore()
        let approvalStore: ApprovalStateStore = DefaultsApprovalStateStore()
        #endif
        let store = VaultStore(lock: manager, keyStore: keyStore, location: location, sessions: agents)
        vault = store
        let log = AuditLog(url: location.directory.appendingPathComponent("audit.jsonl"), key: { try store.vaultKey() })
        audit = log
        backup = BackupService(vault: store, audit: log)
        clipboard = ClipboardService(policy: rules, vault: store, audit: log)
        created = FileManager.default.fileExists(atPath: location.directory.appendingPathComponent("vault.json").path)
        do {
            approvals = try ApprovalCenter(policy: rules, store: approvalStore, lock: manager)
        } catch {
            approvals = nil
            self.error = "Approval storage could not be loaded. Access is disabled."
        }
    }

    func perform(_ work: () throws -> Void) {
        do { try work(); error = nil } catch { self.error = "Operation failed. No sensitive details were recorded." }
    }
    func create() {
        perform {
            lock.unlock()
            do { try vault.createVault() } catch { lock.lock(); throw error }
            created = true; unlocked = true; refresh()
        }
    }
    func unlock() async {
        do {
            let accepted: Bool
            #if DEBUG
            if testMode { accepted = true }
            else {
                accepted = try await LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your KeyShield vault")
            }
            #else
            accepted = try await LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your KeyShield vault")
            #endif
            guard accepted else { throw ShieldError.denied }
            lock.unlock(); unlocked = true; notice = nil; refresh()
        } catch { self.error = "Unlock was not approved. Try Face ID / passcode again." }
    }
    func lockNow(expired: Bool = false) {
        lock.lock(); sessions.revokeAll()
        for i in activeSessions.indices { activeSessions[i].revoked = true }
        if let approval { approvals?.deny(approval.id) }
        approval = nil; revealed.removeAll(); revealExpiry.removeAll()
        entries = []; events = []; clipboardExpires = nil
        backupURL = nil; activityURL = nil
        unlocked = false; error = nil
        notice = expired ? "Your session expired. Unlock to continue." : "Your vault is locked."
    }
    func touch() { if unlocked { try? lock.requireUnlocked() } }
    func tick() {
        now = clock.now
        guard unlocked else { return }
        if lock.isLocked { lockNow(expired: true); return }
        for (id, expiry) in revealExpiry where now >= expiry { revealed[id] = nil; revealExpiry[id] = nil }
        do { try clipboard.clearIfExpired() } catch { self.error = "Clipboard could not be cleared. Clear it manually." }
    }
    func refresh() {
        guard unlocked else { return }
        do { entries = try vault.list(); events = try audit.events() }
        catch { self.error = "Vault or activity could not be read." }
    }
    func save(label: String, value: String, resolution: DuplicateResolution = .reject) throws -> SaveResult {
        let result = try vault.save(label: label, value: value, resolution: resolution)
        refresh(); return result
    }
    func rotate(_ id: UUID, value: String) throws {
        try vault.rotate(id, value: value)
        revealed[id] = nil; revealExpiry[id] = nil
        for i in activeSessions.indices where activeSessions[i].keyId == id { activeSessions[i].revoked = true }
        refresh()
    }
    func delete(_ id: UUID) {
        perform {
            try vault.delete(id); revealed[id] = nil; revealExpiry[id] = nil
            for i in activeSessions.indices where activeSessions[i].keyId == id { activeSessions[i].revoked = true }
            refresh()
        }
    }
    func request(_ operation: Operation) {
        perform {
            guard let approvals else { throw ShieldError.storage }
            let id = try approvals.beginDeviceApproval(operation)
            approval = DisplayApproval(id: id, operation: operation, expires: clock.now.addingTimeInterval(policy.codeTTL))
        }
    }
    func denyApproval() {
        if let approval { approvals?.deny(approval.id) }
        approval = nil
    }
    func approveBiometric() async throws {
        guard let approval, let approvals else { throw ShieldError.denied }
        #if DEBUG
        let authorizer: BiometricAuthorizer = testMode ? UITestBiometrics() : DeviceBiometricAuthorizer()
        #else
        let authorizer: BiometricAuthorizer = DeviceBiometricAuthorizer()
        #endif
        let grant = try await approvals.approveBiometrically(approval.id, operation: approval.operation, authorizer: authorizer)
        try complete(grant, operation: approval.operation)
    }
    private func complete(_ grant: Authorization, operation: Operation) throws {
        guard unlocked, !lock.isLocked else { throw ShieldError.locked }
        switch operation.kind {
        case .copy:
            try clipboard.copy(operation.keyId, authorization: grant)
            clipboardExpires = clock.now.addingTimeInterval(policy.clipboardClear)
        case .reveal:
            let value = try vault.withSecret(operation.keyId, authorization: grant, operation: operation) { $0 }
            revealed[operation.keyId] = value
            revealExpiry[operation.keyId] = clock.now.addingTimeInterval(30)
        case .agentToken:
            let token = try sessions.issue(operation: operation, authorization: grant)
            activeSessions.append(DisplaySession(keyId: operation.keyId, token: token, expires: clock.now.addingTimeInterval(policy.sessionTTL)))
            try audit.append(actor: .human, action: .agentToken, keyId: operation.keyId, outcome: .success)
            pendingAgent = nil
        case .providerRequest:
            let executor = ProviderRequestExecutor(vault: vault, audit: audit)
            Task {
                do {
                    let response = try await executor.execute(operation: operation, authorization: grant)
                    self.notice = "Provider response: HTTP \(response.status)"
                } catch { self.error = "Provider request failed. Nothing was retried or queued." }
                self.refresh()
            }
        }
        approval = nil; refresh()
    }
    #if DEBUG
    func simulateAgent() {
        guard let entry = entries.first else { error = "Save a synthetic key first."; return }
        pendingAgent = entry.id
    }
    #endif
    func revoke(_ id: UUID) {
        guard let i = activeSessions.firstIndex(where: { $0.id == id }) else { return }
        sessions.revoke(activeSessions[i].token); activeSessions[i].revoked = true
    }
    func revokeAll() {
        sessions.revokeAll()
        for i in activeSessions.indices { activeSessions[i].revoked = true }
    }
    func exportBackup(passphrase: String) throws {
        let data = try backup.export(passphrase: passphrase)
        let url = vault.location.directory.appendingPathComponent("KeyShield-backup.ksbackup")
        try Cipher.write(data, to: url); backupURL = url; refresh()
    }
    func restore(_ url: URL, passphrase: String) throws -> RestoreResult {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let result = try backup.restore(Data(contentsOf: url), passphrase: passphrase)
        revealed.removeAll(); revealExpiry.removeAll(); revokeAll(); refresh()
        return result
    }
    func exportActivity() {
        perform {
            try lock.requireUnlocked()
            let url = vault.location.directory.appendingPathComponent("KeyShield-activity.json")
            try Cipher.write(JSONEncoder().encode(audit.events()), to: url)
            activityURL = url
        }
    }
}
