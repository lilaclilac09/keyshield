import SwiftUI

private struct PaymentsDemoBanner: View {
    var body: some View {
        Text("DEMO — synthetic data, no real payments")
            .font(.callout.bold()).frame(maxWidth: .infinity, alignment: .leading)
            .padding().background(ShieldTheme.accent.opacity(0.18))
            .accessibilityIdentifier("payments.demoBanner")
    }
}

struct PaymentsView: View {
    @State private var ledger = DemoPaymentsLedger()
    @State private var loadError: String?
    var body: some View {
        VStack(spacing: 0) {
            Toggle("Show demo receipts", isOn: Binding(get: { !ledger.receipts.isEmpty }, set: { enabled in
                do { ledger = enabled ? try .demo() : DemoPaymentsLedger(); loadError = nil }
                catch { ledger = DemoPaymentsLedger(); loadError = "Demo receipts could not be loaded. No payments were made." }
            })).padding().accessibilityIdentifier("payments.showDemo")
            if !ledger.receipts.isEmpty { PaymentsDemoBanner() }
            if let loadError { Text(loadError).padding().accessibilityIdentifier("payments.error") }
            if ledger.receipts.isEmpty {
                ContentUnavailableView {
                    Label("No receipts", systemImage: "receipt")
                } description: {
                    Text("The iOS app does not make or record payments yet. Turn on demo receipts to explore synthetic examples.")
                }.accessibilityIdentifier("payments.empty")
            } else {
                List {
                    ForEach(ledger.groups) { group in
                        Section {
                            ForEach(group.receipts) { receipt in
                                NavigationLink { ReceiptDetailView(receipt: receipt) } label: {
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack {
                                            Text(receipt.provider).font(.headline)
                                            Spacer()
                                            Text("DEMO").font(.caption.bold()).foregroundStyle(ShieldTheme.accent)
                                                .accessibilityIdentifier("payments.badge." + receipt.id)
                                        }
                                        Text(receipt.amount + " " + receipt.asset).font(.body.monospaced())
                                        Text(receipt.method + " " + receipt.endpoint.absoluteString).font(.caption)
                                        Text(receipt.status + " · " + receipt.rail).font(.caption)
                                        Text(receipt.timestamp, format: .dateTime.year().month().day().hour().minute()).font(.caption)
                                        Text(receipt.id).font(.caption.monospaced())
                                        Text(receipt.agent + " · " + receipt.session).font(.caption)
                                    }.padding(.vertical, 5)
                                }.accessibilityIdentifier("payments.receipt." + receipt.id)
                            }
                        } header: {
                            VStack(alignment: .leading) {
                                Text(group.actor.rawValue)
                                Text(group.wallet).font(.caption.monospaced())
                            }
                        }
                    }
                }.listStyle(.insetGrouped)
            }
        }.navigationTitle("Payments").navigationBarTitleDisplayMode(.inline)
    }
}

struct ReceiptDetailView: View {
    let receipt: DemoPaymentReceipt
    var body: some View {
        VStack(spacing: 0) {
            PaymentsDemoBanner()
            Form {
                Section("Demo receipt") {
                    field("Receipt ID", receipt.id, id: "id")
                    field("Status", receipt.status, id: "status")
                    field("Provider", receipt.provider, id: "provider")
                    field("Endpoint", receipt.method + " " + receipt.endpoint.absoluteString, id: "endpoint")
                    field("Amount", receipt.amount + " " + receipt.asset, id: "amount")
                    field("Timestamp", receipt.timestamp.formatted(.iso8601), id: "timestamp")
                    field("Purchased SKU", receipt.sku, id: "sku")
                    field("Category", receipt.category, id: "category")
                }
                Section("Actor and wallet") {
                    field("Actor", receipt.actor.rawValue, id: "actor")
                    field("Wallet", receipt.wallet, id: "wallet")
                    field("Agent", receipt.agent, id: "agent")
                    field("Session", receipt.session, id: "session")
                }
                Section("Rail and context") {
                    field("Rail", receipt.rail, id: "rail")
                    field("Portal", receipt.portal, id: "portal")
                    field("Call kind", receipt.callKind, id: "callKind")
                    field("Detail", receipt.detail, id: "detail")
                    field("Potential use", receipt.potentialUse, id: "potentialUse")
                    field("What changed", receipt.whatChanged, id: "whatChanged")
                }
                Section("Fictional proof — not a transaction") {
                    field("Network", receipt.proof.network, id: "network")
                    field("Owner", receipt.proof.owner, id: "owner")
                    field("Open transaction", receipt.proof.openTransaction, id: "openTransaction")
                    field("Settle transaction", receipt.proof.settleTransaction, id: "settleTransaction")
                    field("Open slot", receipt.proof.openSlot.map(String.init), id: "openSlot")
                    field("Settle slot", receipt.proof.settleSlot.map(String.init), id: "settleSlot")
                    field("Compute units", receipt.proof.computeUnits.map(String.init), id: "computeUnits")
                    field("Settlement error", receipt.proof.settlementError, id: "settlementError")
                    field("Stream", receipt.proof.stream, id: "stream")
                    field("Escrow account", receipt.proof.escrowAccount, id: "escrowAccount")
                    field("Capture micro-units (DEMO_USDC)", receipt.proof.captureMicroUnits.map(String.init), id: "captureMicroUnits")
                    field("Owner before", receipt.proof.ownerBefore, id: "ownerBefore")
                    field("Owner after", receipt.proof.ownerAfter, id: "ownerAfter")
                    field("Escrow before", receipt.proof.escrowBefore, id: "escrowBefore")
                    field("Escrow after", receipt.proof.escrowAfter, id: "escrowAfter")
                    field("Platform before", receipt.proof.platformBefore, id: "platformBefore")
                    field("Platform after", receipt.proof.platformAfter, id: "platformAfter")
                    field("Scheme", receipt.proof.scheme, id: "scheme")
                    field("Pay to", receipt.proof.payTo, id: "payTo")
                    field("Facilitator (display only)", receipt.proof.facilitator?.absoluteString, id: "facilitator")
                }
            }
        }.navigationTitle("Receipt detail").navigationBarTitleDisplayMode(.inline)
    }
    @ViewBuilder private func field(_ title: String, _ value: String?, id: String) -> some View {
        if let value {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.body.monospaced()).textSelection(.enabled)
                    .accessibilityIdentifier("receipt.field." + id)
            }.padding(.vertical, 3)
        }
    }
}
