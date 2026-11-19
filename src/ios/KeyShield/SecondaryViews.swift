import SwiftUI
import UniformTypeIdentifiers

struct AgentsView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Agents receive permission, never the key.").font(.headline)
                    Text("No agent transport is connected on iOS. A session allows only its approved HTTPS host, method, and path.").font(.callout).foregroundStyle(.secondary)
                    #if DEBUG
                        Button("Simulate agent request", systemImage: "play.rectangle") { model.simulateAgent() }.accessibilityIdentifier("agents.simulate")
                    #endif
                }
                #if SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)
                Section("Simulator-only approval demo") {
                    Text("An in-process demo with one synthetic vault entry and no external connections.")
                        .font(.callout).foregroundStyle(.secondary)
                    if let demo = model.simulatorDemo {
                        Text(SimulatorApprovalDemo.requester).font(.headline)
                        Text("\(SimulatorApprovalDemo.entryLabel) · \(SimulatorApprovalDemo.method) \(SimulatorApprovalDemo.path)")
                            .font(.callout)
                        Button("Request mock operation", systemImage: "play.rectangle") { model.requestSimulatorDemoApproval() }
                            .disabled(demo.pendingID != nil).accessibilityIdentifier("approvalDemo.request")
                        if let outcome = demo.outcome {
                            switch outcome {
                            case let .approved(receipt):
                                Label("Agent receipt: \(receipt.rawValue)", systemImage: "checkmark.circle")
                                    .accessibilityIdentifier("approvalDemo.receipt")
                            case .notApproved:
                                Text("Not approved. No approval sent to the demo agent.")
                                    .accessibilityIdentifier("approvalDemo.denied")
                            }
                        }
                        Button("Turn off demo") { model.disableSimulatorDemo() }
                            .disabled(demo.pendingID != nil).accessibilityIdentifier("approvalDemo.disable")
                    } else {
                        Button("Enable demo and prepare fixture") { model.enableSimulatorDemo() }
                            .accessibilityIdentifier("approvalDemo.enable")
                    }
                }
                #endif
                Section("Pending requests") {
                    if let id = model.pendingAgent {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("key-alpha · \(model.entries.first { $0.id == id }?.label ?? "Key")").font(.headline)
                            Text("api.provider.test\nPOST /v1/mock").font(.callout.monospaced())
                            Button("Review request") {
                                model.request(Operation(kind: .agentToken, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock"))
                            }.buttonStyle(.borderless).accessibilityIdentifier("agents.review")
                            Button("Deny request", role: .destructive) { model.pendingAgent = nil }.buttonStyle(.borderless).accessibilityIdentifier("agents.deny")
                        }
                    } else { Text("No pending requests").foregroundStyle(.secondary) }
                }
                Section("Sessions") {
                    if model.activeSessions.isEmpty { Text("No active sessions").foregroundStyle(.secondary) }
                    ForEach(model.activeSessions) { session in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("ks_sess_…").font(.headline.monospaced())
                            Text("api.provider.test · POST /v1/mock").font(.caption.monospaced())
                            Text(model.entries.first { $0.id == session.keyId }?.label ?? "Removed key").font(.caption).foregroundStyle(.secondary)
                            if session.revoked {
                                Text("Revoked").foregroundStyle(.orange).accessibilityIdentifier("session.revoked")
                            } else if session.expires <= model.now {
                                Text("Expired").foregroundStyle(.secondary)
                            } else {
                                Text("Expires in \(Int(ceil(session.expires.timeIntervalSince(model.now))))s").font(.caption.monospacedDigit())
                                Button("Revoke", role: .destructive) { model.revoke(session.id) }.accessibilityIdentifier("session.revoke")
                            }
                        }.padding(.vertical, 5)
                    }
                    if !model.activeSessions.isEmpty { Button("Revoke all", role: .destructive) { model.revokeAll() }.accessibilityIdentifier("sessions.revokeAll") }
                }
            }.navigationTitle("Agents")
        }
    }
}

struct ActivityView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("A record of permission").font(.headline)
                    Text("Encrypted on this device. No keys, session codes, or tokens are recorded.").font(.callout).foregroundStyle(.secondary)
                    Button("Export activity", systemImage: "square.and.arrow.up") { model.exportActivity() }.disabled(!model.unlocked).accessibilityIdentifier("activity.export")
                    if let url = model.activityURL { ShareLink("Share activity file", item: url).accessibilityIdentifier("activity.share") }
                }
                if model.events.isEmpty { Text("No activity yet").foregroundStyle(.secondary) }
                ForEach(model.events.reversed(), id: \.id) { event in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack { Text(event.action.rawValue.capitalized).font(.headline); Spacer(); Text(event.outcome.rawValue).font(.caption).foregroundStyle(ShieldTheme.accent) }
                        Text(actor(event.actor)).font(.caption).foregroundStyle(.secondary)
                        Text(event.time, style: .date).font(.caption).foregroundStyle(.secondary)
                        if let id = event.keyId { Text("Key · " + String(id.uuidString.prefix(8))).font(.caption.monospaced()).foregroundStyle(.secondary) }
                    }.padding(.vertical, 4)
                }
            }.navigationTitle("Activity").onAppear { model.refresh() }
        }
    }
    private func actor(_ value: AuditEvent.Actor) -> String {
        switch value { case .human: return "Human"; case .agent(let id): return "Agent · " + String(id.uuidString.prefix(8)) }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var backupMode: BackupMode?
    @State private var recovery = false
    @State private var lostDevice = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Synthetic-only tester build", systemImage: "testtube.2").foregroundStyle(ShieldTheme.accent)
                    Text("Do not import production credentials. No cloud sync, agent transport, or passkey registration is available in this build.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Security") {
                    Button("Lock now", systemImage: "lock.fill") { model.lockNow() }.accessibilityIdentifier("settings.lock")
                    Button("Passkey (requires signed build with associated domain)") {}.disabled(true).accessibilityIdentifier("settings.passkey")
                }
                Section("Backup & recovery") {
                    Button("Encrypted backup export", systemImage: "square.and.arrow.up") { backupMode = .export }.accessibilityIdentifier("settings.backup")
                    Button("Restore encrypted backup", systemImage: "arrow.counterclockwise") { backupMode = .restore }.accessibilityIdentifier("settings.restore")
                    Button("Recovery information", systemImage: "key.viewfinder") { recovery = true }.accessibilityIdentifier("settings.recovery")
                    Button("Lost a device?", systemImage: "iphone.slash") { lostDevice = true }.accessibilityIdentifier("settings.lostDevice")
                }
                Section("Policy · read only") {
                    LabeledContent("Session TTL", value: "\(Int(model.policy.sessionTTL))s")
                    LabeledContent("Code TTL", value: "\(Int(model.policy.codeTTL))s")
                    LabeledContent("Code attempt limit", value: "\(model.policy.codeAttemptLimit)")
                    LabeledContent("Code lockout", value: "\(Int(model.policy.lockout))s")
                    LabeledContent("Clipboard clear", value: "\(Int(model.policy.clipboardClear))s")
                    LabeledContent("Idle lock", value: "\(Int(model.policy.idleLock))s")
                    ForEach(model.policy.approvedProviders, id: \.self) { Text($0).font(.caption.monospaced()) }
                }
            }.navigationTitle("Settings")
                .sheet(item: $backupMode) { BackupView(mode: $0) }
                .sheet(isPresented: $recovery) { RecoveryInfoView(lostDevice: false) }
                .sheet(isPresented: $lostDevice) { RecoveryInfoView(lostDevice: true) }
        }
    }
}

enum BackupMode: String, Identifiable { case export, restore; var id: String { rawValue } }

struct BackupView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let mode: BackupMode
    @State private var passphrase = ""
    @State private var selectedURL: URL?
    @State private var importing = false
    @State private var message: String?
    @State private var succeeded = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(mode == .export ? "Your backup contains encrypted entries only — never agent sessions or tokens." : "Restore replaces the vault entries only after the backup authenticates. Cancel leaves your vault unchanged.")
                    SecureField("Backup passphrase", text: $passphrase).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("backup.passphrase")
                } footer: { Text("Keep your passphrase in a password manager. KeyShield cannot recover it.") }
                if mode == .restore {
                    Section("Choose encrypted backup") {
                        Button("Choose backup file") { importing = true }.accessibilityIdentifier("backup.choose")
                        if let url = model.backupURL {
                            Button("Use last exported backup") { selectedURL = url }.accessibilityIdentifier("backup.useLast")
                        }
                        if let selectedURL { Text(selectedURL.lastPathComponent).font(.caption).accessibilityIdentifier("backup.selected") }
                    }
                }
                Button(mode == .export ? "Export encrypted backup" : "Confirm restore") {
                    do {
                        if mode == .export { try model.exportBackup(passphrase: passphrase); message = "Encrypted backup ready to share." }
                        else {
                            guard let selectedURL else { return }
                            let result = try model.restore(selectedURL, passphrase: passphrase)
                            message = result == .restored
                                ? "Vault restored successfully. Agent sessions were revoked."
                                : "Vault restored and agent sessions revoked, but the activity event could not be recorded."
                        }
                        succeeded = true; passphrase = ""
                    } catch {
                        succeeded = false
                        message = mode == .restore ? "Restore failed: wrong passphrase or corrupt backup. Vault unchanged." : "Backup export failed. Check vault access and available storage."
                    }
                }.disabled(passphrase.isEmpty || (mode == .restore && selectedURL == nil)).accessibilityIdentifier("backup.submit")
                if let message { Text(message).foregroundStyle(succeeded ? ShieldTheme.accent : .orange).accessibilityIdentifier("backup.message") }
                if mode == .export, let url = model.backupURL { ShareLink("Share encrypted backup", item: url).accessibilityIdentifier("backup.share") }
            }.navigationTitle(mode == .export ? "Encrypted backup" : "Restore backup")
                .toolbar { KeyboardToolbar(); ToolbarItem(placement: .cancellationAction) { Button("Cancel") { passphrase = ""; dismiss() }.accessibilityIdentifier("backup.cancel") } }
                .fileImporter(isPresented: $importing, allowedContentTypes: [.data]) { result in
                    switch result {
                    case .success(let url): selectedURL = url
                    case .failure: message = "Could not open the selected backup."
                    }
                }
        }.onDisappear { passphrase = "" }.onChange(of: passphrase) { _, _ in model.touch() }
    }
}

struct RecoveryInfoView: View {
    @Environment(\.dismiss) private var dismiss
    let lostDevice: Bool
    var body: some View {
        NavigationStack {
            List {
                if lostDevice {
                    Section("Lost a device with KeyShield?") { Text("Here's how to recover access and limit what the lost device can still do.") }
                    Section("1 · Restore your vault here") { Text("Use an encrypted backup and its passphrase. The vault decrypts locally. This native tester build does not generate or restore 24-word recovery phrases.") }
                    Section("2 · Secure your device accounts") { Text("Use Find My to lock or erase the lost device. Review iCloud Keychain and remove the lost device from your Apple Account.") }
                    Section("3 · Cut off the lost device") { Text("Rotate credentials at each provider. This local-only build cannot remotely revoke another device or its vault. Revoke agent sessions on every device you still control.") }
                } else {
                    Section("Save your recovery backup") { Text("Store your encrypted backup and passphrase safely in a password manager. Anyone with both can access your vault.") }
                    Section("Recovery phrase") { Text("The companion app uses a 24-word recovery phrase. Phrase recovery and passkey enrollment are not available in this native tester build. Use encrypted backup export instead; no recovery phrase is generated here.") }
                    Section("No server-side recovery") { Text("KeyShield cannot decrypt your vault or recover a forgotten backup passphrase. Verify your backup before relying on it.") }
                }
            }.navigationTitle(lostDevice ? "Lost device" : "Recovery")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.accessibilityIdentifier("recovery.done") } }
        }
    }
}
