import Foundation
import CryptoKit

struct VaultEntry: Codable, Equatable {
    let id: UUID
    var label: String
    var provider: String
    var version: Int
    let createdAt: Date
    var updatedAt: Date
    var fingerprint: String
}
struct StoredEntry: Codable { var metadata: VaultEntry; var ciphertext: Data }
enum DuplicateResolution { case reject, replace, keepBoth }
enum SaveResult: Equatable { case saved(UUID), duplicate(UUID) }

final class VaultStore {
    let clock: Clock
    let lock: LockManager
    let keyStore: VaultKeyStore
    let location: VaultLocation
    let sessions: AgentSessions
    private var url: URL { location.directory.appendingPathComponent("vault.json") }
    private func audit(_ action: AuditEvent.Action, id: UUID? = nil) throws {
        try AuditLog(clock: clock, url: location.directory.appendingPathComponent("audit.jsonl"), key: { try self.vaultKey() })
            .append(actor: .human, action: action, keyId: id, outcome: .success)
    }
    init(clock: Clock = SystemClock(), lock: LockManager, keyStore: VaultKeyStore = KeychainVaultKeyStore(), location: VaultLocation = ApplicationSupportLocation(), sessions: AgentSessions) {
        self.clock = clock; self.lock = lock; self.keyStore = keyStore; self.location = location; self.sessions = sessions
    }
    func createVault() throws {
        try lock.requireUnlocked()
        guard !FileManager.default.fileExists(atPath: url.path) else { throw ShieldError.duplicate }
        if try keyStore.load() == nil { try keyStore.save(SecureRandom.bytes(32)) }
        try commit([])
        try audit(.create)
    }
    func vaultKey() throws -> Data {
        try lock.requireUnlocked()
        guard let key = try keyStore.load(), key.count == 32 else { throw ShieldError.missing }
        return key
    }
    func records() throws -> [StoredEntry] {
        let key = try vaultKey()
        guard FileManager.default.fileExists(atPath: url.path) else { throw ShieldError.missing }
        return try JSONDecoder().decode([StoredEntry].self, from: Cipher.open(Data(contentsOf: url), key: key))
    }
    func commit(_ records: [StoredEntry]) throws {
        try Cipher.write(Cipher.seal(JSONEncoder().encode(records), key: vaultKey()), to: url)
    }
    private func fingerprint(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }
    func list() throws -> [VaultEntry] { try records().map(\.metadata) }
    func save(label: String, value: String, resolution: DuplicateResolution = .reject) throws -> SaveResult {
        try lock.requireUnlocked()
        guard value.hasPrefix("FAKE_KEYSHIELD_NOT_A_KEY::"), let detection = KeyDetector().detect(value), !label.isEmpty else { throw ShieldError.invalid }
        var entries = try records()
        let key = try vaultKey()
        let duplicate = try entries.firstIndex {
            if $0.metadata.label == label { return true }
            return try Cipher.open($0.ciphertext, key: key) == Data(value.utf8)
        }
        if let index = duplicate {
            switch resolution {
            case .reject: return .duplicate(entries[index].metadata.id)
            case .replace:
                let id = entries[index].metadata.id
                entries[index].metadata.label = label
                entries[index].metadata.provider = detection.provider
                entries[index].metadata.version += 1
                entries[index].metadata.updatedAt = clock.now
                entries[index].metadata.fingerprint = fingerprint(value)
                entries[index].ciphertext = try Cipher.seal(Data(value.utf8), key: key)
                try commit(entries); sessions.revokeAll(keyId: id); try audit(.rotate, id: id)
                return .saved(id)
            case .keepBoth: break
            }
        }
        let entry = VaultEntry(id: UUID(), label: label, provider: detection.provider, version: 1, createdAt: clock.now, updatedAt: clock.now, fingerprint: fingerprint(value))
        entries.append(StoredEntry(metadata: entry, ciphertext: try Cipher.seal(Data(value.utf8), key: key)))
        try commit(entries)
        try audit(.save, id: entry.id)
        return .saved(entry.id)
    }
    func rotate(_ id: UUID, value: String) throws {
        guard value.hasPrefix("FAKE_KEYSHIELD_NOT_A_KEY::"), let detection = KeyDetector().detect(value) else { throw ShieldError.invalid }
        var entries = try records()
        guard let i = entries.firstIndex(where: { $0.metadata.id == id }) else { throw ShieldError.missing }
        entries[i].metadata.version += 1; entries[i].metadata.updatedAt = clock.now
        entries[i].metadata.provider = detection.provider; entries[i].metadata.fingerprint = fingerprint(value)
        entries[i].ciphertext = try Cipher.seal(Data(value.utf8), key: vaultKey())
        try commit(entries); sessions.revokeAll(keyId: id); try audit(.rotate, id: id)
    }
    func delete(_ id: UUID) throws {
        var entries = try records()
        guard entries.contains(where: { $0.metadata.id == id }) else { throw ShieldError.missing }
        entries.removeAll { $0.metadata.id == id }
        try commit(entries); sessions.revokeAll(keyId: id); try audit(.delete, id: id)
    }
    func withSecret<T>(_ id: UUID, authorization: Authorization, operation: Operation, body: (String) throws -> T) throws -> T {
        try lock.requireUnlocked()
        guard operation.keyId == id, operation.kind != .agentToken else { throw ShieldError.denied }
        try authorization.consume(for: operation)
        let result = try secret(id, body: body)
        try audit(operation.kind == .copy ? .copy : operation.kind == .providerRequest ? .providerRequest : .reveal, id: id)
        return result
    }
    private func secret<T>(_ id: UUID, body: (String) throws -> T) throws -> T {
        guard let entry = try records().first(where: { $0.metadata.id == id }),
              let value = String(data: try Cipher.open(entry.ciphertext, key: vaultKey()), encoding: .utf8) else { throw ShieldError.missing }
        return try body(value)
    }
    func withProviderSecret<T>(_ id: UUID, token: String, method: String, url: URL, body: (String) throws -> T) throws -> T {
        _ = try sessions.validate(token, method: method, url: url, keyId: id)
        return try secret(id, body: body)
    }
}
