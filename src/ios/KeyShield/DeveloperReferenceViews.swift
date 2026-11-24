import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum ProxyExample: String, CaseIterable, Identifiable {
    case curl, python, javascript

    var id: Self { self }

    var title: String {
        switch self {
        case .curl: return "cURL · OpenAI models"
        case .python: return "Python · OpenRouter chat"
        case .javascript: return "JavaScript · OpenAI models"
        }
    }

    var source: String {
        let token = "<YOUR_AGENT_TOKEN>"
        let proxy = "https://keyshield.example/vproxy"
        switch self {
        case .curl:
            return #"""
            curl --fail-with-body "\#(proxy)/openai/v1/models" \
              -H "Authorization: Bearer \#(token)"
            """#
        case .python:
            return #"""
            import requests

            response = requests.post(
                "\#(proxy)/openrouter/api/v1/chat/completions",
                headers={"Authorization": "Bearer \#(token)"},
                json={
                    "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
                    "messages": [{"role": "user", "content": "Say hello."}],
                },
            )
            response.raise_for_status()
            print(response.json())
            """#
        case .javascript:
            return #"""
            const response = await fetch(
              "\#(proxy)/openai/v1/models",
              { headers: { Authorization: "Bearer \#(token)" } },
            );
            if (!response.ok) throw new Error(String(response.status));
            console.log(await response.json());
            """#
        }
    }
}

struct DeveloperReferenceView: View {
    var body: some View {
        List {
            Section {
                Label("Web proxy reference only", systemImage: "terminal")
                    .foregroundStyle(ShieldTheme.accent)
                Text("This iOS tester cannot connect to a hosted proxy, mint web tokens, or run these examples. Its local agent sessions are not web tokens.")
                NavigationLink {
                    DocsAndTroubleshootingView()
                } label: {
                    Label("Docs & Troubleshooting", systemImage: "book")
                }
                .accessibilityIdentifier("developer.docs")
            }
            Section("Placeholder-only examples") {
                ForEach(ProxyExample.allCases) { example in
                    NavigationLink(example.title) { ProxyExampleView(example: example) }
                        .accessibilityIdentifier("developer.example.\(example.rawValue)")
                }
            }
            Section("Web token scope") {
                LabeledContent("Agent or owner", value: "/vproxy/* and /proxy/*")
                LabeledContent("Owner only", value: "/manage/*, /sessions/*, /agents/*")
                Text("Keep provider keys in the Vault UI, not in agent code. The hosted proxy cannot decrypt device-encrypted web Vault keys; those require a compatible local keyshield-proxy. The iOS vault is separate.")
            }
        }
        .navigationTitle("Developer")
    }
}

private struct ProxyExampleView: View {
    let example: ProxyExample
    @State private var copied = false

    var body: some View {
        List {
            Section {
                Text("Web reference only. The example host and agent token are placeholders. Nothing runs in KeyShield for iOS.")
            }
            Section("Request example") {
                Text(verbatim: example.source)
                    .font(.footnote.monospaced())
                    .accessibilityIdentifier("developer.example.source")
                Button("Copy example", systemImage: "document.on.document") {
                    UIPasteboard.general.setItems(
                        [[UTType.utf8PlainText.identifier: example.source]],
                        options: [.localOnly: true]
                    )
                    copied = true
                }
                .accessibilityIdentifier("developer.example.copy")
                if copied {
                    Label("Placeholder example copied", systemImage: "checkmark.circle")
                        .foregroundStyle(ShieldTheme.accent)
                }
            }
        }
        .navigationTitle(example.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct DocsAndTroubleshootingView: View {
    var body: some View {
        List {
            Section("Start here") {
                Text("This device-only tester uses synthetic data. It does not sync to the web dashboard or connect to real providers.")
                topic(.quickstart, icon: "checklist")
            }
            Section("Troubleshoot this tester") {
                topic(.approvals, icon: "lock.shield")
                topic(.simulation, icon: "testtube.2")
                topic(.recovery, icon: "arrow.counterclockwise")
            }
            Section("Web & desktop only") {
                topic(.webProxy, icon: "network")
                topic(.browser, icon: "puzzlepiece.extension")
                Text("Hosted sign-in, web agent registration, billing and x402, and browser autofill are not available in the iOS tester.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Docs & Troubleshooting")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func topic(_ topic: ReferenceHelpTopic, icon: String) -> some View {
        NavigationLink {
            ReferenceHelpView(topic: topic)
        } label: {
            Label(topic.title, systemImage: icon)
        }
        .accessibilityIdentifier("docs.topic.\(topic.rawValue)")
    }
}

private enum ReferenceHelpTopic: String {
    case quickstart, approvals, simulation, recovery, webProxy, browser

    var title: String {
        switch self {
        case .quickstart: return "iOS tester quickstart"
        case .approvals: return "Unlock and approvals"
        case .simulation: return "Provider and agent simulations"
        case .recovery: return "Backup and recovery"
        case .webProxy: return "Web proxy access and scope"
        case .browser: return "Legacy browser extension"
        }
    }

    var guidance: [(heading: String, body: String)] {
        switch self {
        case .quickstart:
            return [
                ("Use synthetic data only", "Create and unlock a local vault, then use Vault to add a synthetic fixture. This tester does not monitor your clipboard, auto-import browser keys, or accept production credentials."),
                ("Review permissions", "For each sensitive operation, check the approval prompt. Review local outcomes in Activity. For an encrypted backup, go to Settings → Backup & recovery.")
            ]
        case .approvals:
            return [
                ("If the vault locks", "Unlock with Face ID or device passcode. The vault locks when the app goes into the background or reaches its idle timeout."),
                ("Unavailable methods", "Session-code approval is unavailable until secure out-of-band issuance exists. Passkey support is not enabled in this tester. Simulator test authentication does not verify real Face ID.")
            ]
        case .simulation:
            return [
                ("No live provider calls", "Provider responses for api.provider.test are simulated on-device; other hosts are refused."),
                ("No agent transport", "In a Debug tester, Agents can simulate a request after you add a synthetic fixture. Review its host, method, and path before approving. A local session cannot be used in the web proxy examples.")
            ]
        case .recovery:
            return [
                ("If a device or vault is unavailable", "Use Settings → Restore encrypted backup with your encrypted backup and its passphrase. Restore replaces current entries after authentication."),
                ("If you cannot restore", "There is no server-side recovery, iCloud sync, or recovery phrase for this vault. See Settings → Lost a device? for local recovery and account safety guidance.")
            ]
        case .webProxy:
            return [
                ("Web only · HTTP 403 insufficient_scope", "A web agent token can call /vproxy/* and /proxy/*, but not owner routes like /manage/*, /sessions/*, or /agents/*. Keep owner credentials out of agent configuration."),
                ("Device-encrypted web Vault keys", "Use the web Vault UI to configure provider keys. The hosted proxy cannot decrypt those keys; use the local keyshield-proxy with a compatible web setup, not this iOS tester.")
            ]
        case .browser:
            return [
                ("Legacy / owner-only · desktop browser", "An old 1.2.4 extension can show Fill / Copy / Settings and a stale token box even after hosted sign-in. This can indicate the old extension lacks the session bridge."),
                ("Where to get help", "Use Docs & Troubleshooting in the web dashboard with the desktop browser. iOS cannot inspect, patch, or reload a browser extension. Do not paste a token into a stale popup or share credentials with support.")
            ]
        }
    }
}

private struct ReferenceHelpView: View {
    let topic: ReferenceHelpTopic

    var body: some View {
        List {
            ForEach(topic.guidance, id: \.heading) { item in
                Section(item.heading) {
                    Text(item.body)
                }
            }
        }
        .navigationTitle(topic.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
