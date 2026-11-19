import Foundation
import UIKit

protocol Pasteboard {
    var changeCount: Int { get }
    func write(_ value: String, expires: Date) throws
    func clear() throws
}
struct SystemPasteboard: Pasteboard {
    var changeCount: Int { UIPasteboard.general.changeCount }
    func write(_ value: String, expires: Date) throws {
        UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: value]], options: [.localOnly: true, .expirationDate: expires])
        guard UIPasteboard.general.hasStrings else { throw ShieldError.storage }
    }
    func clear() throws { UIPasteboard.general.items = [] }
}

final class ClipboardService {
    private let clock: Clock
    private let policy: Policy
    private let pasteboard: Pasteboard
    private let vault: VaultStore
    private let audit: AuditLog
    private var copied: (count: Int, expires: Date)?
    private var timer: Timer?
    private(set) var clearFailed = false
    init(clock: Clock = SystemClock(), policy: Policy = Policy(), pasteboard: Pasteboard = SystemPasteboard(), vault: VaultStore, audit: AuditLog) {
        self.clock = clock; self.policy = policy; self.pasteboard = pasteboard; self.vault = vault; self.audit = audit
    }
    deinit { timer?.invalidate() }
    func copy(_ id: UUID, authorization: Authorization) throws {
        let expires = clock.now.addingTimeInterval(policy.clipboardClear)
        try vault.withSecret(id, authorization: authorization, operation: Operation(kind: .copy, keyId: id)) {
            try pasteboard.write($0, expires: expires)
        }
        copied = (pasteboard.changeCount, expires)
        clearFailed = false
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: policy.clipboardClear, repeats: false) { [weak self] _ in
            do { try self?.clearIfExpired() } catch { self?.clearFailed = true }
        }
        try audit.append(actor: .human, action: .copy, keyId: id, outcome: .success)
    }
    func clearIfExpired() throws {
        guard let copied, clock.now >= copied.expires else { return }
        defer { self.copied = nil }
        if pasteboard.changeCount == copied.count {
            do { try pasteboard.clear() }
            catch { clearFailed = true; throw ShieldError.storage }
        }
    }
}
