import Foundation

struct DemoPaymentReceipt: Decodable, Identifiable {
    enum Actor: String, Decodable, CaseIterable { case human = "Human", agent = "Agent" }
    let id: String
    let isDemo: Bool
    let provider: String
    let endpoint: URL
    let method: String
    let amount: String
    let asset: String
    let timestamp: Date
    let status: String
    let actor: Actor
    let wallet: String
    let agent: String
    let session: String
    let sku: String
    let category: String
    let rail: String
    let portal: String
    let callKind: String
    let detail: String
    let potentialUse: String
    let whatChanged: String
    let proof: Proof

    struct Proof: Decodable {
        let network: String
        let owner: String
        let openTransaction: String?
        let settleTransaction: String?
        let openSlot: Int?
        let settleSlot: Int?
        let computeUnits: Int?
        let settlementError: String?
        let stream: String?
        let escrowAccount: String?
        let captureMicroUnits: Int?
        let ownerBefore: String?
        let ownerAfter: String?
        let escrowBefore: String?
        let escrowAfter: String?
        let platformBefore: String?
        let platformAfter: String?
        let scheme: String?
        let payTo: String?
        let facilitator: URL?
    }
}

struct DemoPaymentGroup: Identifiable {
    let actor: DemoPaymentReceipt.Actor
    let wallet: String
    let receipts: [DemoPaymentReceipt]
    var id: String { actor.rawValue + ":" + wallet }
}

struct DemoPaymentsLedger {
    enum LedgerError: Error { case nonSyntheticReceipt }
    let receipts: [DemoPaymentReceipt]
    init() { receipts = [] }
    init(data: Data) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([DemoPaymentReceipt].self, from: data)
        guard Set(decoded.map(\.id)).count == decoded.count,
              decoded.allSatisfy({ receipt in
                  let proof = receipt.proof
                  let references = [receipt.wallet, proof.owner, proof.openTransaction,
                                    proof.settleTransaction, proof.stream, proof.escrowAccount, proof.payTo].compactMap { $0 }
                  let endpoints = [receipt.endpoint, proof.facilitator].compactMap { $0 }
                  return receipt.isDemo && receipt.id.hasPrefix("demo_")
                      && receipt.agent.hasPrefix("demo_") && receipt.session.hasPrefix("demo_")
                      && receipt.asset.hasPrefix("DEMO_") && receipt.status.hasPrefix("Simulated")
                      && Decimal(string: receipt.amount, locale: Locale(identifier: "en_US_POSIX")) != nil
                      && references.allSatisfy { $0.hasPrefix("DEMO_") }
                      && endpoints.allSatisfy { $0.scheme == "https" && $0.host?.hasSuffix(".test") == true && $0.user == nil && $0.password == nil }
              }) else { throw LedgerError.nonSyntheticReceipt }
        receipts = decoded.sorted { $0.timestamp == $1.timestamp ? $0.id < $1.id : $0.timestamp > $1.timestamp }
    }
    var groups: [DemoPaymentGroup] {
        DemoPaymentReceipt.Actor.allCases.flatMap { actor in
            let rows = receipts.filter { $0.actor == actor }
            return Set(rows.map(\.wallet)).sorted().map { wallet in
                DemoPaymentGroup(actor: actor, wallet: wallet, receipts: rows.filter { $0.wallet == wallet })
            }
        }
    }
    static func demo() throws -> DemoPaymentsLedger { try DemoPaymentsLedger(data: demoJSON) }
    static let demoJSON = Data("""
    [
      {
        "id": "demo_receipt_mpp_001", "isDemo": true,
        "provider": "Demo Metered API", "endpoint": "https://api.mpp-provider.test/v1/demo", "method": "POST",
        "amount": "123.456789", "asset": "DEMO_USDC", "timestamp": "2030-01-02T12:00:00Z", "status": "Simulated settled",
        "actor": "Human", "wallet": "DEMO_HUMAN_WALLET", "agent": "demo_agent_none", "session": "demo_session_human",
        "sku": "Demo metered calls", "category": "On-chain MPP (demo)", "rail": "MPP (simulated)",
        "portal": "Demo MPP portal", "callKind": "Simulated capture", "detail": "Illustrative receipt only; no chain transaction exists.",
        "potentialUse": "Shows where a metered API capture would appear.", "whatChanged": "Nothing. All balances below are fictional.",
        "proof": {
          "network": "DEMO network — no chain", "owner": "DEMO_HUMAN_WALLET",
          "openTransaction": "DEMO_OPEN_TX", "settleTransaction": "DEMO_SETTLE_TX", "openSlot": 42, "settleSlot": 43,
          "computeUnits": 123, "settlementError": "None (simulated)", "stream": "DEMO_STREAM", "escrowAccount": "DEMO_ESCROW_ACCOUNT",
          "captureMicroUnits": 123456789, "ownerBefore": "999.000000", "ownerAfter": "999.000000",
          "escrowBefore": "999.000000", "escrowAfter": "875.543211", "platformBefore": "0.000000", "platformAfter": "123.456789"
        }
      },
      {
        "id": "demo_receipt_x402_002", "isDemo": true,
        "provider": "Demo Research API", "endpoint": "https://research.provider.test/v1/report", "method": "GET",
        "amount": "0.004242", "asset": "DEMO_USDC", "timestamp": "2030-01-02T11:00:00Z", "status": "Simulated declined",
        "actor": "Agent", "wallet": "DEMO_AGENT_WALLET", "agent": "demo_agent_research", "session": "demo_session_research",
        "sku": "Demo research report", "category": "x402 (demo)", "rail": "x402 (simulated)",
        "portal": "Demo x402 portal", "callKind": "Simulated HTTP 402", "detail": "No request was sent and no payment was attempted.",
        "potentialUse": "Shows where an agent-scoped x402 receipt would appear.", "whatChanged": "Nothing. No wallet was connected or charged.",
        "proof": { "network": "DEMO network — no chain", "owner": "DEMO_AGENT_WALLET", "scheme": "Demo exact",
                   "payTo": "DEMO_PAYEE", "facilitator": "https://facilitator.provider.test/demo" }
      }
    ]
    """.utf8)
}
