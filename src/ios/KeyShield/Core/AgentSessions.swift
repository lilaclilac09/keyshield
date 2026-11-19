import Foundation

struct SessionMetadata {
    let id: UUID
    let keyId: UUID
    let host: String
    let method: String
    let path: String
    let expires: Date
}

final class AgentSessions {
    private let clock: Clock
    private let policy: Policy
    private let lock: LockManager
    private var sessions: [String: SessionMetadata] = [:]
    init(clock: Clock = SystemClock(), policy: Policy = Policy(), lock: LockManager) {
        self.clock = clock; self.policy = policy; self.lock = lock
    }
    func issue(operation: Operation, authorization: Authorization) throws -> String {
        try lock.requireUnlocked()
        guard operation.kind == .agentToken, let host = operation.host, policy.approvedProviders.contains(host),
              let method = operation.method, !method.isEmpty, let path = operation.path, path.hasPrefix("/"), !path.contains("?") else { throw ShieldError.invalid }
        try authorization.consume(for: operation)
        let token = "ks_sess_" + (try SecureRandom.bytes(32)).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        sessions[token] = SessionMetadata(id: UUID(), keyId: operation.keyId, host: host, method: method, path: path, expires: clock.now.addingTimeInterval(policy.sessionTTL))
        return token
    }
    func validate(_ token: String, method: String, url: URL, keyId: UUID? = nil) throws -> SessionMetadata {
        try lock.requireUnlocked()
        guard let session = sessions[token], clock.now < session.expires,
              url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              url.host == session.host, policy.approvedProviders.contains(session.host),
              method == session.method, url.path == session.path, url.query == nil, url.fragment == nil,
              keyId == nil || keyId == session.keyId else { throw ShieldError.denied }
        return session
    }
    func revoke(_ token: String) { sessions.removeValue(forKey: token) }
    func isApprovedHost(_ host: String) -> Bool { policy.approvedProviders.contains(host) }
    func revokeAll(keyId: UUID) { sessions = sessions.filter { $0.value.keyId != keyId } }
    func revokeAll() { sessions.removeAll() }
}
