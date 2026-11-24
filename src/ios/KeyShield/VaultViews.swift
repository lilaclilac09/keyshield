import SwiftUI
import UIKit

struct VaultView: View {
    @EnvironmentObject private var model: AppModel
    @State private var adding = false
    var body: some View {
        NavigationStack {
            Group {
                if model.entries.isEmpty {
                    ContentUnavailableView {
                        Label("Your vault is empty", systemImage: "key.horizontal")
                    } description: { Text("Save a synthetic API key. Its value stays encrypted and hidden until you approve access.") }
                    actions: { Button("Add key") { adding = true }.buttonStyle(.borderedProminent).accessibilityIdentifier("vault.add.empty") }
                } else {
                    List(model.entries, id: \.id) { entry in
                        NavigationLink { KeyDetailView(id: entry.id) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack { Text(entry.label).font(.headline); Spacer(); Text("v\(entry.version)").font(.caption.monospaced()).foregroundStyle(ShieldTheme.accent) }
                                Text(entry.provider).font(.subheadline).foregroundStyle(.secondary)
                                Text(entry.fingerprint).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }.padding(.vertical, 7)
                        }.accessibilityIdentifier("vault.entry.\(entry.label)")
                    }
                }
            }.navigationTitle("Vault").toolbar {
                ToolbarItem(placement: .primaryAction) { Button("Add key", systemImage: "plus") { adding = true }.accessibilityIdentifier("vault.add") }
            }.sheet(isPresented: $adding) { KeyEditorView() }
        }
    }
}

struct KeyEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var rotating: UUID? = nil
    @State private var label = ""
    @State private var value = ""
    @State private var conflict = false
    @State private var replacementLabel: String?
    @State private var failure: String?
    private var detection: KeyDetector.Detection? { KeyDetector().detect(value) }
    private var valid: Bool { detection != nil && value.hasPrefix("FAKE_KEYSHIELD_NOT_A_KEY::") && (rotating != nil || !label.trimmingCharacters(in: .whitespaces).isEmpty) }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if rotating == nil { TextField("Label", text: $label).accessibilityIdentifier("key.label") }
                    SecureField("Synthetic API key", text: $value).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("key.value")
                    Button("Paste", systemImage: "doc.on.clipboard") {
                        value = UIPasteboard.general.string ?? ""
                    }.accessibilityIdentifier("key.paste")
                    Label(detection.map { "Format detected: \($0.provider)" } ?? "Format not recognized", systemImage: detection == nil ? "questionmark.circle" : "checkmark.circle")
                        .font(.callout).foregroundStyle(detection == nil ? .secondary : ShieldTheme.accent).accessibilityIdentifier("key.detection")
                } header: { Text(rotating == nil ? "Explicit import" : "Replace secret") }
                footer: { Text("Synthetic fixture envelopes only. Paste is read only when you tap Paste. Saving never happens automatically.") }
                if rotating != nil { Text("Rotation creates a new version and revokes all agent sessions for this key.").font(.callout) }
                if let failure { Text(failure).foregroundStyle(.red).accessibilityIdentifier("key.error") }
                Button(rotating == nil ? "Save key" : "Confirm rotation") { save(.reject) }
                    .disabled(!valid).accessibilityIdentifier("key.save")
            }.navigationTitle(rotating == nil ? "Add key" : "Rotate key")
                .toolbar { KeyboardToolbar(); ToolbarItem(placement: .cancellationAction) { Button("Cancel") { value = ""; dismiss() }.accessibilityIdentifier("key.cancel") } }
                .confirmationDialog("Key already exists", isPresented: $conflict, titleVisibility: .visible) {
                    if replacementLabel != nil {
                        Button("Replace", role: .destructive) { save(.replace) }.accessibilityIdentifier("conflict.replace")
                    }
                    Button("Keep both") { save(.keepBoth) }.accessibilityIdentifier("conflict.keepBoth")
                    Button("Cancel", role: .cancel) {}.accessibilityIdentifier("conflict.cancel")
                } message: {
                    if let replacementLabel {
                        Text("Replace the saved key “\(replacementLabel)” or keep both entries.")
                    } else {
                        Text("This label or value matches multiple saved keys. Keep the existing keys and add a new entry, or cancel.")
                    }
                }
        }.interactiveDismissDisabled(false)
            .onChange(of: value) { _, _ in model.touch() }
            .onDisappear { value = "" }
    }
    private func save(_ resolution: DuplicateResolution) {
        do {
            if let rotating { try model.rotate(rotating, value: value) }
            else {
                switch try model.save(label: label.trimmingCharacters(in: .whitespaces), value: value, resolution: resolution) {
                case .saved: break
                case let .duplicate(id):
                    replacementLabel = model.entries.first(where: { $0.id == id })?.label
                    conflict = true
                    return
                case .ambiguousDuplicate:
                    replacementLabel = nil
                    conflict = true
                    return
                }
            }
            value = ""; dismiss()
        } catch { failure = "Could not save this key. Check the synthetic format and vault access." }
    }
}

struct KeyDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let id: UUID
    @State private var rotating = false
    @State private var deleting = false
    private var entry: VaultEntry? { model.entries.first { $0.id == id } }
    var body: some View {
        List {
            if let entry {
                Section("Key metadata") {
                    LabeledContent("Provider", value: entry.provider)
                    LabeledContent("Fingerprint", value: entry.fingerprint).font(.callout.monospaced())
                    HStack { Text("Version"); Spacer(); Text("\(entry.version)").accessibilityIdentifier("detail.version.value") }
                }
                Section {
                    if let value = model.revealed[id] {
                        Text(value).font(.caption.monospaced()).textSelection(.disabled).accessibilityIdentifier("detail.secret")
                        Text("Hides automatically after 30 seconds or when locked.").font(.caption).foregroundStyle(.secondary)
                    } else { Text("••••••••••••••••").font(.title.monospaced()).foregroundStyle(.secondary) }
                    Button("Reveal", systemImage: "eye") { model.request(Operation(kind: .reveal, keyId: id)) }.accessibilityIdentifier("detail.reveal")
                    Button("Copy", systemImage: "doc.on.doc") { model.request(Operation(kind: .copy, keyId: id)) }.accessibilityIdentifier("detail.copy")
                    if let expiry = model.clipboardExpires, expiry > model.now {
                        Text("Clipboard clears in \(max(0, Int(ceil(expiry.timeIntervalSince(model.now)))))s").foregroundStyle(ShieldTheme.accent).accessibilityIdentifier("detail.clipboard")
                    }
                } header: { Text("Approval required") }
                Section("Manage") {
                    Button("Rotate key", systemImage: "arrow.triangle.2.circlepath") { rotating = true }.accessibilityIdentifier("detail.rotate")
                    #if DEBUG
                        Button("Request simulated provider call", systemImage: "network") {
                            model.request(Operation(kind: .providerRequest, keyId: id, host: "api.provider.test", method: "POST", path: "/v1/mock"))
                        }.accessibilityIdentifier("detail.provider")
                    #endif
                    Button("Delete key", role: .destructive) { deleting = true }.accessibilityIdentifier("detail.delete")
                }
            }
        }.navigationTitle(entry?.label ?? "Key").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $rotating) { KeyEditorView(rotating: id) }
            .alert("Delete this key?", isPresented: $deleting) {
                Button("Cancel", role: .cancel) {}.accessibilityIdentifier("delete.cancel")
                Button("Delete", role: .destructive) { model.delete(id); if model.error == nil { dismiss() } }.accessibilityIdentifier("delete.confirm")
            } message: { Text("This removes the encrypted key and revokes its agent sessions. This cannot be undone without a backup.") }
    }
}

struct ApprovalView: View {
    @EnvironmentObject private var model: AppModel
    let item: DisplayApproval
    @State private var message: String?
    @State private var busy = false
    private var remaining: Int { max(0, Int(ceil(item.expires.timeIntervalSince(model.now)))) }
    var body: some View {
        NavigationStack {
            Form {
                Section("You are approving exactly this operation") {
                    #if SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)
                    if item.isSimulatorDemo {
                        LabeledContent("Requester", value: SimulatorApprovalDemo.requester)
                            .accessibilityIdentifier("approvalDemo.requester")
                        LabeledContent("Action", value: "Run one mock operation")
                        LabeledContent("Entry", value: SimulatorApprovalDemo.entryLabel)
                            .accessibilityIdentifier("approvalDemo.entry")
                        Text("Simulator-only. The agent receives only an approved status.")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        LabeledContent("Action", value: item.operation.kind.rawValue)
                        LabeledContent("Key", value: model.entries.first { $0.id == item.operation.keyId }?.label ?? "Unknown")
                    }
                    #else
                    LabeledContent("Action", value: item.operation.kind.rawValue)
                    LabeledContent("Key", value: model.entries.first { $0.id == item.operation.keyId }?.label ?? "Unknown")
                    #endif
                    Text(item.operation.keyId.uuidString).font(.caption.monospaced()).foregroundStyle(.secondary)
                    HStack { Text("Host"); Spacer(); Text(item.operation.host ?? "On this device").accessibilityIdentifier("approval.host") }
                    LabeledContent("Method", value: item.operation.method ?? "Not applicable")
                    LabeledContent("Path", value: item.operation.path ?? "Not applicable")
                }
                Section {
                    Button("Approve with Face ID / passcode", systemImage: "faceid") {
                        busy = true
                        Task {
                            do { try await model.approveBiometric() }
                            catch { message = "Device authentication failed or approval expired. Deny and try again." }
                            busy = false
                        }
                    }.disabled(busy || remaining == 0).accessibilityIdentifier("approval.biometric")
                    Button("Session code — unavailable until secure out-of-band issuance") {}
                        .disabled(true).accessibilityIdentifier("approval.useCode")
                    if remaining == 0 { Text("Approval expired. Deny and start again.").foregroundStyle(.orange) }
                    if let message { Text(message).foregroundStyle(.orange).accessibilityIdentifier("approval.message") }
                    Button("Passkey (requires signed build with associated domain)") {}.disabled(true).accessibilityIdentifier("approval.passkey")
                }
            }.navigationTitle("Approve operation").navigationBarTitleDisplayMode(.inline)
                .toolbar { KeyboardToolbar(); ToolbarItem(placement: .cancellationAction) { Button("Deny", role: .cancel) { model.denyApproval() }.accessibilityIdentifier("approval.deny") } }
        }.interactiveDismissDisabled(busy)
    }
}
