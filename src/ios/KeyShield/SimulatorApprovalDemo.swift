#if SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)
import CryptoKit
import Foundation

struct SimulatorApprovalDemo {
    enum Receipt: String { case approved = "Approved" }
    enum Outcome { case notApproved, approved(Receipt) }

    static let requester = "KeyShield Demo Agent"
    static let entryLabel = "Simulator approval fixture"
    static let host = "api.provider.test"
    static let method = "POST"
    static let path = "/v1/mock"
    private static let fixture = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-" + String(repeating: "D", count: 32)

    let entryID: UUID
    private let requesterID = UUID()
    var pendingID: UUID?
    var outcome: Outcome?

    var operation: Operation {
        Operation(kind: .providerRequest, keyId: entryID, host: Self.host, method: Self.method, path: Self.path)
    }

    static func prepareFixture(in vault: VaultStore) throws -> Self {
        let fingerprint = SHA256.hash(data: Data(fixture.utf8)).prefix(8)
            .map { String(format: "%02x", $0) }.joined()
        let id: UUID
        switch try vault.save(label: entryLabel, value: fixture) {
        case let .saved(saved): id = saved
        case let .duplicate(existing): id = existing
        case .ambiguousDuplicate: throw ShieldError.duplicate
        }
        guard try vault.list().contains(where: {
            $0.id == id && $0.label == entryLabel && $0.fingerprint == fingerprint
        }) else { throw ShieldError.invalid }
        return Self(entryID: id)
    }

    func runOnce(authorization: Authorization, vault: VaultStore, audit: AuditLog) throws -> Receipt {
        guard let url = URL(string: "https://\(Self.host)\(Self.path)") else { throw ShieldError.invalid }
        try vault.withSecret(entryID, authorization: authorization, operation: operation) { value in
            guard value == Self.fixture else { throw ShieldError.denied }
            var request = URLRequest(url: url)
            request.httpMethod = Self.method
            guard try MockProviderTransport().send(request).status == 200 else { throw ShieldError.denied }
        }
        try audit.append(actor: .agent(requesterID), action: .providerRequest, keyId: entryID, outcome: .success)
        return .approved
    }
}
#endif
