import Foundation
import CommonCrypto

enum RestoreResult { case restored, restoredWithoutAudit }

final class BackupService {
    private struct Envelope: Codable { let salt: Data; let ciphertext: Data }
    private struct Entry: Codable { let metadata: VaultEntry; let value: Data }
    private let vault: VaultStore
    private let audit: AuditLog
    init(vault: VaultStore, audit: AuditLog) { self.vault = vault; self.audit = audit }
    private func derive(_ passphrase: String, salt: Data) throws -> Data {
        guard !passphrase.isEmpty, salt.count == 16 else { throw ShieldError.invalid }
        let password = Array(passphrase.utf8)
        var output = [UInt8](repeating: 0, count: 32)
        let status = password.withUnsafeBytes { p in salt.withUnsafeBytes { s in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), p.baseAddress!.assumingMemoryBound(to: Int8.self), password.count,
                s.baseAddress!.assumingMemoryBound(to: UInt8.self), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 200_000, &output, 32)
        } }
        guard status == kCCSuccess else { throw ShieldError.storage }
        return Data(output)
    }
    func export(passphrase: String) throws -> Data {
        let key = try vault.vaultKey()
        let entries = try vault.records().map { Entry(metadata: $0.metadata, value: try Cipher.open($0.ciphertext, key: key)) }
        let salt = try SecureRandom.bytes(16)
        let result = try JSONEncoder().encode(Envelope(salt: salt, ciphertext: Cipher.seal(JSONEncoder().encode(entries), key: derive(passphrase, salt: salt))))
        try audit.append(actor: .human, action: .backup, outcome: .success)
        return result
    }
    @discardableResult
    func restore(_ data: Data, passphrase: String) throws -> RestoreResult {
        try vault.lock.requireUnlocked()
        let envelope = try JSONDecoder().decode(Envelope.self, from: data)
        let entries = try JSONDecoder().decode([Entry].self, from: Cipher.open(envelope.ciphertext, key: derive(passphrase, salt: envelope.salt)))
        guard Set(entries.map { $0.metadata.id }).count == entries.count else { throw ShieldError.invalid }
        let existingKey = try vault.keyStore.load()
        let key = try existingKey ?? SecureRandom.bytes(32)
        let records = try entries.map { entry -> StoredEntry in
            guard let value = String(data: entry.value, encoding: .utf8), value.hasPrefix("FAKE_KEYSHIELD_NOT_A_KEY::"), KeyDetector().detect(value) != nil else { throw ShieldError.invalid }
            return StoredEntry(metadata: entry.metadata, ciphertext: try Cipher.seal(entry.value, key: key))
        }
        if existingKey == nil {
            try vault.keyStore.save(key)
            try audit.archiveUnreadableLog()
        }
        try vault.commit(records)
        vault.sessions.revokeAll()
        do { try audit.append(actor: .human, action: .restore, outcome: .success) }
        catch { return .restoredWithoutAudit }
        return .restored
    }
}
