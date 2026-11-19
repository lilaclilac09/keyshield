import SwiftUI
import UIKit

struct KeyboardToolbar: ToolbarContent {
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Done") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }.accessibilityIdentifier("keyboard.done")
        }
    }
}

enum ShieldTheme {
    static let background = Color(red: 0.035, green: 0.055, blue: 0.12)
    static let accent = Color(red: 0.50, green: 0.81, blue: 0.72)
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var phase
    @State private var createConfirmation = false
    @State private var tab = 0
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if !model.created { onboarding }
            else if !model.unlocked { locked }
            else {
                VStack(spacing: 0) {
                    HStack {
                        Image(systemName: "lock.shield.fill").foregroundStyle(ShieldTheme.accent)
                        Text("Session · \(model.lock.secondsUntilLock)s until idle lock").font(.caption.monospacedDigit())
                        Spacer()
                        Button("Lock", systemImage: "lock") { model.lockNow() }.labelStyle(.iconOnly).accessibilityIdentifier("session.lock")
                    }.padding(.horizontal).padding(.vertical, 10).background(.ultraThinMaterial)
                    TabView(selection: $tab) {
                        HomeView(tab: $tab).tabItem { Label("Home", systemImage: "square.grid.2x2") }.tag(0)
                        VaultView().tabItem { Label("Vault", systemImage: "key.horizontal") }.tag(1)
                        AgentsView().tabItem { Label("Agents", systemImage: "person.crop.rectangle.stack") }.tag(2)
                        ActivityView().tabItem { Label("Activity", systemImage: "clock.arrow.circlepath") }.tag(3)
                        SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }.tag(4)
                    }
                    .onChange(of: tab) { _, _ in model.touch() }
                }
                .sheet(item: $model.approval, onDismiss: { model.denyApproval() }) { item in ApprovalView(item: item) }
            }
        }
        .tint(ShieldTheme.accent)
        .onReceive(ticker) { _ in model.tick() }
        .onChange(of: phase) { _, value in if value == .background { model.lockNow() } }
        .alert("KeyShield", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }.accessibilityIdentifier("error.dismiss")
        } message: { Text(model.error ?? "") }
    }
    private var onboarding: some View {
        ZStack {
            ShieldTheme.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 25) {
                Spacer()
                Image(systemName: "lock.shield").font(.system(size: 64, weight: .light)).foregroundStyle(ShieldTheme.accent)
                Text("YOUR KEYS.\nYOUR PERMISSION.").font(.system(size: 35, weight: .bold, design: .rounded))
                Text("Set up your vault").font(.title2.bold())
                Text("Store synthetic API keys encrypted on this device. Every reveal, copy, and agent session needs your approval.").foregroundStyle(.secondary)
                Text("Nothing is created until you confirm.").font(.callout)
                Button("Create vault") { createConfirmation = true }.buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("onboarding.create")
                Spacer()
                Text("SYNTHETIC-ONLY TESTER BUILD\nNo cloud sync. No real credentials.").font(.caption.monospaced()).foregroundStyle(.secondary)
            }.padding(30)
        }
        .sheet(isPresented: $createConfirmation) {
            NavigationStack {
                Form {
                    Section("Create an encrypted vault?") {
                        Text("A device-only encryption key will be saved in Keychain. Keep an encrypted backup and its passphrase somewhere safe.")
                    }
                    Button("Confirm create vault") { createConfirmation = false; model.create() }.accessibilityIdentifier("onboarding.confirm")
                }.navigationTitle("Create vault").toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { createConfirmation = false }.accessibilityIdentifier("onboarding.cancel") }
                }
            }.presentationDetents([.medium])
        }
    }
    private var locked: some View {
        ZStack {
            ShieldTheme.background.ignoresSafeArea()
            VStack(spacing: 22) {
                Image(systemName: "lock.shield.fill").font(.system(size: 64)).foregroundStyle(ShieldTheme.accent)
                Text("Welcome back").font(.largeTitle.bold())
                Text(model.notice ?? "Unlock your vault to view or use your stored API keys.").multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("Unlock with Face ID / passcode") { Task { await model.unlock() } }.buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("lock.unlock")
                Text("Device-owner authentication · LocalAuthentication\nPasskey support requires a signed build.").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }.padding(30)
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var tab: Int
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("DEVICE VAULT / OVERVIEW").font(.caption.monospaced()).foregroundStyle(ShieldTheme.accent)
                    Text("A key stays private.\nYou stay in control.").font(.largeTitle.bold())
                    HStack(spacing: 14) {
                        metric("Saved keys", value: "\(model.entries.count)", icon: "key.fill")
                        metric("Active sessions", value: "\(model.activeSessions.filter { !$0.revoked && $0.expires > model.now }.count)", icon: "person.crop.rectangle.stack.fill")
                    }
                    Label("Encrypted on this device", systemImage: "checkmark.shield.fill").foregroundStyle(ShieldTheme.accent)
                    Text("Saved keys are hidden until you reveal them. Agent access is scoped to a single provider, method, and path.").foregroundStyle(.secondary)
                    Button { tab = 1 } label: { Label("Open your vault", systemImage: "arrow.right") }.buttonStyle(.borderedProminent).accessibilityIdentifier("home.vault")
                    Divider()
                    Text("PERMISSION, NOT POSSESSION").font(.caption.monospaced()).foregroundStyle(.secondary)
                    Text("No agent transport is connected. This tester build uses synthetic credentials only; it does not connect to real providers.").font(.callout)
                }.padding(24)
            }.navigationTitle("KeyShield")
        }
    }
    private func metric(_ title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon).foregroundStyle(ShieldTheme.accent)
            Text(value).font(.largeTitle.bold().monospacedDigit())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20).background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 20))
    }
}
