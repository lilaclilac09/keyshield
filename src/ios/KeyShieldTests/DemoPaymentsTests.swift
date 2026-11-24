import XCTest
@testable import KeyShield

private final class PaymentsTransportTrap: URLProtocol {
    static var requests = 0
    override class func canInit(with request: URLRequest) -> Bool { requests += 1; return true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        XCTFail("A demo ledger must not request a transport")
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }
    override func stopLoading() {}
}

final class DemoPaymentsTests: XCTestCase {
    func testDefaultAndDecodedEmptyLedgersHaveNoReceipts() throws {
        XCTAssertTrue(DemoPaymentsLedger().receipts.isEmpty)
        XCTAssertTrue(DemoPaymentsLedger().groups.isEmpty)
        XCTAssertTrue(try DemoPaymentsLedger(data: Data("[]".utf8)).receipts.isEmpty)
    }
    func testStaticLedgerDecodesOnlySyntheticReceiptsAndProofs() throws {
        let ledger = try DemoPaymentsLedger.demo()
        XCTAssertEqual(ledger.receipts.count, 2)
        for receipt in ledger.receipts {
            XCTAssertTrue(receipt.isDemo)
            XCTAssertTrue(receipt.id.hasPrefix("demo_"))
            XCTAssertTrue(receipt.endpoint.host?.hasSuffix(".test") == true)
            XCTAssertTrue(receipt.asset.hasPrefix("DEMO_"))
            XCTAssertTrue(receipt.status.hasPrefix("Simulated"))
            XCTAssertTrue(receipt.wallet.hasPrefix("DEMO_"))
            XCTAssertTrue(receipt.agent.hasPrefix("demo_"))
            XCTAssertTrue(receipt.session.hasPrefix("demo_"))
            XCTAssertFalse(receipt.sku.isEmpty)
            XCTAssertFalse(receipt.rail.isEmpty)
            XCTAssertFalse(receipt.whatChanged.isEmpty)
        }
        let mpp = try XCTUnwrap(ledger.receipts.first)
        XCTAssertEqual(mpp.proof.captureMicroUnits, 123456789)
        XCTAssertEqual(mpp.proof.openTransaction, "DEMO_OPEN_TX")
        XCTAssertEqual(mpp.proof.settleTransaction, "DEMO_SETTLE_TX")
        XCTAssertEqual(mpp.proof.escrowAfter, "875.543211")
        let x402 = try XCTUnwrap(ledger.receipts.last)
        XCTAssertEqual(x402.proof.payTo, "DEMO_PAYEE")
        XCTAssertEqual(x402.proof.facilitator?.host, "facilitator.provider.test")
    }
    func testGroupingMirrorsHumanThenAgentAndFullWallet() throws {
        let ledger = try DemoPaymentsLedger.demo()
        XCTAssertEqual(ledger.groups.map(\.actor), [.human, .agent])
        XCTAssertEqual(ledger.groups.map(\.wallet), ["DEMO_HUMAN_WALLET", "DEMO_AGENT_WALLET"])
        XCTAssertEqual(ledger.groups.flatMap(\.receipts).map(\.id), ledger.receipts.map(\.id))
    }
    func testRejectsMalformedAndNonSyntheticFixtures() throws {
        XCTAssertThrowsError(try DemoPaymentsLedger(data: Data("not JSON".utf8)))
        let fixtures = try XCTUnwrap(JSONSerialization.jsonObject(with: DemoPaymentsLedger.demoJSON) as? [[String: Any]])
        for (field, value) in [("isDemo", false as Any), ("id", "real_receipt"),
                               ("endpoint", "https://api.provider.com/v1/pay"), ("asset", "USDC"),
                               ("wallet", "unmarked_wallet"), ("agent", "unmarked_agent"),
                               ("session", "unmarked_session"), ("amount", "not an amount"), ("status", "Paid")] {
            var invalid = fixtures
            invalid[0][field] = value
            XCTAssertThrowsError(try DemoPaymentsLedger(data: JSONSerialization.data(withJSONObject: invalid)), field)
        }
        XCTAssertThrowsError(try DemoPaymentsLedger(data: JSONSerialization.data(withJSONObject: [fixtures[0], fixtures[0]])))
        var invalid = fixtures
        var proof = try XCTUnwrap(invalid[0]["proof"] as? [String: Any])
        proof["owner"] = "unmarked_owner"
        invalid[0]["proof"] = proof
        XCTAssertThrowsError(try DemoPaymentsLedger(data: JSONSerialization.data(withJSONObject: invalid)))
    }
    func testPureDecodingAndGroupingTouchNoTransport() throws {
        PaymentsTransportTrap.requests = 0
        XCTAssertTrue(URLProtocol.registerClass(PaymentsTransportTrap.self))
        defer { URLProtocol.unregisterClass(PaymentsTransportTrap.self) }
        let first = try DemoPaymentsLedger.demo(), second = try DemoPaymentsLedger.demo()
        XCTAssertEqual(first.groups.map(\.id), second.groups.map(\.id))
        XCTAssertEqual(PaymentsTransportTrap.requests, 0)
    }
}
