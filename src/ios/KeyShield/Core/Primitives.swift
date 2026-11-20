import Foundation
import CryptoKit
import Security

protocol Clock { var now: Date { get } }
struct SystemClock: Clock { var now: Date { Date() } }

struct Policy {
    var sessionTTL: TimeInterval = 60
    var codeTTL: TimeInterval = 30
    var codeAttemptLimit = 3
    var lockout: TimeInterval = 120
    var clipboardClear: TimeInterval = 30
    var idleLock: TimeInterval = 60
    var approvedProviders = ["api.openai.com", "api.anthropic.com", "api.github.com", "api.stripe.com"]
}

enum ShieldError: Error { case locked, denied, expired, invalid, duplicate, missing, storage, network, audit }

enum SecureRandom {
    static func bytes(_ count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw ShieldError.storage }
        return Data(bytes)
    }
    static func code() throws -> String {
        // Rejection sampling avoids modulo bias.
        while true {
            let data = try bytes(4)
            let value = data.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
            if value < 4_294_000_000 { return String(format: "%06u", value % 1_000_000) }
        }
    }
}

struct KeyDetector {
    struct Detection { let provider: String; let value: String }
    func detect(_ value: String) -> Detection? {
        let marker = "FAKE_KEYSHIELD_NOT_A_KEY::"
        let inner = value.hasPrefix(marker) ? String(value.dropFirst(marker.count)) : value
        let patterns = [
            ("anthropic", "sk-ant-api03-[A-Za-z0-9_-]{32,}"),
            ("openai", "sk-(?:proj-)?[A-Za-z0-9]{32,}"),
            ("stripe_test", "sk_test_[A-Za-z0-9]{24,}"),
            ("stripe_live_like", "sk_live_[A-Za-z0-9]{24,}"),
            ("github", "ghp_[A-Za-z0-9]{36}"),
            ("aws_access", "AKIA[A-Z0-9]{16}"),
            ("aws_secret", "[A-Za-z0-9/+=]{40}"),
            ("solana", "[1-9A-HJ-NP-Za-km-z]{88}"),
            ("bearer", "Bearer [A-Za-z0-9_-]{32}")
        ]
        for (provider, pattern) in patterns where inner.range(of: "^(?:\(pattern))$", options: .regularExpression) != nil {
            return Detection(provider: provider, value: value)
        }
        return nil
    }
}

final class LockManager {
    private let clock: Clock
    private let policy: Policy
    private var lastActivity: Date?
    init(clock: Clock = SystemClock(), policy: Policy = Policy()) { self.clock = clock; self.policy = policy }
    var isLocked: Bool {
        guard let lastActivity else { return true }
        return clock.now.timeIntervalSince(lastActivity) >= policy.idleLock
    }
    var secondsUntilLock: Int {
        guard let lastActivity else { return 0 }
        return max(0, Int(ceil(policy.idleLock - clock.now.timeIntervalSince(lastActivity))))
    }
    func unlock() { lastActivity = clock.now }
    func lock() { lastActivity = nil }
    func background() { lock() }
    func requireUnlocked() throws {
        guard !isLocked else { lock(); throw ShieldError.locked }
        lastActivity = clock.now
    }
}

protocol VaultKeyStore {
    func load() throws -> Data?
    func save(_ key: Data) throws
}

final class KeychainVaultKeyStore: VaultKeyStore {
    private let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "xyz.aileena.keyshield.ios.vault", kSecAttrAccount as String: "vault-key"]
    func load() throws -> Data? {
        var request = query
        request[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw ShieldError.storage }
        return data
    }
    func save(_ key: Data) throws {
        var request = query
        request[kSecValueData as String] = key
        request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw ShieldError.storage }
    }
}

protocol VaultLocation { var directory: URL { get } }
struct ApplicationSupportLocation: VaultLocation {
    var directory: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("KeyShield") }
}

enum Cipher {
    static func seal(_ data: Data, key: Data) throws -> Data {
        guard key.count == 32, let combined = try AES.GCM.seal(data, using: SymmetricKey(data: key)).combined else { throw ShieldError.storage }
        return combined
    }
    static func open(_ data: Data, key: Data) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: SymmetricKey(data: key))
    }
    static func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}
