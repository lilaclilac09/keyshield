import Foundation
import LocalAuthentication

struct Operation: Equatable, Codable {
    enum Kind: String, Codable { case copy, reveal, providerRequest, agentToken }
    let kind: Kind
    let keyId: UUID
    var host: String? = nil
    var method: String? = nil
    var path: String? = nil
}

final class Authorization {
    let operation: Operation
    private let expires: Date
    private let clock: Clock
    private var used = false
    fileprivate init(operation: Operation, expires: Date, clock: Clock) {
        self.operation = operation; self.expires = expires; self.clock = clock
    }
    func consume(for operation: Operation) throws {
        guard !used else { throw ShieldError.denied }
        used = true
        guard self.operation == operation, clock.now < expires else { throw ShieldError.denied }
    }
}

protocol ApprovalStateStore {
    func read() throws -> Data?
    func write(_ data: Data) throws
}
struct DefaultsApprovalStateStore: ApprovalStateStore {
    var defaults: UserDefaults = .standard
    func read() throws -> Data? { defaults.data(forKey: "KeyShield.approval-state") }
    func write(_ data: Data) throws { defaults.set(data, forKey: "KeyShield.approval-state") }
}

protocol BiometricAuthorizer { func approve(_ operation: Operation) async throws -> Bool }
struct DeviceBiometricAuthorizer: BiometricAuthorizer {
    func approve(_ operation: Operation) async throws -> Bool {
        let context = LAContext()
        return try await context.evaluatePolicy(.deviceOwnerAuthentication,
            localizedReason: "Approve \(operation.kind.rawValue) for key \(operation.keyId)\n\(operation.method ?? "") \(operation.host ?? "")\(operation.path ?? "")")
    }
}

final class ApprovalCenter {
    private struct State: Codable { var attempts = 0; var lockoutUntil: Date? }
    private struct Pending { let operation: Operation; let code: String?; let expires: Date }
    private let clock: Clock
    private let policy: Policy
    private let store: ApprovalStateStore
    private let lock: LockManager
    private var state: State
    private var pending: [UUID: Pending] = [:]
    private var biometricPending: [UUID: Pending] = [:]
    init(clock: Clock = SystemClock(), policy: Policy = Policy(), store: ApprovalStateStore = DefaultsApprovalStateStore(), lock: LockManager) throws {
        self.clock = clock; self.policy = policy; self.store = store; self.lock = lock
        state = try store.read().map { try JSONDecoder().decode(State.self, from: $0) } ?? State()
    }
    private func check() throws {
        try lock.requireUnlocked()
        if let until = state.lockoutUntil {
            guard clock.now >= until else { throw ShieldError.denied }
            state = State(); try persist()
        }
    }
    private func persist() throws { try store.write(JSONEncoder().encode(state)) }
    func beginDeviceApproval(_ operation: Operation) throws -> UUID {
        try lock.requireUnlocked()
        let id = UUID()
        biometricPending[id] = Pending(operation: operation, code: nil, expires: clock.now.addingTimeInterval(policy.codeTTL))
        return id
    }
    var codeLockoutRemaining: Int {
        guard let until = state.lockoutUntil else { return 0 }
        return max(0, Int(ceil(until.timeIntervalSince(clock.now))))
    }
    func begin(_ operation: Operation) throws -> (id: UUID, code: String?) {
        try lock.requireUnlocked()
        if codeLockoutRemaining == 0 { try check() }
        let id = UUID(), code = codeLockoutRemaining == 0 ? try SecureRandom.code() : nil
        let item = Pending(operation: operation, code: code, expires: clock.now.addingTimeInterval(policy.codeTTL))
        if code != nil { pending[id] = item }
        biometricPending[id] = item
        return (id, code)
    }
    func deny(_ id: UUID) { pending.removeValue(forKey: id); biometricPending.removeValue(forKey: id) }
    func approve(_ id: UUID, code: String, operation: Operation) throws -> Authorization {
        try check()
        guard let item = pending[id] else { throw ShieldError.denied }
        guard clock.now < item.expires, item.operation == operation else {
            deny(id); throw ShieldError.denied
        }
        guard code == item.code else {
            state.attempts += 1
            if state.attempts >= policy.codeAttemptLimit {
                state.lockoutUntil = clock.now.addingTimeInterval(policy.lockout); pending.removeAll()
            }
            try persist(); throw ShieldError.denied
        }
        deny(id)
        state.attempts = 0; try persist()
        return Authorization(operation: operation, expires: item.expires, clock: clock)
    }
    func approveBiometrically(_ id: UUID, operation: Operation, authorizer: BiometricAuthorizer) async throws -> Authorization {
        try lock.requireUnlocked()
        let item = biometricPending[id]
        deny(id)
        guard let item, item.operation == operation, clock.now < item.expires else { throw ShieldError.denied }
        guard try await authorizer.approve(operation) else { throw ShieldError.denied }
        try lock.requireUnlocked()
        guard clock.now < item.expires else { throw ShieldError.expired }
        return Authorization(operation: operation, expires: item.expires, clock: clock)
    }
}
